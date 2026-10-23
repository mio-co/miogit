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
import { generateKeyPairSync, createSign, createHmac, randomBytes, webcrypto } from "node:crypto";
import { createServer } from "node:http";

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

// ---- GitHub API stand-in (records repository_dispatch calls from the sync hook) ----
const SYNC_PAT = "ghp_test_" + randomBytes(12).toString("hex");
const SYNC_HOOK_SECRET = randomBytes(20).toString("hex");
const SYNC_TOKEN = "mgt_sync_" + randomBytes(18).toString("base64url");
const dispatches = [];
const ghStub = createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    if (req.method === "POST" && req.url === "/repos/mio-co/miogit-sync/dispatches") {
      let j = null;
      try { j = JSON.parse(body); } catch {}
      dispatches.push({ auth: req.headers.authorization, ...j });
      res.writeHead(204).end();
    } else res.writeHead(404).end();
  });
});
await new Promise((r) => ghStub.listen(0, "127.0.0.1", r));
const GH_STUB = `http://127.0.0.1:${ghStub.address().port}`;

// ---- server -------------------------------------------------------------------
const vars = {
  SYNC_GITHUB_TOKEN: SYNC_PAT,
  SYNC_WEBHOOK_SECRET: SYNC_HOOK_SECRET,
  SYNC_GIT_TOKEN: SYNC_TOKEN,
  SYNC_GITHUB_API: GH_STUB,
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
const cleanup = () => { try { process.kill(-server.pid, "SIGKILL"); } catch {} try { ghStub.close(); } catch {} };
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

// ---- React frontend helpers -------------------------------------------------------
const bootOf = (html) => {
  const m = /<script type="application\/json" id="mio-boot">([\s\S]*?)<\/script>/.exec(html);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
};
const isShell = (html) => /<div id="root"><\/div>/.test(html) && /src="\/~static\/a\/[^"]+\.js"/.test(html) && !!bootOf(html);
let csrfJ = "";
async function apiPost(path, body, extra = {}) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: H({ cookie, origin: BASE, "content-type": "application/json", ...(csrfJ ? { "x-csrf-token": csrfJ } : {}), ...extra }),
    body: JSON.stringify(body),
  });
}
const apiGet = (path, extra = {}) => fetch(`${BASE}${path}`, { redirect: "manual", headers: H({ cookie, ...extra }) });

