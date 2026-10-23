#!/usr/bin/env node
// End-to-end test of three-tier tokens, push protection and the /~mio/ console
// against a local `wrangler dev` (miniflare). Everything is throwaway: a fresh
// persist dir, a random admin git token, a random console password, and a
// locally generated RSA key standing in for Cloudflare Access.
//
//   npm run test:e2e
//
// Tiny repositories only (a handful of objects), so it stays far away from any
// Durable Object row budget even if pointed at a real deployment.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, createSign, randomBytes, webcrypto } from "node:crypto";

const PORT = 8790 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const TEAM = "test-team.cloudflareaccess.com";
const AUD = "test-aud-" + randomBytes(6).toString("hex");
const ADMIN_TOKEN = "adm_" + randomBytes(18).toString("base64url");
const CONSOLE_PASS = randomBytes(18).toString("base64url");
const tmp = mkdtempSync(join(tmpdir(), "miogit-e2e-"));

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ok   ${m}`); };
const bad = (m) => { fail++; console.log(`  FAIL ${m}`); };
const check = (cond, m) => (cond ? ok(m) : bad(m));

// ---- Access stand-in --------------------------------------------------------
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const b64u = (b) => Buffer.from(b).toString("base64url");
function jwt(claims = {}, key = privateKey, kid = "k1") {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const p = b64u(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}`, exp: now + 600, iat: now, nbf: now - 5, email: "owner@example.com", ...claims }));
  const s = createSign("RSA-SHA256").update(`${h}.${p}`).sign(key);
  return `${h}.${p}.${b64u(s)}`;
}
const ACCESS = jwt();

async function hashPassword(pw) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await webcrypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return `pbkdf2-sha256$100000$${b64u(salt)}$${b64u(bits)}`;
}

// ---- server -------------------------------------------------------------------
const vars = {
  GIT_TOKEN: ADMIN_TOKEN,
  ADMIN_PASSWORD_HASH: await hashPassword(CONSOLE_PASS),
  ACCESS_TEAM_DOMAIN: TEAM,
  ACCESS_AUD: AUD,
  ACCESS_JWKS: JSON.stringify({ keys: [jwk] }),
};
const args = ["wrangler", "dev", "-c", "wrangler.test.jsonc", "--local", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", join(tmp, "state"), "--show-interactive-dev-session=false"];
for (const [k, v] of Object.entries(vars)) args.push("--var", `${k}:${v}`);
const env0 = { ...process.env, NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost", WRANGLER_SEND_METRICS: "false", CI: "1" };
const server = spawn("npx", args, { env: env0, stdio: ["ignore", "pipe", "pipe"], detached: true });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
// kill the whole process group (npx -> wrangler -> workerd), or workerd outlives the test
const cleanup = () => { try { process.kill(-server.pid, "SIGKILL"); } catch {} };
process.on("exit", cleanup);

for (let i = 0; ; i++) {
  try { const r = await fetch(`${BASE}/robots.txt`); if (r.ok) break; } catch {}
  if (i > 120) { console.log(serverLog.slice(-3000)); throw new Error("wrangler dev did not start"); }
  await new Promise((r) => setTimeout(r, 500));
}

// ---- helpers --------------------------------------------------------------------
const gitEnv = { ...env0, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", HOME: tmp, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@e" };
function git(cwd, ...a) {
  try {
    const out = execFileSync("git", ["-c", "credential.helper=", "-c", "init.defaultBranch=main", ...a], { cwd, env: gitEnv, stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out: out.toString() };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "") };
  }
}
const url = (tok, repo) => `http://x:${encodeURIComponent(tok)}@127.0.0.1:${PORT}/${repo}.git`;
function commit(dir, file, content, msg) {
  writeFileSync(join(dir, file), content);
  git(dir, "add", "-A");
  return git(dir, "commit", "-qm", msg);
}
const basic = (tok) => ({ authorization: "Basic " + Buffer.from(`x:${tok}`).toString("base64") });
const H = (extra = {}) => ({ "cf-access-jwt-assertion": ACCESS, ...extra });

let cookie = "";
async function consoleGet(path, extra = {}) {
  return fetch(`${BASE}${path}`, { redirect: "manual", headers: H({ cookie, ...extra }) });
}
async function consolePost(path, form, extra = {}) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: H({ cookie, origin: BASE, "content-type": "application/x-www-form-urlencoded", ...extra }),
    body: new URLSearchParams(form).toString(),
  });
}
const csrfOf = (html) => /name='csrf' value='([^']+)'/.exec(html)?.[1] ?? "";
const takeCookie = (res) => {
  const sc = res.headers.get("set-cookie") ?? "";
  const m = /mg_admin=([^;]*)/.exec(sc);
  if (m) cookie = `mg_admin=${m[1]}`;
  return sc;
};

