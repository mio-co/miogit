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
  TEST_TOKEN_TTL_MS: "4000", // enables expires=test (4 s) so a token can be watched expiring
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
  for (const r of ["mio-cli", "MioUI-shopify-admin", "deltest"]) check(git(src, "push", "-q", url(ADMIN_TOKEN, r), "main").code === 0, `admin creates ${r}`);

  console.log("== sign-in button on public pages");
  const idxHtml = await (await fetch(`${BASE}/`)).text();
  check(/<a class='mio-btn mio-auth mio-auth-btn' href='\/~mio\/login'[^>]*data-auth='out'>/.test(idxHtml) && idxHtml.includes("data-zh='登录'") && !idxHtml.includes("管理台"), "signed out: top bar shows 登录 / Sign in -> /~mio/login");
  check(/mio-auth-btn[^>]*>\s*<svg[^>]*><path d='M141\.66,133\.66/.test(idxHtml), "signed out: Phosphor SignIn icon (not the gear)");
  check(/class='[^']*mio-auth-btn' href='\/~mio\/login'/.test(await (await fetch(`${BASE}/mio-cli/`)).text()), "repository page top bar has the sign-in button too");
  const signedIdx = await (await fetch(`${BASE}/mio-cli/`, { headers: { cookie: "mg_signed=1" } })).text();
  check(/<a class='mio-btn mio-auth mio-auth-btn' href='\/~mio\/'[^>]*data-auth='in'>/.test(signedIdx) && signedIdx.includes("data-zh='管理'"), "signed-in hint: top bar shows 管理 / Manage (UserCircle) -> /~mio/");
  check(!/mio-tab-set/.test(signedIdx) && !/\/~mio\/repos\//.test(signedIdx), "public repo page has no Settings tab (even with the hint)");
  const loginEntry = await fetch(`${BASE}/~mio/login`, { redirect: "manual", headers: H() });
  check(loginEntry.status === 200, "signed out: /~mio/login opens the sign-in page");
  check(!/<script>/.test(idxHtml), "no inline script on the index");

  console.log("== repository page structure (GitHub-style, no duplicates)");
  const ui_rp = await (await fetch(`${BASE}/mio-cli/`)).text();
  const ui_tabs = /<nav class='mio-tabs'>([\s\S]*?)<\/nav>/.exec(ui_rp)?.[1] ?? "";
  check((ui_tabs.match(/<a /g) || []).length === 3 && /data-zh='代码'/.test(ui_tabs) && /data-zh='提交'/.test(ui_tabs) && /data-zh='分支'/.test(ui_tabs), "public repository tabs: Code / Commits / Branches");
  check(/class='repo-grid'/.test(ui_rp) && /class='repo-side'/.test(ui_rp) && (ui_rp.match(/data-copy='http/g) || []).length === 1 && !/class='mio-sub'/.test(ui_rp), "Code page: clone URL once (About sidebar), no description line under the title");
  check(/<div class='gh-bar'><details class='mio-menu mio-ref'[\s\S]*?class='gh-counts'[\s\S]*?\/branches\/[\s\S]*?\/tags\/[\s\S]*?\/log\//.test(ui_rp), "counts row: branch picker, then branches · tags · commits");
  for (const [from, to] of [["/mio-cli/about/", "/mio-cli/"], ["/mio-cli/summary/", "/mio-cli/"], ["/mio-cli/refs/", "/mio-cli/branches/"]]) {
    const ui_mv = await fetch(`${BASE}${from}`, { redirect: "manual" });
    check(ui_mv.status === 301 && ui_mv.headers.get("location") === to, `old tab ${from} -> 301 ${to}`);
  }
  const ui_tg = await (await fetch(`${BASE}/mio-cli/tags/`)).text();
  check(/class='mio-seg mio-seg-links'/.test(ui_tg) && /href='\/mio-cli\/tags\/' aria-current='page'/.test(ui_tg) && /class='active' aria-current='page' href='\/mio-cli\/branches\/'/.test(ui_tg), "tags are a switch on the Branches tab");
  const ui_lg = await (await fetch(`${BASE}/mio-cli/log/`)).text();
  check(/class='cl-day'/.test(ui_lg) && /class='mio-btn-group cl-sha'/.test(ui_lg) && /data-copy='[0-9a-f]{40}'/.test(ui_lg), "commit list grouped by day, short sha with copy");
  const ui_cm = await (await fetch(`${BASE}/mio-cli/commit/`)).text();
  check(/class='mio-card cm-card'/.test(ui_cm) && /<details class='mio-card df-file'/.test(ui_cm) && !/class='commit-info'/.test(ui_cm) && !/diffstat/.test(ui_cm), "commit page: one header card + collapsible file diffs, no duplicate meta table / diffstat");
  const entry = await fetch(`${BASE}/~mio/`, { redirect: "manual", headers: H() });
  check(entry.status === 303 && entry.headers.get("location") === "/~mio/login?next=%2F~mio%2F", "signed-out click on the button -> /~mio/login?next=/~mio/");

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
  const li = await consolePost("/~mio/login", { username: "mio", password: CONSOLE_PASS, next: "/" });
  const sc = takeCookie(li);
  check(li.status === 303 && cookie, "console login with username/password");
  check(li.headers.get("location") === "/~mio/", "login with next=/ lands on the console home, not the site index");
  check(/mg_signed=1; Path=\/;[^,]*SameSite=Lax/.test(sc), "login also sets the secret-free hint cookie mg_signed=1 (Path=/, SameSite=Lax)");
  check((await consoleGet("/~mio/login?next=%2F%2Fevil.example")).headers.get("location") === "/~mio/", "next=//evil -> console home");
  check((await consoleGet("/~mio/login?next=%2F~mio%2Ftokens")).headers.get("location") === "/~mio/tokens", "next=/~mio/tokens is honoured");
  check(/Path=\/~mio\//.test(sc) && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Strict/.test(sc) && /Max-Age=\d+/.test(sc), "cookie: Path=/~mio/, HttpOnly, Secure, SameSite=Strict, Max-Age");
  const home = await consoleGet("/~mio/");
  const homeHtml = await home.text();
  check(home.status === 200 && homeHtml.includes("permtest"), "console home lists repos");
  check((await fetch(`${BASE}/~mio/`, { redirect: "manual", headers: { cookie } })).status === 403, "valid session but no Access JWT -> 403");

  console.log("== make permtest private (repo settings, CSRF)");
  const sp = await consoleGet("/~mio/repos/permtest");
  const csrf = csrfOf(await sp.text());
  check(sp.status === 200 && csrf, "settings page with CSRF token");
  const sph = await (await consoleGet("/~mio/repos/permtest")).text();
  check(!/data-dialog-layer/.test(sph) && /class='rs-page'/.test(sph) && /class='mio-tab-set active' href='\/~mio\/repos\/permtest' aria-current='page'/.test(sph), "settings is its own page (no dialog) with the Settings tab active");
  check(/href='\/~mio\/repos\/permtest\?s=general' aria-current='page'/.test(sph) && sph.includes("?s=visibility") && sph.includes("?s=danger"), "settings section nav: General / Visibility / Danger zone");
  check(/href=["']\/~mio\/r\/permtest\/["']/.test(sph) && /href=["']\/~mio\/r\/permtest\/log\//.test(sph) && !/href=["']\/permtest\//.test(sph), "settings page tab bar links stay under /~mio/r/permtest/");
  const vs = await (await consoleGet("/~mio/repos/permtest?s=visibility")).text();
  check(/name='private'/.test(vs) && /name='s' value='visibility'/.test(vs) && !/name='description'/.test(vs), "visibility section has only the private switch");
  check((await consolePost("/~mio/repos/permtest", { description: "x", private: "1" })).status === 403, "POST without CSRF -> 403");
  check((await consolePost("/~mio/repos/permtest", { csrf, description: "x", private: "1" }, { origin: "https://evil.example" })).status === 403, "cross-origin POST -> 403");
  check((await consolePost("/~mio/repos/permtest", { csrf, description: "x", private: "1" }, { origin: "null", "sec-fetch-site": "cross-site" })).status === 403, "Origin: null + cross-site -> 403");
  check((await consolePost("/~mio/repos/permtest", { csrf, description: "perm test", private: "1" }, { origin: "null", "sec-fetch-site": "same-origin" })).status === 303, "save settings (private) — browser form post (Origin: null, same-origin)");
  const gs = await consolePost("/~mio/repos/permtest", { csrf, s: "general", description: "perm test", owner: "", section: "" });
  check(gs.status === 303 && gs.headers.get("location") === "/~mio/repos/permtest?s=general&done=1", "General section save -> back to the same section");
  check(/name='private' value='1' checked/.test(await (await consoleGet("/~mio/repos/permtest?s=visibility&done=1")).text()), "General save keeps the repository private");
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

  console.log("== one list for public + private, browsing stays under /~mio/");
  const HINT = "mg_signed=1";
  const both = await (await consoleGet("/~mio/")).text();
  check(both.includes("href='/~mio/r/permtest/'") && both.includes("href='/~mio/r/mio-cli/'") && /permtest[\s\S]{0,200}rl-priv/.test(both), "console list has public and private repos, links under /~mio/r/");
  check(!/class='rl-name' href='\/(?!~mio)/.test(both), "no repo link in the console list leaves /~mio/");
  const pv = await consoleGet("/~mio/r/permtest/");
  const pvh = await pv.text();
  check(pv.status === 200 && pvh.includes("a.txt"), "signed in: private repo page opens inside the console, no second login");
  check(/<nav class='mio-tabs'>[\s\S]*<a class='mio-tab-set' href='\/~mio\/repos\/permtest'>[\s\S]*<\/nav>/.test(pvh), "console repo page: Settings tab at the end of the tab bar -> /~mio/repos/permtest");
  check(/<\/h1><span class='mio-badge rl-priv-h'>/.test(pvh), "console repo page: Private badge next to the title");
  check((await consoleGet("/~mio/r/permtest/about/")).headers.get("location") === "/~mio/r/permtest/", "console viewer: old about tab -> 301 to the Code page");
  check(/<div class='gh-bar'><details class='mio-menu mio-ref' data-menu>[\s\S]*?<div class='gh-counts'>/.test(pvh) && !/class='mio-refbar'/.test(pvh) && /href=["']\/~mio\/r\/permtest\/tree\/\?h=adminbranch["']/.test(pvh) && !/<select name='h'/.test(pvh) && !/<details/.test(/<nav class='mio-tabs'>([\s\S]*?)<\/nav>/.exec(pvh)?.[1] ?? "<details"), "branch switcher: first item of the counts row (branches · tags · commits), links, no select/submit, no separate ref bar");
  check(!/class='rl-set'/.test(both), "console list rows no longer carry a settings link");
  check(/<section class='mio-card st-panel'[\s\S]*<ul class='st-rings'>/.test(both) && (both.match(/class='st-ring-item/g) || []).length >= 2 && !/st-kpis|st-quota/.test(both), "storage card is one row of rings (DO / R2 …)");
  check(/href=["']\/~mio\/r\/permtest\/tree\//.test(pvh) && !/href=["']\/permtest\//.test(pvh), "in-repo links (tree/log/commits…) stay under /~mio/r/permtest/");
  check(/class=["']mio-brand["'] href=["']\/~mio\/["']/.test(pvh), "logo inside the console viewer -> /~mio/");
  check((await consoleGet("/~mio/r/permtest/tree/?h=main")).status === 200 && (await consoleGet("/~mio/r/permtest/log/")).status === 200, "tree / log pages via the viewer");
  const raw = await consoleGet("/~mio/r/permtest/plain/a.txt?h=main");
  check(raw.status === 200 && /sandbox/.test(raw.headers.get("content-security-policy") ?? ""), "raw files via the viewer carry a sandbox CSP");
  check((await consoleGet("/~mio/r/permtest/info/refs?service=git-upload-pack")).status === 404, "viewer does not serve the git protocol");
  check((await fetch(`${BASE}/~mio/r/permtest/`, { redirect: "manual", headers: { cookie } })).status === 403, "viewer without Access JWT -> 403");
  const rootPriv = await fetch(`${BASE}/permtest/tree/?h=main`, { redirect: "manual" });
  check(rootPriv.status === 302 && rootPriv.headers.get("location") === "/~mio/r/permtest/tree/?h=main", "browser at /permtest/tree/?h=main (private) -> 302 /~mio/r/permtest/tree/?h=main");
  check((await fetch(`${BASE}/permtest/`, { redirect: "manual", headers: basic(ADMIN_TOKEN) })).status === 200, "token in Basic auth still reads the private page at the root path");
  const nx = await fetch(`${BASE}/~mio/r/permtest/tree/?h=main`, { redirect: "manual", headers: H() });
  check(nx.status === 303 && nx.headers.get("location") === "/~mio/login?next=%2F~mio%2Fr%2Fpermtest%2Ftree%2F%3Fh%3Dmain", "signed out: viewer -> login with the full path as next");
  const back = await fetch(`${BASE}/~mio/login`, { method: "POST", redirect: "manual", headers: H({ origin: BASE, "content-type": "application/x-www-form-urlencoded" }), body: new URLSearchParams({ username: "mio", password: CONSOLE_PASS, next: "/~mio/r/permtest/tree/?h=main" }).toString() });
  check(back.status === 303 && back.headers.get("location") === "/~mio/r/permtest/tree/?h=main", "after login next returns to the same repository page");
  const hr = await fetch(`${BASE}/`, { redirect: "manual", headers: { cookie: HINT } });
  check(hr.status === 302 && hr.headers.get("location") === "/~mio/", "signed in (hint): / -> /~mio/");
  check(/class=["']mio-brand["'] href=["']\/~mio\/["']/.test(await (await fetch(`${BASE}/mio-cli/`, { headers: { cookie: HINT } })).text()), "signed in (hint): logo on public pages -> /~mio/");
  check(/class='mio-brand' href='\/'/.test(await (await fetch(`${BASE}/mio-cli/`)).text()), "signed out: logo -> /");
  console.log("== forged hint cookie grants nothing");
  const fz = await fetch(`${BASE}/permtest/`, { redirect: "manual", headers: { cookie: HINT } });
  check(fz.status === 302 && !(await fz.text()).includes("a.txt"), "forged hint: private repo page not served at the root path");
  check((await fetch(`${BASE}/permtest.git/info/refs?service=git-upload-pack`, { headers: { cookie: HINT } })).status === 401, "forged hint: git still needs a token");
  check((await fetch(`${BASE}/~mio/r/permtest/`, { redirect: "manual", headers: { cookie: HINT } })).status === 403, "forged hint without Access -> 403");
  const fh = await fetch(`${BASE}/~mio/r/permtest/`, { redirect: "manual", headers: H({ cookie: HINT }) });
  check(fh.status === 303 && /^\/~mio\/login/.test(fh.headers.get("location") ?? "") && /mg_signed=; Path=\/; Max-Age=0/.test(fh.headers.get("set-cookie") ?? ""), "forged/stale hint with Access but no session -> login, and the hint is cleared");
  check(!(await (await fetch(`${BASE}/api/repos`, { headers: { cookie: HINT } })).text()).includes("permtest"), "forged hint: /api/repos still public-only");

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

  console.log("== account entry points + token / password dialogs");
  const homeNow = await (await consoleGet("/~mio/")).text();
  check(!/ad-tokens/.test(homeNow) && !/class='mio-head-act'/.test(homeNow), "console list header has no separate Access tokens button");
  check(/<details class='mio-menu mio-acct' data-menu>[\s\S]*href='\/~mio\/tokens\?next=%2F~mio%2F'[\s\S]*href='\/~mio\/password\?next=%2F~mio%2F'[\s\S]*action='\/~mio\/logout'[\s\S]*<\/details>/.test(homeNow) && !homeNow.includes("id='mh-auth'"), "top-bar account menu: tokens / password (dialogs, next = this page) / sign out");
  const repoNow = await (await consoleGet("/~mio/r/permtest/")).text();
  check(/<details class='mio-menu mio-acct'/.test(repoNow) && repoNow.includes("href='/~mio/tokens?next=%2F~mio%2Fr%2Fpermtest%2F'"), "account menu on console repository pages too (returns to that page)");
  check(/data-dialog-layer/.test(list) && /class='mio-dialog mio-dialog-lg'/.test(list) && /<main id='cgit'[^>]*inert/.test(list) && /class='mio-dialog-b'/.test(list) && list.includes("st-panel"), "token page = dialog (lg, scrolling body) over the console list (inert behind)");
  const overRepo = await (await consoleGet("/~mio/tokens?next=%2F~mio%2Fr%2Fpermtest%2F")).text();
  check(/data-dialog-layer/.test(overRepo) && /class='gh-files'|class='list gh-files'/.test(overRepo) && /class='mio-backdrop' href='\/~mio\/r\/permtest\/'/.test(overRepo) && /name='next' value='\/~mio\/r\/permtest\/'/.test(overRepo), "token dialog opened from a repository page keeps that page behind; close / forms return there");
  check(/data-cancel='\/~mio\/'/.test(await (await consoleGet("/~mio/tokens?next=%2F%2Fevil.example")).text()), "next=//evil -> dialog returns to the console home");
  check(/<select name='expires'>/.test(list) && /value='30' selected/.test(list) && ["7", "90", "365", "never"].every((v) => list.includes(`value='${v}'`)), "expiration choices 7/30/90/365 days/never, default 30");
  const pwd = await (await consoleGet("/~mio/password?next=%2F~mio%2Fr%2Fpermtest%2F")).text();
  check(/data-dialog-layer/.test(pwd) && /action='\/~mio\/password'/.test(pwd) && /name='back' value='\/~mio\/r\/permtest\/'/.test(pwd) && /name='csrf'/.test(pwd), "password page = dialog over the page it was opened from (CSRF, back)");

  console.log("== token expiry");
  const legacyRow = /<span data-noi18n>hark-reader<\/span>[\s\S]*?<td class='tk-t tk-e'>([\s\S]*?)<\/td>/.exec(list)?.[1] ?? "";
  check(/Never/.test(legacyRow), "token created without an expiration (as before) never expires");
  const bad30 = await consolePost("/~mio/tokens", { csrf, name: "x", role: "reader", expires: "999" });
  check(bad30.status === 400, "unknown expiration -> 400");
  const c30 = await consolePost("/~mio/tokens", { csrf, name: "hark-30d", role: "reader", expires: "30" });
  const c30h = await c30.text();
  const T30 = /readonly value='(mgt_[A-Za-z0-9_-]+)'/.exec(c30h)?.[1];
  const want30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  check(c30.status === 200 && T30 && c30h.includes(want30), `30-day token created, expires ${want30}`);
  const cx = await consolePost("/~mio/tokens", { csrf, name: "hark-short", role: "reader", expires: "test" });
  const TX = /readonly value='(mgt_[A-Za-z0-9_-]+)'/.exec(await cx.text())?.[1];
  check(cx.status === 200 && TX, "short-lived token created");
  check(git(tmp, "ls-remote", url(TX, "permtest")).code === 0, "not yet expired: token reads the private repo");
  await new Promise((r) => setTimeout(r, 4500));
  const lx = git(tmp, "ls-remote", url(TX, "permtest"));
  check(lx.code !== 0, "expired token: git ls-remote refused");
  check((await fetch(`${BASE}/permtest.git/info/refs?service=git-upload-pack`, { headers: basic(TX) })).status === 401, "expired token: private info/refs 401");
  check((await fetch(`${BASE}/mio-cli.git/info/refs?service=git-upload-pack`, { headers: basic(TX) })).status === 401, "expired token: refused even on a public repo");
  check((await fetch(`${BASE}/api/repos`, { headers: basic(TX) })).status === 401, "expired token: /api/repos 401");
  check(git(tmp, "ls-remote", url(T30, "permtest")).code === 0, "unexpired 30-day token still works");
  check(git(tmp, "ls-remote", url(tokens["hark-reader"], "permtest")).code === 0, "token without expiration still works");
  const listX = await (await consoleGet("/~mio/tokens")).text();
  check(/<tr class='is-expired'><td class='tk-name'><span data-noi18n>hark-short<\/span>[\s\S]*?class='tk-exp is-expired'/.test(listX), "list marks the expired token in red (Expired)");
  check(new RegExp(`hark-30d</span>[\\s\\S]*?<td class='tk-t tk-e'><span title='[^']+'>${want30}</span>`).test(listX), "list shows the 30-day token's expiry date");
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
  const id = new RegExp(`>hark-writer</span>[\\s\\S]*?/~mio/tokens/([A-Za-z0-9_-]+)/revoke`).exec(listHtml)?.[1];
  const confirm = await consoleGet(`/~mio/tokens/${id}/revoke`);
  const confirmHtml = await confirm.text();
  check(confirm.status === 200 && confirmHtml.includes("hark-writer") && /data-dialog-layer/.test(confirmHtml) && /class='mio-dialog-icon is-danger'/.test(confirmHtml) && /mio-btn-danger-solid/.test(confirmHtml), "revoke confirmation (danger dialog)");
  check((await consolePost(`/~mio/tokens/${id}/revoke`, { csrf })).status === 303, "revoke");
  check(git(tmp, "ls-remote", url(W, "permtest")).code !== 0, "revoked writer token fails immediately");
  check(git(tmp, "ls-remote", url(R, "permtest")).code === 0, "other tokens unaffected");

  console.log("== delete a repository (console only)");
  check((await fetch(`${BASE}/deltest`, { method: "DELETE", headers: basic(ADMIN_TOKEN) })).status === 404, "admin git token cannot DELETE /<repo>");
  check((await fetch(`${BASE}/deltest/`)).status === 200, "…and deltest still exists");
  const ds = await (await consoleGet("/~mio/repos/deltest")).text();
  check(ds.includes("href='/~mio/repos/deltest?s=danger'"), "settings page links to the danger zone");
  const dp = await consoleGet("/~mio/repos/deltest?s=danger");
  const dh = await dp.text();
  check(dp.status === 200 && /action='\/~mio\/repos\/deltest\/delete'/.test(dh) && /name='confirm'[^>]*required/.test(dh) && dh.includes("mio-btn-danger-solid") && !/data-dialog-layer/.test(dh), "danger zone page (no dialog) asks for the name");
  const dg = await consoleGet("/~mio/repos/deltest/delete");
  check(dg.status === 303 && dg.headers.get("location") === "/~mio/repos/deltest?s=danger", "old delete URL -> danger zone page");
  check((await consolePost("/~mio/repos/deltest/delete", { confirm: "deltest" })).status === 403, "delete without CSRF -> 403");
  check((await consolePost("/~mio/repos/deltest/delete", { csrf, confirm: "deltest" }, { origin: "https://evil.example" })).status === 403, "cross-origin delete -> 403");
  check((await fetch(`${BASE}/~mio/repos/deltest/delete`, { method: "POST", redirect: "manual", headers: { cookie, origin: BASE, "content-type": "application/x-www-form-urlencoded" }, body: `csrf=${encodeURIComponent(csrf)}&confirm=deltest` })).status === 403, "delete without Access JWT -> 403");
  check((await consolePost("/~mio/repos/deltest/delete", { csrf, confirm: "deltes" })).status === 400, "wrong name -> 400, nothing deleted");
  check((await consolePost("/~mio/repos/deltest/delete", { csrf, confirm: "DELTEST" })).status === 400, "name is case-sensitive");
  check(git(tmp, "ls-remote", `${BASE}/deltest.git`).code === 0, "…deltest still clonable after refused deletes");
  const del = await consolePost("/~mio/repos/deltest/delete", { csrf, confirm: "deltest" });
  check(del.status === 303 && del.headers.get("location") === "/~mio/?done=deleted&name=deltest", "delete with the exact name -> back to console home");
  check((await (await consoleGet("/~mio/?done=deleted&name=deltest")).text()).includes("已删除仓库「deltest」"), "console home shows the success notice");
  check((await fetch(`${BASE}/deltest.git/info/refs?service=git-upload-pack`)).status === 404, "deleted repo: info/refs 404");
  const dc = git(tmp, "clone", "-q", `${BASE}/deltest.git`, join(tmp, "c-del"));
  check(dc.code !== 0 && /404|not found/i.test(dc.out), "deleted repo: git clone fails (404)");
  check((await fetch(`${BASE}/deltest/`)).status === 404, "deleted repo page 404");
  check(!(await fetch(`${BASE}/api/repos`, { headers: basic(ADMIN_TOKEN) }).then((x) => x.json())).repos.some((x) => x.name === "deltest"), "registry row removed");
  check((await consoleGet("/~mio/repos/deltest")).status === 404, "settings for the deleted repo 404");
  check(git(tmp, "clone", "-q", `${BASE}/mio-cli.git`, join(tmp, "c-cli")).code === 0 && git(tmp, "ls-remote", url(ADMIN_TOKEN, "permtest")).code === 0, "other repositories unaffected");
  check(git(src, "push", "-q", url(ADMIN_TOKEN, "deltest"), "main").code === 0 && git(tmp, "clone", "-q", `${BASE}/deltest.git`, join(tmp, "c-del2")).code === 0, "the name can be re-created by an admin push afterwards");

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
  check(/mg_signed=; Path=\/; Max-Age=0/.test(lo.headers.get("set-cookie") ?? "") && lo.headers.get("location") === "/", "logout clears the hint cookie and goes to /");
  const pub = await fetch(`${BASE}/`, { redirect: "manual" });
  const pubHtml = await pub.text();
  check(pub.status === 200 && !pubHtml.includes("permtest") && /class='mio-brand' href='\/'/.test(pubHtml), "after logout / is the normal public index again");
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