try {
  console.log("== admin token: create repos (push to a new name)");
  const src = join(tmp, "src");
  git(tmp, "init", "-q", src);
  commit(src, "a.txt", "one\n", "c1");
  writeFileSync(join(src, "README.md"), "# Title\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n");
  git(src, "add", "-A");
  git(src, "commit", "-qm", "readme");
  check(git(src, "push", "-q", url(ADMIN_TOKEN, "permtest"), "main").code === 0, "admin pushes new repo permtest (main)");
  git(src, "checkout", "-qb", "adminbranch");
  commit(src, "b.txt", "admin\n", "c-admin");
  check(git(src, "push", "-q", url(ADMIN_TOKEN, "permtest"), "adminbranch").code === 0, "admin pushes adminbranch");
  git(src, "checkout", "-q", "main");
  for (const r of ["mio-cli", "MioUI-shopify-admin", "deltest"]) check(git(src, "push", "-q", url(ADMIN_TOKEN, r), "main").code === 0, `admin creates ${r}`);

  console.log("== React frontend: shell, first data inlined, static assets");
  const idx = await fetch(`${BASE}/`);
  const idxHtml = await idx.text();
  const idxBoot = bootOf(idxHtml);
  check(idx.status === 200 && isShell(idxHtml), "/ is the frontend shell (index.html + /~static/ bundle)");
  check(idxBoot && idxBoot.signed === false && idxBoot.console === false && idxBoot.data["/api/repos"]?.body?.repos?.some((r) => r.name === "mio-cli"), "boot block carries the public list (no extra request on first paint)");
  check(/script-src 'self'/.test(idx.headers.get("content-security-policy") ?? "") && !/unsafe-eval/.test(idx.headers.get("content-security-policy") ?? ""), "shell keeps the strict CSP (script-src 'self')");
  check(!/<script>/.test(idxHtml) && !/<script(?![^>]*(type="application\/json"|src=))/.test(idxHtml), "no inline executable script in the shell");
  const asset = /src="(\/~static\/a\/[^"]+\.js)"/.exec(idxHtml)?.[1];
  const assetRes = asset ? await fetch(`${BASE}${asset}`) : null;
  check(assetRes?.status === 200 && /javascript/.test(assetRes.headers.get("content-type") ?? ""), "hashed bundle served from /~static/a/");
  check(/immutable/.test(assetRes?.headers.get("cache-control") ?? ""), "hashed bundle cached as immutable (_headers)");
  check((await fetch(`${BASE}/~static/prefs.js`)).status === 200, "prefs boot script served");
  const rp = await fetch(`${BASE}/mio-cli/`);
  const rpHtml = await rp.text();
  const rpBoot = bootOf(rpHtml);
  const sumKey = "/mio-cli/api/view/";
  check(rp.status === 200 && isShell(rpHtml) && rpBoot?.data[sumKey]?.body?.kind === "summary", "repo page: shell with the Code view inlined");
  const sum = rpBoot?.data[sumKey]?.body ?? {};
  check(sum.meta?.nBranches === 1 && sum.meta?.nTags === 0 && sum.commits === 2 && sum.last?.subject === "readme" && sum.files?.some((f) => f.name === "a.txt") && /mio-cli\.git$/.test(sum.cloneUrl), "Code view: counts (branches · tags · commits), last commit, files, clone url");
  check(sum.readme?.html && !/<script/i.test(sum.readme.html) && !/javascript:/i.test(sum.readme.html), "README html is sanitized server-side (no <script>, no javascript: links)");
  check(rpBoot?.console === false && rpBoot?.signed === false && !rpBoot?.session, "public repo page boot: not console, no session");
  const signedRp = bootOf(await (await fetch(`${BASE}/mio-cli/`, { headers: { cookie: "mg_signed=1" } })).text());
  check(signedRp?.signed === true && !signedRp?.session, "signed-in hint: boot.signed (Manage / logo to /~mio/), still no session data");
  for (const [p, kind] of [["/mio-cli/tree/a.txt", "blob"], ["/mio-cli/tree/", "tree"], ["/mio-cli/log/", "log"], ["/mio-cli/branches/", "branches"], ["/mio-cli/tags/", "tags"], ["/mio-cli/commit/", "commit"]]) {
    const r = await fetch(`${BASE}${p}`);
    const b = bootOf(await r.text());
    const key = Object.keys(b?.data ?? {})[0] ?? "";
    check(r.status === 200 && b?.data[key]?.body?.kind === kind && key === p.replace(/^\/mio-cli/, "/mio-cli/api/view"), `deep link ${p} -> shell + ${kind} view`);
  }
  const lg = await (await fetch(`${BASE}/mio-cli/api/view/log/`)).json();
  check(lg.commits?.length === 2 && /^[0-9a-f]{40}$/.test(lg.commits[0].oid) && lg.commits[0].deco?.some((d) => d.type === "branch" && d.name === "main"), "log view: full oids + branch decorations");
  const cm = await (await fetch(`${BASE}/mio-cli/api/view/commit/`)).json();
  check(cm.kind === "commit" && cm.files?.length === 1 && cm.files[0].path === "README.md" && cm.files[0].hunks?.length >= 1, "commit view: file diffs with hunks");
  const bl = await (await fetch(`${BASE}/mio-cli/api/view/tree/a.txt`)).json();
  check(bl.kind === "blob" && bl.lineCount === 1 && Array.isArray(bl.lines), "blob view: highlighted lines");
  const nf = await fetch(`${BASE}/mio-cli/tree/nope`);
  check(nf.status === 404 && bootOf(await nf.text())?.data["/mio-cli/api/view/tree/nope"]?.body?.kind === "error", "missing path: 404 shell with an error view");
  const nr = await fetch(`${BASE}/no-such-repo-xyz/`);
  check(nr.status === 404 && bootOf(await nr.text())?.data["/no-such-repo-xyz/api/view/"]?.body?.kind === "error", "missing repository: 404 SPA shell with an error view (not the old server page)");
  for (const [from, to] of [["/mio-cli/about/", "/mio-cli/"], ["/mio-cli/summary/", "/mio-cli/"], ["/mio-cli/refs/", "/mio-cli/branches/"]]) {
    const ui_mv = await fetch(`${BASE}${from}`, { redirect: "manual" });
    check(ui_mv.status === 301 && ui_mv.headers.get("location") === to, `old tab ${from} -> 301 ${to}`);
  }
  const blame = await fetch(`${BASE}/mio-cli/blame/a.txt`);
  check(blame.status === 200 && /class='mio-top'/.test(await blame.text()), "blame stays a server page (same URL)");
  check((await fetch(`${BASE}/mio-cli/stats/`)).status === 200 && (await fetch(`${BASE}/mio-cli/plain/a.txt`)).status === 200, "stats / raw stay server pages");
  check((await fetch(`${BASE}/mio-cli/`, { headers: basic(ADMIN_TOKEN) }).then((r) => r.text())).includes("class='mio-top'"), "a request with git credentials still gets the server page");
  const entry = await fetch(`${BASE}/~mio/`, { redirect: "manual", headers: H() });
  check(entry.status === 303 && entry.headers.get("location") === "/~mio/login?next=%2F~mio%2F", "signed-out /~mio/ -> /~mio/login?next=/~mio/");
  const loginShell = await fetch(`${BASE}/~mio/login`, { redirect: "manual", headers: H() });
  const lsBoot = bootOf(await loginShell.text());
  check(loginShell.status === 200 && lsBoot?.console === true && lsBoot?.session === null && lsBoot?.data["/api/repos"], "signed out: /~mio/login is the shell (sign-in dialog over the public list)");

  console.log("== Access gate on /~mio/ (pages and API)");
  check((await fetch(`${BASE}/~mio/login`, { redirect: "manual" })).status === 403, "no Access JWT -> 403");
  check((await fetch(`${BASE}/~mio/login`, { headers: { "cf-access-jwt-assertion": jwt({ aud: ["other"] }) } })).status === 403, "wrong AUD -> 403");
  check((await fetch(`${BASE}/~mio/login`, { headers: { "cf-access-jwt-assertion": jwt({ exp: 1 }) } })).status === 403, "expired JWT -> 403");
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  check((await fetch(`${BASE}/~mio/login`, { headers: { "cf-access-jwt-assertion": jwt({}, other) } })).status === 403, "forged signature -> 403");
  check((await fetch(`${BASE}/~mio/api/session`)).status === 403 && (await fetch(`${BASE}/~mio/api/repos`)).status === 403, "API without Access JWT -> 403");
  check((await fetch(`${BASE}/~mio/api/login`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: "{}" })).status === 403, "API login without Access JWT -> 403");
  const ses0 = await (await fetch(`${BASE}/~mio/api/session`, { headers: H() })).json();
  check(ses0.signedIn === false && !ses0.csrf, "API session (Access, no cookie): signed out, no CSRF token");
  check((await fetch(`${BASE}/~mio/api/repos`, { headers: H() })).status === 401, "API repos without session -> 401");
  check((await fetch(`${BASE}/~mio/api/repos`, { headers: H(basic(ADMIN_TOKEN)) })).status === 401, "git admin token is not a console credential (API 401)");
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

  console.log("== console login (JSON API)");
  const jl = (body, extra) => fetch(`${BASE}/~mio/api/login`, { method: "POST", redirect: "manual", headers: H({ origin: BASE, "content-type": "application/json", ...extra }), body: JSON.stringify(body) });
  check((await jl({ username: "mio", password: ADMIN_TOKEN })).status === 401, "admin git token cannot sign in (API)");
  check((await jl({ username: "admin", password: CONSOLE_PASS })).status === 401, "wrong username refused (API)");
  check((await fetch(`${BASE}/~mio/api/login`, { method: "POST", headers: H({ origin: BASE, "content-type": "application/x-www-form-urlencoded" }), body: "username=mio" })).status === 415, "API refuses non-JSON bodies (415)");
  check((await jl({ username: "mio", password: CONSOLE_PASS }, { origin: "https://evil.example" })).status === 403, "cross-origin API login -> 403");
  const jli = await jl({ username: "mio", password: CONSOLE_PASS, remember: false, next: "//evil.example" });
  const jlb = await jli.json();
  const jsc = jli.headers.get("set-cookie") ?? "";
  check(jli.status === 200 && jlb.user === "mio" && jlb.csrf && jlb.next === "/~mio/", "API login: user + CSRF token, unsafe next -> /~mio/");
  const jA = /mg_admin=[^,]*/.exec(jsc)?.[0] ?? "";
  check(/Path=\/~mio\//.test(jA) && /HttpOnly/.test(jA) && /Secure/.test(jA) && /SameSite=Lax/.test(jA) && !/Max-Age/.test(jA), "API login without remember-me: browser-session cookie (Path=/~mio/, HttpOnly, Secure, Lax)");
  check(/mg_signed=1; Path=\/;[^,]*SameSite=Lax/.test(jsc), "API login sets the hint cookie");
  const jlr = await jl({ username: "mio", password: CONSOLE_PASS, remember: true });
  const jage = parseInt(/mg_admin=[^,]*Max-Age=(\d+)/.exec(jlr.headers.get("set-cookie") ?? "")?.[1] ?? "0", 10);
  check(jlr.status === 200 && jage > 29 * 86400 && jage <= 30 * 86400, "API login with remember-me: 30-day cookie");
  takeCookie(jlr);
  csrfJ = (await jlr.json()).csrf;
  const ses1 = await (await apiGet("/~mio/api/session")).json();
  check(ses1.signedIn && ses1.user === "mio" && ses1.csrf === csrfJ, "API session after login");
  check((await fetch(`${BASE}/~mio/api/repos`, { headers: { cookie } })).status === 403, "valid session but no Access JWT -> API 403");

  console.log("== console login (legacy form endpoints still work)");
  const keep = cookie;
  cookie = "";
  const lp = await consolePost("/~mio/login", { username: "mio", password: ADMIN_TOKEN, next: "/~mio/" });
  cookie = keep;
  check(lp.status === 401 && !lp.headers.get("set-cookie"), "admin git token cannot sign in to the console (form)");
  const li = await consolePost("/~mio/login", { username: "mio", password: CONSOLE_PASS, next: "/" });
  check(li.status === 303 && li.headers.get("location") === "/~mio/", "form login with next=/ lands on the console home");
  check((await consoleGet("/~mio/login?next=%2F%2Fevil.example")).headers.get("location") === "/~mio/", "signed in: /~mio/login?next=//evil -> console home");
  check((await consoleGet("/~mio/login?next=%2F~mio%2Ftokens")).headers.get("location") === "/~mio/tokens", "signed in: next=/~mio/tokens honoured");
  const home = await consoleGet("/~mio/");
  const homeBoot = bootOf(await home.text());
  check(home.status === 200 && homeBoot?.console && homeBoot?.session?.user === "mio" && homeBoot?.session?.csrf === csrfJ, "console home: shell with session (user + CSRF)");
  const homeData = homeBoot?.data["/~mio/api/repos"]?.body;
  check(homeData?.repos?.some((r) => r.name === "permtest") && typeof homeData?.storage?.db === "number" && homeData.storage.limits?.doBytes === 5 * 1024 ** 3, "console home data: every repository + storage (DO/R2 limits)");
  check((await fetch(`${BASE}/~mio/`, { redirect: "manual", headers: { cookie } })).status === 403, "valid session but no Access JWT -> 403");

  console.log("== make permtest private (settings API, CSRF)");
  const sp = await consoleGet("/~mio/repos/permtest");
  const spBoot = bootOf(await sp.text());
  check(sp.status === 200 && spBoot?.data["/~mio/api/repos/permtest"]?.body?.name === "permtest", "settings page: shell with the repository settings inlined");
  check((await apiPost("/~mio/api/repos/permtest", { s: "visibility", private: true }, { "x-csrf-token": "" })).status === 403, "settings API without CSRF -> 403");
  check((await apiPost("/~mio/api/repos/permtest", { s: "visibility", private: true }, { "x-csrf-token": "nope" })).status === 403, "settings API with a wrong CSRF -> 403");
  check((await apiPost("/~mio/api/repos/permtest", { s: "visibility", private: true }, { origin: "https://evil.example" })).status === 403, "cross-origin settings API -> 403");
  check((await apiPost("/~mio/api/repos/permtest", { s: "visibility", private: true }, { origin: "null", "sec-fetch-site": "cross-site" })).status === 403, "Origin: null + cross-site -> 403");
  check((await fetch(`${BASE}/~mio/api/repos/permtest`, { method: "POST", headers: { cookie, origin: BASE, "content-type": "application/json", "x-csrf-token": csrfJ }, body: '{"s":"visibility","private":true}' })).status === 403, "settings API without Access JWT -> 403");
  const sv = await apiPost("/~mio/api/repos/permtest", { s: "visibility", private: true });
  check(sv.status === 200 && (await sv.json()).private === true, "visibility saved (private)");
  const sg = await apiPost("/~mio/api/repos/permtest", { s: "general", description: "perm test", owner: "", section: "" });
  const sgb = await sg.json();
  check(sg.status === 200 && sgb.description === "perm test" && sgb.private === true, "General save keeps the repository private");
  const csrf = csrfJ; // the form endpoints take the same token
  check((await consolePost("/~mio/repos/permtest", { description: "x", private: "1" })).status === 403, "legacy form POST without CSRF -> 403");
  check((await consolePost("/~mio/repos/permtest", { csrf, s: "general", description: "perm test", owner: "", section: "" })).status === 303, "legacy form POST with CSRF still works");
  check((await fetch(`${BASE}/permtest.git/info/refs?service=git-upload-pack`)).status === 401, "private repo: anonymous info/refs 401");
  check((await fetch(`${BASE}/permtest.git/info/refs?service=git-upload-pack`, { headers: { cookie } })).status === 401, "console cookie is not a git credential");
  check((await fetch(`${BASE}/permtest/config`, { method: "PUT", headers: basic(ADMIN_TOKEN), body: "{}" })).status === 404, "legacy PUT /<repo>/config gone (moved to console)");

  console.log("== private data never leaks to anonymous visitors");
  for (const p of ["/permtest/api/view/", "/permtest/api/view/tree/a.txt", "/permtest/api/view/log/", "/permtest/api/view/commit/", "/permtest/api/view/branches/", "/permtest/api/view/tags/", "/permtest/api/view/tag/?h=x", "/permtest/api/tree", "/permtest/api/blob?path=a.txt", "/permtest/api/refs"]) {
    const r = await fetch(`${BASE}${p}`, { redirect: "manual" });
    const body = await r.text();
    check(r.status === 401 && !body.includes("a.txt") && !body.includes("perm test"), `anonymous ${p} -> 401, nothing leaked`);
  }
  for (const p of ["/permtest/", "/permtest/tree/a.txt", "/permtest/log/", "/permtest/commit/"]) {
    const r = await fetch(`${BASE}${p}`, { redirect: "manual" });
    const body = await r.text();
    check(r.status === 302 && r.headers.get("location") === `/~mio/r${p}` && !body.includes("a.txt"), `anonymous ${p} -> 302 /~mio/r${p}, empty body`);
  }
  const pubIdx = await (await fetch(`${BASE}/`)).text();
  check(!pubIdx.includes("permtest") && !(await (await fetch(`${BASE}/api/repos`)).text()).includes("permtest"), "public index shell / API do not list the private repo");
  const fzv = await fetch(`${BASE}/permtest/api/view/`, { headers: { cookie: "mg_signed=1" } });
  check(fzv.status === 401, "forged hint cookie: private view API still 401");
  check((await fetch(`${BASE}/~mio/api/r/permtest/view/`, { headers: H() })).status === 401, "console view API without session -> 401");
  check((await fetch(`${BASE}/~mio/api/r/permtest/view/`, { headers: { cookie } })).status === 403, "console view API without Access -> 403");
  check((await fetch(`${BASE}/~mio/api/r/permtest/view/`, { headers: H(basic(ADMIN_TOKEN)) })).status === 401, "console view API with a git token (no session) -> 401");

  console.log("== web editor lives in the console (server page)");
  const legacyEdit = await fetch(`${BASE}/permtest/edit/a.txt?h=main`, { redirect: "manual", headers: basic(ADMIN_TOKEN) });
  check(legacyEdit.status === 303 && legacyEdit.headers.get("location") === "/~mio/edit/permtest/a.txt?h=main", "legacy editor URL -> /~mio/edit/…");
  const ep = await consoleGet("/~mio/edit/permtest/a.txt?h=main");
  const eh = await ep.text();
  const ecsrf = csrfOf(eh), base = /name='base' value='([0-9a-f]{40})'/.exec(eh)?.[1];
  check(ep.status === 200 && /action=["']\/~mio\/edit\/permtest["']/.test(eh) && ecsrf && base, "editor form posts to /~mio/edit with CSRF");
  check((await consolePost("/~mio/edit/permtest", { branch: "main", path: "a.txt", base, content: "edited\n", message: "web edit" })).status === 403, "editor POST without CSRF -> 403");
  const es = await consolePost("/~mio/edit/permtest", { csrf: ecsrf, branch: "main", path: "a.txt", base, content: "edited\n", message: "web edit" });
  check(es.status === 303, "editor commit via console");

  console.log("== console: one list, private repositories readable with the session");
  const both = await (await apiGet("/~mio/api/repos")).json();
  check(both.repos.some((r) => r.name === "permtest" && r.private === true) && both.repos.some((r) => r.name === "mio-cli" && r.private === false), "console list: public + private, with the private flag");
  const pv = await consoleGet("/~mio/r/permtest/");
  const pvBoot = bootOf(await pv.text());
  const pvView = pvBoot?.data["/~mio/api/r/permtest/view/"]?.body;
  check(pv.status === 200 && pvView?.kind === "summary" && pvView.files.some((f) => f.name === "a.txt") && pvView.meta.priv === true, "signed in: private repo Code view inside the console (priv flag for the badge)");
  const pvt = await (await apiGet("/~mio/api/r/permtest/view/tree/a.txt?h=main")).json();
  check(pvt.kind === "blob" && pvt.lines?.[0] === "edited", "console view API: blob of a private repo (after the web edit)");
  for (const p of ["tree/?h=main", "log/", "branches/", "tags/", "commit/"]) {
    const r = await consoleGet(`/~mio/r/permtest/${p}`);
    check(r.status === 200 && isShell(await r.text()), `/~mio/r/permtest/${p} -> shell`);
  }
  check((await consoleGet("/~mio/r/permtest/about/")).headers.get("location") === "/~mio/r/permtest/", "console viewer: old about tab -> 301 to the Code page");
  const vbl = await consoleGet("/~mio/r/permtest/blame/a.txt");
  check(vbl.status === 200 && /class='mio-top'/.test(await vbl.text()), "console viewer: blame stays the server page");
  const raw = await consoleGet("/~mio/r/permtest/plain/a.txt?h=main");
  check(raw.status === 200 && /sandbox/.test(raw.headers.get("content-security-policy") ?? ""), "raw files via the viewer carry a sandbox CSP");
  check((await consoleGet("/~mio/r/permtest/info/refs?service=git-upload-pack")).status === 404, "viewer does not serve the git protocol");
  check((await fetch(`${BASE}/~mio/r/permtest/`, { redirect: "manual", headers: { cookie } })).status === 403, "viewer without Access JWT -> 403");
  const rootPriv = await fetch(`${BASE}/permtest/tree/?h=main`, { redirect: "manual" });
  check(rootPriv.status === 302 && rootPriv.headers.get("location") === "/~mio/r/permtest/tree/?h=main", "browser at /permtest/tree/?h=main (private) -> 302 /~mio/r/permtest/tree/?h=main");
  check((await fetch(`${BASE}/permtest/`, { redirect: "manual", headers: basic(ADMIN_TOKEN) })).status === 200, "token in Basic auth still reads the private page at the root path");
  const nx = await fetch(`${BASE}/~mio/r/permtest/tree/?h=main`, { redirect: "manual", headers: H() });
  check(nx.status === 303 && nx.headers.get("location") === "/~mio/login?next=%2F~mio%2Fr%2Fpermtest%2Ftree%2F%3Fh%3Dmain", "signed out: viewer -> login with the full path as next");
  const back = await jl({ username: "mio", password: CONSOLE_PASS, next: "/~mio/r/permtest/tree/?h=main" });
  check(back.status === 200 && (await back.json()).next === "/~mio/r/permtest/tree/?h=main", "after login next returns to the same repository page");
  const HINT = "mg_signed=1";
  const hr = await fetch(`${BASE}/`, { redirect: "manual", headers: { cookie: HINT } });
  check(hr.status === 302 && hr.headers.get("location") === "/~mio/", "signed in (hint): / -> /~mio/");

  console.log("== forged hint cookie grants nothing");
  const fz = await fetch(`${BASE}/permtest/`, { redirect: "manual", headers: { cookie: HINT } });
  check(fz.status === 302 && !(await fz.text()).includes("a.txt"), "forged hint: private repo page not served at the root path");
  check((await fetch(`${BASE}/permtest.git/info/refs?service=git-upload-pack`, { headers: { cookie: HINT } })).status === 401, "forged hint: git still needs a token");
  check((await fetch(`${BASE}/~mio/r/permtest/`, { redirect: "manual", headers: { cookie: HINT } })).status === 403, "forged hint without Access -> 403");
  const fh = await fetch(`${BASE}/~mio/r/permtest/`, { redirect: "manual", headers: H({ cookie: HINT }) });
  check(fh.status === 303 && /^\/~mio\/login/.test(fh.headers.get("location") ?? "") && /mg_signed=; Path=\/; Max-Age=0/.test(fh.headers.get("set-cookie") ?? ""), "forged/stale hint with Access but no session -> login, and the hint is cleared");
  check(!(await (await fetch(`${BASE}/api/repos`, { headers: { cookie: HINT } })).text()).includes("permtest"), "forged hint: /api/repos still public-only");

  console.log("== access tokens (API)");
  const tl0 = await (await apiGet("/~mio/api/tokens")).json();
  check(Array.isArray(tl0.tokens) && tl0.expiryDefault === "30" && ["7", "30", "90", "365", "never"].every((v) => tl0.expiry.some((x) => x.id === v)), "token list API: expiry choices 7/30/90/365/never, default 30");
  check((await apiPost("/~mio/api/tokens", { name: "x", role: "reader" }, { "x-csrf-token": "" })).status === 403, "create token without CSRF -> 403");
  check((await apiPost("/~mio/api/tokens", { name: "", role: "reader" })).status === 400, "empty name -> 400");
  check((await apiPost("/~mio/api/tokens", { name: "x", role: "root" })).status === 400, "unknown role -> 400");
  check((await apiPost("/~mio/api/tokens", { name: "x", role: "reader", expires: "999" })).status === 400, "unknown expiration -> 400");
  const tokens = {};
  for (const [name, role] of [["hark-writer", "writer"], ["hark-reader", "reader"], ["hark-writer2", "writer"]]) {
    const r = await apiPost("/~mio/api/tokens", { name, role });
    const b = await r.json();
    check(r.status === 200 && /^mgt_[A-Za-z0-9_-]+$/.test(b.secret ?? "") && b.token?.role === role && (r.headers.get("cache-control") ?? "").includes("no-store"), `create ${role} token "${name}" (plaintext once, no-store)`);
    tokens[name] = b.secret;
  }
  const tl1 = await (await apiGet("/~mio/api/tokens")).text();
  check(tl1.includes("hark-writer") && !tl1.includes(tokens["hark-writer"]) && !/"hash"/.test(tl1), "token list never contains plaintext or hashes");
  const lf = await consolePost("/~mio/tokens", { csrf, name: "legacy-form", role: "reader" });
  check(lf.status === 200 && /mgt_[A-Za-z0-9_-]{20,}/.test(await lf.text()), "legacy form token creation still works");

  console.log("== token expiry");
  const c30 = await apiPost("/~mio/api/tokens", { name: "hark-30d", role: "reader", expires: "30" });
  const c30b = await c30.json();
  const T30 = c30b.secret;
  const want30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  check(c30.status === 200 && T30 && new Date(c30b.token.expires_at).toISOString().slice(0, 10) === want30, `30-day token created, expires ${want30}`);
  const TX = (await (await apiPost("/~mio/api/tokens", { name: "hark-short", role: "reader", expires: "test" })).json()).secret;
  check(!!TX, "short-lived token created");
  check(git(tmp, "ls-remote", url(TX, "permtest")).code === 0, "not yet expired: token reads the private repo");
  check((await fetch(`${BASE}/permtest/api/view/`, { headers: basic(TX) })).status === 200, "reader token reads the private view API");
  await new Promise((r) => setTimeout(r, 4500));
  check(git(tmp, "ls-remote", url(TX, "permtest")).code !== 0, "expired token: git ls-remote refused");
  check((await fetch(`${BASE}/permtest.git/info/refs?service=git-upload-pack`, { headers: basic(TX) })).status === 401, "expired token: private info/refs 401");
  check((await fetch(`${BASE}/mio-cli.git/info/refs?service=git-upload-pack`, { headers: basic(TX) })).status === 401, "expired token: refused even on a public repo");
  check((await fetch(`${BASE}/api/repos`, { headers: basic(TX) })).status === 401, "expired token: /api/repos 401");
  check((await fetch(`${BASE}/permtest/api/view/`, { headers: basic(TX) })).status === 401, "expired token: view API 401");
  check(git(tmp, "ls-remote", url(T30, "permtest")).code === 0, "unexpired 30-day token still works");
  check(git(tmp, "ls-remote", url(tokens["hark-reader"], "permtest")).code === 0, "token without expiration still works");
  const tl2 = (await (await apiGet("/~mio/api/tokens")).json()).tokens;
  check(tl2.find((x) => x.name === "hark-short")?.expires_at <= Date.now() && tl2.find((x) => x.name === "hark-reader")?.expires_at === 0, "list: expired token has expires_at in the past, legacy-style token never expires");
  const W = tokens["hark-writer"], R = tokens["hark-reader"], W2 = tokens["hark-writer2"];

  console.log("== reader");
  const rc = join(tmp, "reader");
  check(git(tmp, "clone", "-q", url(R, "permtest"), rc).code === 0, "reader clones private repo");
  commit(rc, "r.txt", "r\n", "reader commit");
  git(rc, "checkout", "-qb", "rfeat");
  const rpush = git(rc, "push", url(R, "permtest"), "rfeat");
  check(rpush.code !== 0 && /read-only token/.test(rpush.out), "reader push refused (remote error: read-only token)");
  check((await jl({ username: "mio", password: R })).status === 401, "reader token cannot sign in");
  check((await fetch(`${BASE}/~mio/api/tokens`, { headers: H(basic(R)) })).status === 401, "reader token cannot use the console API");

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
  git(wc, "checkout", "-q", "main");
  git(wc, "pull", "-q", url(W, "permtest"), "main");
  commit(wc, "m.txt", "m\n", "to main");
  let r = git(wc, "push", url(W, "permtest"), "main");
  check(r.code !== 0 && /protected branch/.test(r.out), "writer push to main refused (ng protected branch)");
  git(wc, "reset", "-q", "--hard", "HEAD~1");
  git(wc, "commit", "-q", "--allow-empty", "-m", "diverge");
  r = git(wc, "push", "-f", url(W, "permtest"), "main");
  check(r.code !== 0 && /protected branch/.test(r.out), "writer force-push main refused");
  r = git(wc, "push", url(W, "permtest"), ":main");
  check(r.code !== 0 && /protected branch/.test(r.out), "writer delete main refused");
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
  check((await fetch(`${BASE}/~mio/api/repos/permtest/delete`, { method: "POST", headers: H({ ...basic(W), origin: BASE, "content-type": "application/json" }), body: '{"confirm":"permtest"}' })).status === 401, "writer token cannot delete through the API");

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
  check((await fetch(`${BASE}/~mio/api/repos/permtest/delete`, { method: "POST", headers: H({ ...basic(ADMIN_TOKEN), origin: BASE, "content-type": "application/json" }), body: '{"confirm":"permtest"}' })).status === 401, "admin git token cannot delete through the API");
  const tagv = await (await apiGet("/~mio/api/r/permtest/view/tag/?h=v1")).json();
  check(tagv.kind === "tag" && tagv.name === "v1" && tagv.commit?.subject === "admin rewrite", "tag view");

  console.log("== revoke (API)");
  const list3 = (await (await apiGet("/~mio/api/tokens")).json()).tokens;
  const wid = list3.find((x) => x.name === "hark-writer")?.id;
  check((await apiPost(`/~mio/api/tokens/${wid}/revoke`, {}, { "x-csrf-token": "" })).status === 403, "revoke without CSRF -> 403");
  check((await apiPost(`/~mio/api/tokens/${wid}/revoke`, {})).status === 200, "revoke");
  check(git(tmp, "ls-remote", url(W, "permtest")).code !== 0, "revoked writer token fails immediately");
  check(git(tmp, "ls-remote", url(R, "permtest")).code === 0, "other tokens unaffected");
  check(!(await (await apiGet("/~mio/api/tokens")).json()).tokens.some((x) => x.id === wid), "revoked token leaves the list");
  const rvg = await consoleGet(`/~mio/tokens/${wid}/revoke`);
  check(rvg.status === 303 && /^\/~mio\/tokens\?next=/.test(rvg.headers.get("location") ?? ""), "old revoke URL -> tokens dialog");

  console.log("== delete a repository (console only)");
  check((await fetch(`${BASE}/deltest`, { method: "DELETE", headers: basic(ADMIN_TOKEN) })).status === 404, "admin git token cannot DELETE /<repo>");
  check((await fetch(`${BASE}/deltest/`)).status === 200, "…and deltest still exists");
  const dg = await consoleGet("/~mio/repos/deltest/delete");
  check(dg.status === 303 && dg.headers.get("location") === "/~mio/repos/deltest?s=danger", "old delete URL -> danger zone page");
  check((await apiPost("/~mio/api/repos/deltest/delete", { confirm: "deltest" }, { "x-csrf-token": "" })).status === 403, "delete without CSRF -> 403");
  check((await apiPost("/~mio/api/repos/deltest/delete", { confirm: "deltest" }, { origin: "https://evil.example" })).status === 403, "cross-origin delete -> 403");
  check((await fetch(`${BASE}/~mio/api/repos/deltest/delete`, { method: "POST", redirect: "manual", headers: { cookie, origin: BASE, "content-type": "application/json", "x-csrf-token": csrfJ }, body: '{"confirm":"deltest"}' })).status === 403, "delete without Access JWT -> 403");
  check((await apiPost("/~mio/api/repos/deltest/delete", { confirm: "deltes" })).status === 400, "wrong name -> 400, nothing deleted");
  check((await apiPost("/~mio/api/repos/deltest/delete", { confirm: "DELTEST" })).status === 400, "name is case-sensitive");
  check(git(tmp, "ls-remote", `${BASE}/deltest.git`).code === 0, "…deltest still clonable after refused deletes");
  const del = await apiPost("/~mio/api/repos/deltest/delete", { confirm: "deltest" });
  check(del.status === 200 && (await del.json()).deleted === "deltest", "delete with the exact name");
  check((await fetch(`${BASE}/deltest.git/info/refs?service=git-upload-pack`)).status === 404, "deleted repo: info/refs 404");
  const dc = git(tmp, "clone", "-q", `${BASE}/deltest.git`, join(tmp, "c-del"));
  check(dc.code !== 0 && /404|not found/i.test(dc.out), "deleted repo: git clone fails (404)");
  check((await fetch(`${BASE}/deltest/`)).status === 404, "deleted repo page 404");
  check(!(await fetch(`${BASE}/api/repos`, { headers: basic(ADMIN_TOKEN) }).then((x) => x.json())).repos.some((x) => x.name === "deltest"), "registry row removed");
  check(!(await (await fetch(`${BASE}/`)).text()).includes('"deltest"'), "public index no longer lists it (edge list cache dropped)");
  check((await consoleGet("/~mio/repos/deltest")).status === 404, "settings for the deleted repo 404");
  check(git(tmp, "clone", "-q", `${BASE}/mio-cli.git`, join(tmp, "c-cli")).code === 0 && git(tmp, "ls-remote", url(ADMIN_TOKEN, "permtest")).code === 0, "other repositories unaffected");
  check(git(src, "push", "-q", url(ADMIN_TOKEN, "deltest"), "main").code === 0 && git(tmp, "clone", "-q", `${BASE}/deltest.git`, join(tmp, "c-del2")).code === 0, "the name can be re-created by an admin push afterwards");

  console.log("== GitHub two-way sync (hook, webhook, workflow API)");
  const waitDispatch = async (pred, ms = 4000) => {
    for (let t = 0; t < ms; t += 100) {
      const hit = dispatches.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  };
  const sdir = join(tmp, "syncsrc");
  git(tmp, "init", "-q", sdir);
  commit(sdir, "s.txt", "s1\n", "s1");
  check(git(sdir, "push", "-q", url(ADMIN_TOKEN, "synctest"), "main").code === 0, "admin push creates synctest");
  const d1 = await waitDispatch((d) => d.client_payload?.repo === "synctest");
  check(d1?.event_type === "miogit-push" && d1.client_payload.origin === "miogit" && d1.client_payload.private === false && d1.client_payload.refs?.[0]?.ref === "refs/heads/main" && d1.auth === `Bearer ${SYNC_PAT}`, "push -> repository_dispatch miogit-push (repo, refs, public, PAT)");
  check(git(sdir, "push", "-q", url(ADMIN_TOKEN, "syncpriv"), "main").code === 0, "admin push creates syncpriv");
  await waitDispatch((d) => d.client_payload?.repo === "syncpriv");
  check((await apiPost("/~mio/api/repos/syncpriv", { s: "visibility", private: true })).status === 200, "syncpriv made private in the console");
  commit(sdir, "s.txt", "s2\n", "s2");
  dispatches.length = 0;
  check(git(sdir, "push", "-q", url(ADMIN_TOKEN, "syncpriv"), "main").code === 0, "push to private syncpriv");
  const dp = await waitDispatch((d) => d.client_payload?.repo === "syncpriv");
  check(dp?.client_payload?.private === true, "private repository: dispatch says private (GitHub copy will be private)");

  dispatches.length = 0;
  commit(sdir, "s.txt", "s3\n", "s3");
  check(git(sdir, "push", "-q", url(SYNC_TOKEN, "synctest"), "main").code === 0, "sync token can push (admin)");
  check((await waitDispatch((d) => d.client_payload?.repo === "synctest", 2000)) === null, "a push by the sync token is not dispatched (no echo)");

  const syncSg = await (await apiGet("/~mio/api/repos/synctest")).json();
  check(syncSg.sync === true, "settings API: sync on by default");
  check((await apiPost("/~mio/api/repos/synctest", { s: "sync", sync: "nope" })).status === 400, "sync switch needs a boolean");
  const soff = await apiPost("/~mio/api/repos/synctest", { s: "sync", sync: false });
  const soffb = await soff.json();
  check(soff.status === 200 && soffb.sync === false && soffb.description === syncSg.description && soffb.private === syncSg.private, "sync switched off (nothing else changed)");
  commit(sdir, "s.txt", "s4\n", "s4");
  check(git(sdir, "push", "-q", url(ADMIN_TOKEN, "synctest"), "main").code === 0, "push with sync off");
  check((await waitDispatch((d) => d.client_payload?.repo === "synctest", 2000)) === null, "sync off: push not dispatched");

  // webhook
  const sign = (body, secret = SYNC_HOOK_SECRET) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const hook = (event, payload, sig) => {
    const body = JSON.stringify(payload);
    return fetch(`${BASE}/~sync/github`, { method: "POST", headers: { "content-type": "application/json", "x-github-event": event, ...(sig === null ? {} : { "x-hub-signature-256": sig ?? sign(body) }) }, body });
  };
  const synHead = (await (await fetch(`${BASE}/synctest/api/refs`)).json()).refs.find((r) => r.name === "refs/heads/main").target;
  const pushEv = (repo, after, ref = "refs/heads/main") => ({ ref, before: "0".repeat(40), after, repository: { name: repo, full_name: `mio-co/${repo}`, private: false } });
  check((await hook("push", pushEv("synctest", synHead), null)).status === 401, "webhook without signature -> 401");
  check((await hook("push", pushEv("synctest", synHead), sign("other body"))).status === 401, "webhook with a wrong signature -> 401");
  check((await hook("push", pushEv("synctest", synHead), sign(JSON.stringify(pushEv("synctest", synHead)), "wrong-secret"))).status === 401, "webhook signed with another secret -> 401");
  check((await fetch(`${BASE}/~sync/github`)).status === 405, "webhook GET -> 405");
  check((await hook("ping", { zen: "x" })).status === 200, "webhook ping (signed) -> 200");
  check((await apiPost("/~mio/api/repos/synctest", { s: "sync", sync: true })).status === 200, "sync switched back on");
  dispatches.length = 0;
  const same = await hook("push", pushEv("SyncTest", synHead));
  check(same.status === 202 && /already in sync/.test(await same.text()), "GitHub push MioGit already has (echo, case-insensitive name) -> skipped");
  const newer = "1".repeat(40);
  const nw = await hook("push", pushEv("synctest", newer));
  check(nw.status === 202, "GitHub push with a new commit -> 202");
  const sy_dg = await waitDispatch((d) => d.event_type === "github-push");
  check(sy_dg?.client_payload?.repo === "synctest" && sy_dg.client_payload.miogit === "synctest" && sy_dg.client_payload.refs?.[0]?.new === newer, "-> repository_dispatch github-push");
  check((await apiPost("/~mio/api/repos/synctest", { s: "sync", sync: false })).status === 200, "sync off again");
  dispatches.length = 0;
  await hook("push", pushEv("synctest", "2".repeat(40)));
  check((await waitDispatch(() => true, 1500)) === null, "sync off: GitHub push not dispatched");
  await apiPost("/~mio/api/repos/synctest", { s: "sync", sync: true });
  await hook("push", pushEv("miogit-sync", "3".repeat(40)));
  await hook("repository", { action: "created", repository: { name: "brand-new", full_name: "mio-co/brand-new", private: true } });
  const sy_dc = await waitDispatch((d) => d.client_payload?.repo === "brand-new");
  check(sy_dc?.client_payload?.action === "created" && sy_dc.client_payload.private === true && sy_dc.client_payload.miogit === null, "repository created on GitHub -> dispatch (private, not on MioGit yet)");
  check(!dispatches.some((d) => d.client_payload?.repo === "miogit-sync"), "the sync repository itself is never synced");

  // workflow API
  const sapi = (path, init = {}, tok = SYNC_TOKEN) => fetch(`${BASE}/~sync/api${path}`, { ...init, headers: { ...(tok ? basic(tok) : {}), "content-type": "application/json", ...(init.headers ?? {}) } });
  check((await sapi("/repos", {}, null)).status === 401, "sync API without credentials -> 401");
  check((await sapi("/repos", {}, ADMIN_TOKEN)).status === 401, "sync API refuses the ordinary admin token");
  const sl = await (await sapi("/repos")).json();
  const slp = sl.repos?.find((r) => r.name === "syncpriv");
  check(slp?.private === true && slp.sync === true && sl.repos.find((r) => r.name === "synctest")?.sync === true, "sync API lists every repository with private + sync flags");
  const cr = await sapi("/repos/ghnew", { method: "POST", body: JSON.stringify({ create: true, private: true, description: "from GitHub" }) });
  check(cr.status === 200 && (await cr.json()).created === true, "sync API creates a repository ahead of its first push (private)");
  check(!(await (await fetch(`${BASE}/api/repos`)).json()).repos.some((r) => r.name === "ghnew"), "it is private from the start (not in the anonymous list)");
  check(git(sdir, "push", "-q", url(SYNC_TOKEN, "ghnew"), "main").code === 0 && git(tmp, "ls-remote", `${BASE}/ghnew.git`).code !== 0, "sync token fills it; anonymous ls-remote refused");
  check((await sapi("/repos/ghnew", { method: "POST", body: JSON.stringify({ private: false }) })).status === 200 && git(tmp, "ls-remote", `${BASE}/ghnew.git`).code === 0, "sync API visibility change (public) takes effect");
  check((await sapi("/state/ghnew", { method: "PUT", body: JSON.stringify({ linked: true, refs: { "refs/heads/main": "a".repeat(40) } }) })).status === 200, "sync API stores state");
  check((await (await sapi("/repos")).json()).repos.find((r) => r.name === "ghnew")?.state?.refs?.["refs/heads/main"] === "a".repeat(40), "state comes back in the list");
  check((await sapi("/repos/bad..name%2F", { method: "POST", body: "{}" })).status === 400 || (await sapi("/repos/-bad", { method: "POST", body: "{}" })).status === 400, "bad names refused");

  console.log("== password change (API) + logout + rate limit");
  check((await apiPost("/~mio/api/password", { current: CONSOLE_PASS, next: "short", confirm: "short" })).status === 400, "short new password refused");
  check((await apiPost("/~mio/api/password", { current: "wrong-password-x", next: "abcdefghijklmn", confirm: "abcdefghijklmn" })).status === 400, "wrong current password refused");
  check((await apiPost("/~mio/api/password", { current: CONSOLE_PASS, next: "abcdefghijklmn", confirm: "abcdefghijklmo" })).status === 400, "mismatched new passwords refused");
  const NEWPASS = randomBytes(15).toString("base64url");
  const oldCookie = cookie;
  const pc = await apiPost("/~mio/api/password", { current: CONSOLE_PASS, next: NEWPASS, confirm: NEWPASS });
  takeCookie(pc);
  const pcb = await pc.json();
  check(pc.status === 200 && cookie !== oldCookie && pcb.csrf && pcb.csrf !== csrfJ, "password changed: fresh session + fresh CSRF token");
  check((await fetch(`${BASE}/~mio/api/repos`, { headers: H({ cookie: oldCookie }) })).status === 401, "old session signed out");
  csrfJ = pcb.csrf;
  check((await apiGet("/~mio/api/repos")).status === 200, "new session works");
  const lo = await apiPost("/~mio/api/logout", {});
  check(lo.status === 200 && /mg_admin=; Path=\/~mio\/; Max-Age=0/.test(lo.headers.get("set-cookie") ?? "") && /mg_signed=; Path=\/; Max-Age=0/.test(lo.headers.get("set-cookie") ?? ""), "logout clears the session and the hint cookie");
  const pubAfter = bootOf(await (await fetch(`${BASE}/`, { redirect: "manual" })).text());
  check(pubAfter?.signed === false && !JSON.stringify(pubAfter).includes("permtest"), "after logout / is the normal public index again");
  cookie = "";
  check((await jl({ username: "mio", password: CONSOLE_PASS })).status === 401, "old password no longer works");
  let locked = false;
  for (let i = 0; i < 6; i++) if ((await jl({ username: "mio", password: "nope" + i })).status === 429) locked = true;
  check(locked, "API login locked after repeated failures (429)");
  check((await jl({ username: "mio", password: NEWPASS })).status === 429, "correct password also refused while locked");
  check(/Too many failed attempts/.test(await (await consolePost("/~mio/login", { username: "mio", password: NEWPASS })).text()), "form login shares the same lock");
} catch (e) {
  bad(`exception: ${e.stack ?? e}`);
} finally {
  cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log(serverLog.slice(-4000));
  rmSync(tmp, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}