try {
  console.log("== admin token: create repos (push to a new name)");
  const src = join(tmp, "src");
  git(tmp, "init", "-q", src);
  commit(src, "a.txt", "one\n", "c1");
  check(git(src, "push", "-q", url(ADMIN_TOKEN, "permtest"), "main").code === 0, "admin pushes new repo permtest (main)");
  git(src, "checkout", "-qb", "adminbranch");
  commit(src, "b.txt", "admin\n", "c-admin");
  check(git(src, "push", "-q", url(ADMIN_TOKEN, "permtest"), "adminbranch").code === 0, "admin pushes adminbranch");
  git(src, "checkout", "-q", "main");
  for (const r of ["mio-cli", "MioUI-shopify-admin"]) check(git(src, "push", "-q", url(ADMIN_TOKEN, r), "main").code === 0, `admin creates ${r}`);

  console.log("== Access gate on /~mio/");
  check((await fetch(`${BASE}/~mio/login`, { redirect: "manual" })).status === 403, "no Access JWT -> 403");
  check((await fetch(`${BASE}/~mio/login`, { headers: { "cf-access-jwt-assertion": jwt({ aud: ["other"] }) } })).status === 403, "wrong AUD -> 403");
  check((await fetch(`${BASE}/~mio/login`, { headers: { "cf-access-jwt-assertion": jwt({ exp: 1 }) } })).status === 403, "expired JWT -> 403");
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  check((await fetch(`${BASE}/~mio/login`, { headers: { "cf-access-jwt-assertion": jwt({}, other) } })).status === 403, "forged signature -> 403");
  check((await fetch(`${BASE}/~mio/login`, { headers: H() })).status === 200, "valid JWT -> login page 200");
  check((await fetch(`${BASE}/%7Emio/login`, { redirect: "manual" })).headers.get("location")?.endsWith("/~mio/login"), "/%7Emio -> 301 to /~mio");
  const legacy = await fetch(`${BASE}/login`, { redirect: "manual" });
  check(legacy.status === 302 && legacy.headers.get("location") === "/~mio/login", "legacy /login -> 302 /~mio/login");
  check((await fetch(`${BASE}/login`, { method: "POST", redirect: "manual", body: "password=" + ADMIN_TOKEN })).status === 302, "legacy POST /login does not authenticate (302)");

  console.log("== repo paths unaffected by the console prefix");
  for (const r of ["mio-cli", "MioUI-shopify-admin"]) {
    check((await fetch(`${BASE}/${r}/`)).status === 200, `/${r}/ page 200 without Access`);
    check((await fetch(`${BASE}/${r}.git/info/refs?service=git-upload-pack`)).status === 200, `/${r}.git/info/refs 200 without Access`);
  }
  check(git(tmp, "clone", "-q", `${BASE}/MioUI-shopify-admin.git`, join(tmp, "c-mui")).code === 0, "anonymous clone of public MioUI-shopify-admin.git");
  check((await fetch(`${BASE}/~evil/`)).status === 404, "other ~ paths are 404, never a repository");

  console.log("== console login");
  const lp = await consolePost("/~mio/login", { username: "mio", password: ADMIN_TOKEN, next: "/~mio/" });
  check(lp.status === 401 && !lp.headers.get("set-cookie"), "admin git token cannot sign in to the console");
  const wrongUser = await consolePost("/~mio/login", { username: "admin", password: CONSOLE_PASS });
  check(wrongUser.status === 401, "wrong username refused");
  const li = await consolePost("/~mio/login", { username: "mio", password: CONSOLE_PASS, next: "/~mio/" });
  const sc = takeCookie(li);
  check(li.status === 303 && cookie, "console login with username/password");
  check(/Path=\/~mio\//.test(sc) && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Strict/.test(sc) && /Max-Age=\d+/.test(sc), "cookie: Path=/~mio/, HttpOnly, Secure, SameSite=Strict, Max-Age");
  const home = await consoleGet("/~mio/");
  const homeHtml = await home.text();
  check(home.status === 200 && homeHtml.includes("permtest"), "console home lists repos");
  check((await fetch(`${BASE}/~mio/`, { redirect: "manual", headers: { cookie } })).status === 403, "valid session but no Access JWT -> 403");

  console.log("== make permtest private (repo settings, CSRF)");
  const sp = await consoleGet("/~mio/repos/permtest");
  const csrf = csrfOf(await sp.text());
  check(sp.status === 200 && csrf, "settings page with CSRF token");
  check((await consolePost("/~mio/repos/permtest", { description: "x", private: "1" })).status === 403, "POST without CSRF -> 403");
  check((await consolePost("/~mio/repos/permtest", { csrf, description: "x", private: "1" }, { origin: "https://evil.example" })).status === 403, "cross-origin POST -> 403");
  check((await consolePost("/~mio/repos/permtest", { csrf, description: "perm test", private: "1" })).status === 303, "save settings (private)");
  check((await fetch(`${BASE}/permtest.git/info/refs?service=git-upload-pack`)).status === 401, "private repo: anonymous info/refs 401");
  check((await fetch(`${BASE}/permtest.git/info/refs?service=git-upload-pack`, { headers: { cookie } })).status === 401, "console cookie is not a git credential");
  check((await fetch(`${BASE}/permtest/config`, { method: "PUT", headers: basic(ADMIN_TOKEN), body: "{}" })).status === 404, "legacy PUT /<repo>/config gone (moved to console)");

  console.log("== web editor lives in the console");
  const legacyEdit = await fetch(`${BASE}/permtest/edit/a.txt?h=main`, { redirect: "manual", headers: basic(ADMIN_TOKEN) });
  check(legacyEdit.status === 303 && legacyEdit.headers.get("location") === "/~mio/edit/permtest/a.txt?h=main", "legacy editor URL -> /~mio/edit/…");
  const ep = await consoleGet("/~mio/edit/permtest/a.txt?h=main");
  const eh = await ep.text();
  const ecsrf = csrfOf(eh), base = /name='base' value='([0-9a-f]{40})'/.exec(eh)?.[1];
  check(ep.status === 200 && /action=["']\/~mio\/edit\/permtest["']/.test(eh) && ecsrf && base, "editor form posts to /~mio/edit with CSRF");
  check((await consolePost("/~mio/edit/permtest", { branch: "main", path: "a.txt", base, content: "edited\n", message: "web edit" })).status === 403, "editor POST without CSRF -> 403");
  const es = await consolePost("/~mio/edit/permtest", { csrf: ecsrf, branch: "main", path: "a.txt", base, content: "edited\n", message: "web edit" });
  check(es.status === 303, "editor commit via console");

  console.log("== create tokens");
  const tokens = {};
  for (const [name, role] of [["hark-writer", "writer"], ["hark-reader", "reader"], ["hark-writer2", "writer"]]) {
    const r = await consolePost("/~mio/tokens", { csrf, name, role });
    const html = await r.text();
    const m = /readonly value='(mgt_[A-Za-z0-9_-]+)'/.exec(html);
    check(r.status === 200 && m, `create ${role} token "${name}" (plaintext shown once)`);
    check((r.headers.get("cache-control") ?? "").includes("no-store"), "token reveal page is no-store");
    tokens[name] = m?.[1];
  }
  const list = await (await consoleGet("/~mio/tokens")).text();
  check(list.includes("hark-writer") && !list.includes(tokens["hark-writer"]), "token list shows names, never plaintext");
  const W = tokens["hark-writer"], R = tokens["hark-reader"], W2 = tokens["hark-writer2"];

  console.log("== reader");
  const rc = join(tmp, "reader");
  check(git(tmp, "clone", "-q", url(R, "permtest"), rc).code === 0, "reader clones private repo");
  commit(rc, "r.txt", "r\n", "reader commit");
  git(rc, "checkout", "-qb", "rfeat");
  const rp = git(rc, "push", url(R, "permtest"), "rfeat");
  check(rp.code !== 0 && /read-only token/.test(rp.out), "reader push refused (remote error: read-only token)");
  check((await fetch(`${BASE}/~mio/login`, { method: "POST", headers: H({ origin: BASE, "content-type": "application/x-www-form-urlencoded" }), body: `username=mio&password=${R}` })).status === 401, "reader token cannot sign in");

  console.log("== writer");
  const wc = join(tmp, "writer");
  check(git(tmp, "clone", "-q", url(W, "permtest"), wc).code === 0, "writer clones private repo");
  git(wc, "checkout", "-qb", "feat");
  commit(wc, "w.txt", "1\n", "w1");
  check(git(wc, "push", "-q", url(W, "permtest"), "feat").code === 0, "writer creates feature branch");
  commit(wc, "w.txt", "2\n", "w2");
  check(git(wc, "push", "-q", url(W, "permtest"), "feat").code === 0, "writer fast-forwards own branch");
  git(wc, "commit", "-q", "--amend", "-m", "w2 amended");
  check(git(wc, "push", "-q", "-f", url(W, "permtest"), "feat").code === 0, "writer force-pushes own branch");
  // main
  git(wc, "checkout", "-q", "main");
  commit(wc, "m.txt", "m\n", "to main");
  let r = git(wc, "push", url(W, "permtest"), "main");
  check(r.code !== 0 && /protected branch/.test(r.out), "writer push to main refused (ng protected branch)");
  git(wc, "reset", "-q", "--hard", "HEAD~1");
  git(wc, "commit", "-q", "--allow-empty", "-m", "diverge");
  r = git(wc, "push", "-f", url(W, "permtest"), "main");
  check(r.code !== 0 && /protected branch/.test(r.out), "writer force-push main refused");
  r = git(wc, "push", url(W, "permtest"), ":main");
  check(r.code !== 0 && /protected branch/.test(r.out), "writer delete main refused");
  // somebody else's branch
  git(wc, "fetch", "-q", url(W, "permtest"), "adminbranch:adminbranch");
  git(wc, "checkout", "-q", "adminbranch");
  commit(wc, "b.txt", "ff\n", "ff on admin branch");
  check(git(wc, "push", "-q", url(W, "permtest"), "adminbranch").code === 0, "writer fast-forwards a branch it did not create");
  git(wc, "commit", "-q", "--amend", "-m", "rewrite");
  r = git(wc, "push", "-f", url(W, "permtest"), "adminbranch");
  check(r.code !== 0 && /only force-push branches it created/.test(r.out), "writer force-push of others' branch refused");
  r = git(wc, "push", url(W, "permtest"), ":adminbranch");
  check(r.code !== 0 && /only delete branches it created/.test(r.out), "writer delete of others' branch refused");
  r = git(wc, "push", url(W2, "permtest"), ":feat");
  check(r.code !== 0 && /only delete branches it created/.test(r.out), "second writer cannot delete first writer's branch");
  // tags, new repos, atomicity
  git(wc, "tag", "v-w");
  r = git(wc, "push", url(W, "permtest"), "v-w");
  check(r.code !== 0 && /only push branches/.test(r.out), "writer tag push refused");
  r = git(wc, "push", url(W, "brand-new-repo"), "feat");
  check(r.code !== 0 && /cannot create repositories/.test(r.out), "writer push to a new repo name refused");
  check((await fetch(`${BASE}/brand-new-repo/`)).status === 404, "no repository was created");
  git(wc, "checkout", "-q", "feat");
  git(wc, "checkout", "-qb", "mixed");
  commit(wc, "x.txt", "x\n", "mixed");
  r = git(wc, "push", url(W, "permtest"), "mixed", "+HEAD:main");
  check(r.code !== 0 && /atomic push failed/.test(r.out), "mixed push (feature + main) refused as a whole");
  check(!/refs\/heads\/mixed/.test(git(tmp, "ls-remote", url(ADMIN_TOKEN, "permtest")).out), "…and the feature ref was not created");
  check(git(wc, "push", "-q", url(W, "permtest"), ":feat").code === 0, "writer deletes own branch");
  check((await fetch(`${BASE}/~mio/tokens`, { headers: { ...basic(W), "cf-access-jwt-assertion": ACCESS }, redirect: "manual" })).status === 303, "writer token gives no console access (redirect to login)");

  console.log("== admin keeps full control");
  const ac = join(tmp, "admin");
  git(tmp, "clone", "-q", url(ADMIN_TOKEN, "permtest"), ac);
  commit(ac, "a.txt", "two\n", "admin main");
  check(git(ac, "push", "-q", url(ADMIN_TOKEN, "permtest"), "main").code === 0, "admin pushes main");
  git(ac, "commit", "-q", "--amend", "-m", "admin rewrite");
  check(git(ac, "push", "-q", "-f", url(ADMIN_TOKEN, "permtest"), "main").code === 0, "admin force-pushes main");
  check(git(ac, "push", "-q", url(ADMIN_TOKEN, "permtest"), ":adminbranch").code === 0, "admin deletes a branch");
  git(ac, "tag", "v1");
  check(git(ac, "push", "-q", url(ADMIN_TOKEN, "permtest"), "v1").code === 0, "admin pushes a tag");
  check((await fetch(`${BASE}/api/repos`, { headers: basic(R) }).then((x) => x.json())).repos.some((x) => x.name === "permtest"), "reader token lists private repos via /api/repos");

  console.log("== revoke");
  const listHtml = await (await consoleGet("/~mio/tokens")).text();
  const id = new RegExp(`hark-writer</td>[\\s\\S]*?/~mio/tokens/([A-Za-z0-9_-]+)/revoke`).exec(listHtml)?.[1];
  const confirm = await consoleGet(`/~mio/tokens/${id}/revoke`);
  check(confirm.status === 200 && (await confirm.text()).includes("hark-writer"), "revoke confirmation dialog");
  check((await consolePost(`/~mio/tokens/${id}/revoke`, { csrf })).status === 303, "revoke");
  check(git(tmp, "ls-remote", url(W, "permtest")).code !== 0, "revoked writer token fails immediately");
  check(git(tmp, "ls-remote", url(R, "permtest")).code === 0, "other tokens unaffected");

  console.log("== password change + rate limit");
  check((await consolePost("/~mio/password", { csrf, current: CONSOLE_PASS, next: "short", confirm: "short" })).status === 400, "short new password refused");
  const NEWPASS = randomBytes(15).toString("base64url");
  const oldCookie = cookie;
  const pc = await consolePost("/~mio/password", { csrf, current: CONSOLE_PASS, next: NEWPASS, confirm: NEWPASS });
  takeCookie(pc);
  check(pc.status === 303 && cookie !== oldCookie, "password changed, fresh session");
  check((await fetch(`${BASE}/~mio/`, { redirect: "manual", headers: H({ cookie: oldCookie }) })).status === 303, "old session signed out");
  check((await consoleGet("/~mio/")).status === 200, "new session works");
  const lo = await consolePost("/~mio/logout", { csrf: csrfOf(await (await consoleGet("/~mio/")).text()) });
  check(lo.status === 303 && /Max-Age=0/.test(lo.headers.get("set-cookie") ?? ""), "logout clears cookie");
  cookie = "";
  check((await consolePost("/~mio/login", { username: "mio", password: CONSOLE_PASS })).status === 401, "old password no longer works");
  let locked = false;
  for (let i = 0; i < 6; i++) {
    const t = await (await consolePost("/~mio/login", { username: "mio", password: "nope" + i })).text();
    if (/Too many failed attempts/.test(t)) locked = true;
  }
  check(locked, "login locked after repeated failures");
  const afterLock = await consolePost("/~mio/login", { username: "mio", password: NEWPASS });
  check(afterLock.status === 401, "correct password also refused while locked");
} catch (e) {
  bad(`exception: ${e.stack ?? e}`);
} finally {
  cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log(serverLog.slice(-4000));
  rmSync(tmp, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}
