/**
 * durable-git library entry. `createDurableGit(options)` returns the Worker
 * handler; re-export `RepoCell` and `Registry` from your entry module so the
 * runtime can find the Durable Object classes:
 *
 *   import { createDurableGit } from "durable-git";
 *   export { RepoCell, Registry } from "durable-git";
 *   export default createDurableGit({ authorize, onPush });
 */
import type { Env } from "./env";
import type { RepoInfo } from "./registry";
import { esc, repoUrl, age, layout, htmlResponse, errorPage, t } from "./ui/html";
import { langColor } from "./ui/langs";
import { CSS, APP_JS, UI_VER } from "./ui/mio";

import { parseUploadRequest, streamingCloneResponse } from "./git/protocol";
import { isOid } from "./git/util";
import { gunzipLimited } from "./git/zlib";
import type { RepoCell } from "./repo";

export { RepoCell } from "./repo";
export { Registry } from "./registry";
export type { Env } from "./env";
export type { RepoInfo, RepoConfig } from "./registry";
export type { RefsResult, CommitJson, TreeResult, TreeEntryJson, BlobResult, LogResult, DiffResult, DiffFileJson } from "./repo";
export type { Person } from "./git/objects";

/** an upload-pack negotiation body is wants/haves/caps only — a few hundred KB */
const MAX_UPLOAD_PACK_BYTES = 16 * 1024 * 1024;

const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RESERVED = new Set(["api", "cgit.css", "app.js", "favicon.ico", "robots.txt", "info", "git-upload-pack", "git-receive-pack"]);
const CACHE_TTL = 60;

/** What a request is asking to do, from the repository's point of view. */
export type AuthOp = "read" | "write" | "admin";

export interface AuthContext<E extends Env = Env> {
  repo: string;
  /** read: pages, clones, fetches, the content API; write: git push; admin: config/gc/delete */
  op: AuthOp;
  /** the repository's private flag (false for a repository that does not exist yet) */
  private: boolean;
  /** HTTP Basic credentials on the request, if any */
  credentials: { user: string; pass: string } | null;
  /** the live incoming request: headers and URL only — do NOT read its body,
   * which is consumed downstream (a hook that drains it breaks every push) */
  request: Request;
  env: E;
}

export interface RefUpdate {
  ref: string;
  /** all-zeros for a created ref */
  old: string;
  /** all-zeros for a deleted ref */
  new: string;
}

export interface PushEvent {
  repo: string;
  /** the ref updates this push actually applied (rejected commands excluded) */
  updates: RefUpdate[];
  /** unix millis of the newest committer date after the push */
  commitTime: number;
}

export interface DurableGitOptions<E extends Env = Env> {
  /**
   * Gate every repository-scoped request. Return true to allow, false for the
   * default 401 Basic challenge, or a Response to send verbatim (a custom
   * challenge, a redirect to your login page). The default implementation is
   * the stock token check: reads of public repositories are open; writes,
   * admin operations, and anything on a private repository require a
   * GIT_TOKEN/GIT_TOKENS match, with per-IP failure rate limiting.
   */
  authorize?: (ctx: AuthContext<E>) => boolean | Response | Promise<boolean | Response>;
  /**
   * Fired after a push applies at least one ref update, off the response path
   * (via waitUntil), so a slow or throwing hook never fails the push.
   */
  onPush?: (event: PushEvent, env: E) => void | Promise<void>;
  /**
   * false runs dgit headless: the git protocol, admin endpoints, and the JSON
   * API stay; every page (index and repo UI) 404s, so a wrapping Worker can
   * own the whole frontend. Default true.
   */
  ui?: boolean;
  /**
   * access-control-allow-origin for the JSON API (e.g. "*"), so a
   * cross-origin UI can call it from the browser; preflights are answered.
   */
  cors?: string;
  /**
   * true routes every repository as <owner>/<name> (GitHub-style, exactly two
   * segments); the combined name is the repository name everywhere — hooks,
   * the registry, the API, RPC (env.REPO.getByName("owner/name")). Default
   * false: flat single-segment names.
   */
  namespaces?: boolean;
}

function tokens(env: Env): string[] {
  const list = [env.GIT_TOKEN ?? "", ...(env.GIT_TOKENS ?? "").split(",")];
  return list.map((t) => t.trim()).filter(Boolean);
}

function unauthorized(): Response {
  return new Response("auth required\n", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="MioHub"' },
  });
}

function tooManyRequests(retryAfterMs: number): Response {
  return new Response("too many failed attempts\n", {
    status: 429,
    headers: { "retry-after": String(Math.ceil(retryAfterMs / 1000)) },
  });
}

async function digest(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** Fixed-length SHA-256 digests, so this leaks nothing about input length. */
function digestsEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * Timing-safe string comparison for authorize hooks. `credentials.pass ===
 * secret` leaks the match length through timing; compare through this instead.
 */
export async function secretsEqual(a: string, b: string): Promise<boolean> {
  return digestsEqual(await digest(a), await digest(b));
}

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function parseBasic(req: Request): { user: string; pass: string } | null {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const colon = decoded.indexOf(":");
    if (colon === -1) return { user: decoded, pass: "" };
    return { user: decoded.slice(0, colon), pass: decoded.slice(colon + 1) };
  } catch {
    return null;
  }
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_MAX_IPS = 5000;
const authFailures = new Map<string, { count: number; resetAt: number }>();

function pruneAuthFailures(now: number): void {
  if (authFailures.size <= RATE_LIMIT_MAX_IPS) return;
  for (const [ip, e] of authFailures) {
    if (e.resetAt <= now) authFailures.delete(ip);
  }
  while (authFailures.size > RATE_LIMIT_MAX_IPS) {
    const oldest = authFailures.keys().next().value;
    if (oldest === undefined) break;
    authFailures.delete(oldest);
  }
}

function rateLimited(ip: string): number | null {
  const e = authFailures.get(ip);
  if (!e || e.resetAt <= Date.now()) return null;
  return e.count >= RATE_LIMIT_MAX ? e.resetAt - Date.now() : null;
}

function recordAuthFailure(ip: string): void {
  const now = Date.now();
  const e = authFailures.get(ip);
  if (!e || e.resetAt <= now) {
    authFailures.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    e.count++;
  }
  pruneAuthFailures(now);
}

/** The default authorize: HTTP Basic where the password is one of the configured tokens. */
async function tokenAuthorize(ctx: AuthContext): Promise<boolean | Response> {
  if (ctx.op === "read" && !ctx.private) return true;
  const valid = tokens(ctx.env);
  if (!valid.length) {
    return new Response("access is disabled: set the GIT_TOKEN secret\n", { status: 403 });
  }
  const header = ctx.request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return unauthorized();

  const ip = clientIp(ctx.request);
  const retryMs = rateLimited(ip);
  if (retryMs !== null) return tooManyRequests(retryMs);

  // a Basic header that failed to decode is a failed attempt, same as a wrong
  // password — otherwise malformed headers probe the endpoint rate-limit-free
  if (!ctx.credentials) {
    recordAuthFailure(ip);
    return unauthorized();
  }

  const passDigest = await digest(ctx.credentials.pass);
  let ok = false;
  for (const v of valid) ok = digestsEqual(passDigest, await digest(v)) || ok;
  if (!ok) {
    recordAuthFailure(ip);
    return unauthorized();
  }
  return true;
}

// ---- browser sessions -------------------------------------------------------
// A signed cookie (expiry + HMAC keyed off the push token), so rotating
// GIT_TOKEN signs everyone out. It only grants page reads, never writes, so a
// cross-site form can't push or change config with it.
const SESSION_COOKIE = "mh_s";
const SESSION_DAYS = 30;

async function sessionKey(env: Env): Promise<CryptoKey | null> {
  const list = tokens(env);
  if (!list.length) return null;
  const raw = await digest(`miohub-session:${list[0]}`);
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function b64url(b: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function makeSession(env: Env): Promise<string | null> {
  const key = await sessionKey(env);
  if (!key) return null;
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(exp));
  return `${exp}.${b64url(sig)}`;
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

async function sessionValid(req: Request, env: Env): Promise<boolean> {
  const v = readCookie(req, SESSION_COOKIE);
  if (!v) return false;
  const [exp, sig] = v.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || parseInt(exp, 10) < Date.now() / 1000) return false;
  const key = await sessionKey(env);
  if (!key) return false;
  const expect = b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(exp)));
  return secretsEqual(expect, sig);
}

/** remember: a 30-day cookie; otherwise a browser-session cookie that ends when the browser closes. */
function sessionCookie(v: string, remember = true): string {
  const age = remember ? `; Max-Age=${SESSION_DAYS * 86400}` : "";
  return `${SESSION_COOKIE}=${v}; Path=/${age}; HttpOnly; Secure; SameSite=Lax`;
}
function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function redirect(to: string, cookie?: string): Response {
  const h = new Headers({ location: to, "cache-control": "no-store" });
  if (cookie) h.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers: h });
}

function safeNext(n: string | null): string {
  return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}

async function loginPage(env: Env, next: string, error = "", remember = true): Promise<Response> {
  const LOCK = `<svg viewBox='0 0 256 256' aria-hidden='true'><rect x='40' y='88' width='176' height='128' rx='8' fill='none' stroke='currentColor' stroke-width='16'/><path d='M88 88V56a40 40 0 0 1 80 0v32' fill='none' stroke='currentColor' stroke-width='16' stroke-linecap='round'/></svg>`;
  const cancel = next === "/" || next.startsWith("/login") ? "/" : next;
  const dialog = `
<div class='mio-dialog-layer' data-dialog-layer>
<div class='mio-backdrop'></div>
<form class='mio-dialog' role='dialog' aria-modal='true' aria-labelledby='login-t' aria-describedby='login-d' method='post' action='/login' data-cancel='${esc(cancel)}'>
  <div class='mio-dialog-icon'>${LOCK}</div>
  <h2 id='login-t'>${t("Sign in to MioHub", "登录 MioHub")}</h2>
  <p id='login-d'>${t("Use your push password. Once signed in, private repositories show up too.", "使用推送密码登录，登录后可以查看私有仓库。")}</p>
  ${error ? `<div class='mio-dialog-err' role='alert'>${error}</div>` : ""}
  <input type='hidden' name='next' value='${esc(next)}'/>
  <input type='text' name='username' value='mio' autocomplete='username' hidden readonly tabindex='-1' aria-hidden='true'/>
  <label class='mio-field'><span>${t("Password", "密码")}</span><input type='password' name='password' autocomplete='current-password' required autofocus${error ? " aria-invalid='true'" : ""}/></label>
  <label class='mio-check'><input type='checkbox' name='remember' value='1'${remember ? " checked" : ""}/><span>${t("Remember password", "记住密码")}</span></label>
  <div class='mio-dialog-actions'>
    <a class='mio-btn mio-btn-secondary mio-btn-md' href='${esc(cancel)}' data-dialog-cancel>${t("Cancel", "取消")}</a>
    <button type='submit' class='mio-btn mio-btn-primary mio-btn-md'>${t("Sign in", "登录")}</button>
  </div>
</form>
</div>`;
  const behind = `<div class='mio-behind' inert aria-hidden='true'>${await indexBody(env, false).catch(() => "")}</div>`;
  const res = htmlResponse(layout({ ...siteBase(env), tab: "login-bg", body: behind, overlay: dialog }), error ? 401 : 200);
  res.headers.set("cache-control", "no-store");
  return res;
}

async function loginRoute(req: Request, env: Env, url: URL, signedIn: boolean): Promise<Response> {
  if (req.method === "GET") {
    const next = safeNext(url.searchParams.get("next"));
    return signedIn ? redirect(next) : await loginPage(env, next);
  }
  if (req.method !== "POST") return new Response("method not allowed\n", { status: 405 });
  const ip = clientIp(req);
  const retry = rateLimited(ip);
  const form = await req.formData().catch(() => null);
  const next = safeNext((form?.get("next") as string | null) ?? null);
  if (retry !== null) return loginPage(env, next, t("Too many attempts. Try again in a minute.", "尝试次数过多，请一分钟后再试。"), form?.get("remember") === "1");
  const pass = String(form?.get("password") ?? "");
  const remember = form?.get("remember") === "1";
  const valid = tokens(env);
  let ok = false;
  const pd = await digest(pass);
  for (const v of valid) ok = digestsEqual(pd, await digest(v)) || ok;
  if (!ok || !pass) {
    recordAuthFailure(ip);
    return loginPage(env, next, t("Wrong password.", "密码不正确。"), remember);
  }
  const v = await makeSession(env);
  return v ? redirect(next, sessionCookie(v, remember)) : loginPage(env, next, "GIT_TOKEN is not set");
}

/** Fill the top bar's account slot per request, so cached pages stay shared. Signed-in HTML is never stored by the browser. */
function decorate(res: Response, signedIn: boolean, url: URL): Response {
  if (!(res.headers.get("content-type") ?? "").startsWith("text/html")) return res;
  const next = encodeURIComponent(url.pathname + url.search);
  const html = signedIn
    ? `<form method='post' action='/logout' class='mio-auth'><button type='submit' class='mio-btn mio-btn-ghost'>${t("Sign out", "退出")}</button></form>`
    : url.pathname === "/login" ? "" : `<a class='mio-btn mio-btn-ghost mio-auth' href='/login?next=${next}'>${t("Sign in", "登录")}</a>`;
  let out: Response;
  if (typeof HTMLRewriter !== "undefined") {
    out = new HTMLRewriter().on("#mh-auth", { element(e) { e.replace(html, { html: true }); } }).transform(res);
  } else {
    out = new Response(res.body, res);
  }
  if (signedIn) {
    out = new Response(out.body, out);
    out.headers.set("cache-control", "private, no-store");
  }
  return out;
}

function siteBase(env: Env) {
  return {
    site: env.SITE_NAME ?? "MioHub",
    siteDesc: env.SITE_DESC ?? "",
    title: env.SITE_NAME ?? "MioHub",
    sub: env.SITE_DESC ?? "",
    tab: "index",
  };
}

async function indexPage(env: Env, signedIn = false): Promise<Response> {
  return htmlResponse(layout({ ...siteBase(env), body: await indexBody(env, signedIn) }));
}

async function indexBody(env: Env, signedIn = false): Promise<string> {
  const registry = env.REGISTRY.getByName("registry");
  const repos = await registry.list(1000, undefined, signedIn);
  let rows = "";
  for (const r of repos) {
    const secs = Math.floor(r.idle / 1000);
    const iso = new Date(r.idle).toISOString();
    rows +=
      `<li data-name='${esc(r.name.toLowerCase())}' data-t='${secs}'>` +
      `<a class='rl-name' href='/${repoUrl(r.name)}/'>${esc(r.name)}${r.priv ? `<span class='mio-badge rl-priv'>${t("Private", "私有")}</span>` : ""}</a>` +
      `<p class='rl-desc'>${r.desc ? esc(r.desc) : t("No description", "暂无描述")}</p>` +
      `<div class='rl-meta'>` +
      (r.lang ? `<span class='rl-lang' data-noi18n><i style='background:${langColor(r.lang)}'></i>${esc(r.lang)}</span>` : "") +
      `<span class='rl-owner'>${esc(r.owner || env.SITE_OWNER || "")}</span>` +
      `<time datetime='${iso}' title='${iso.slice(0, 16).replace("T", " ")} UTC'>${age(secs)}</time></div></li>`;
  }
  const sortBar = repos.length > 1
    ? `<div class='mio-seg rl-sort' role='group' aria-label='sort'>` +
      `<button type='button' data-sort='time' aria-pressed='true'>${t("Recently updated", "最近更新")}</button>` +
      `<button type='button' data-sort='name' aria-pressed='false'>${t("Name", "名称")}</button></div>`
    : "";
  const body = repos.length
    ? `<div class='rl-bar'><span class='rl-count'>${t(`${repos.length} repositories`, `${repos.length} 个仓库`)}</span>${sortBar}</div><ul class='repo-list' id='repo-list'>${rows}</ul>`
    : `<div class='mio-empty'>${t("No public repositories yet. Create one by pushing:", "还没有公开仓库，推送即可创建：")}<br/><code>git push https://&lt;this-host&gt;/myrepo.git main</code></div>`;
  return body;
}

/**
 * Per-isolate memo of registry lookups. Without it every page view — cache
 * hit or not — funnels through the single Registry DO, which becomes the
 * global bottleneck under a traffic spike. Staleness window is small and
 * only affects metadata (descriptions, versions, the private flag). Bounded
 * and short-TTL'd on misses so enumerating random repo names can't grow it
 * unbounded.
 */
const infoMemo = new Map<string, { at: number; info: RepoInfo | null }>();
const INFO_TTL_MS = 20_000;
const INFO_NEG_TTL_MS = 2_000;
const INFO_MEMO_MAX = 5000;

function pruneInfoMemo(): void {
  while (infoMemo.size > INFO_MEMO_MAX) {
    const oldest = infoMemo.keys().next().value;
    if (oldest === undefined) break;
    infoMemo.delete(oldest);
  }
}

async function repoInfo(env: Env, repo: string, fresh: boolean): Promise<RepoInfo | null> {
  const hit = infoMemo.get(repo);
  if (!fresh && hit && Date.now() - hit.at < (hit.info ? INFO_TTL_MS : INFO_NEG_TTL_MS)) return hit.info;
  const info = await env.REGISTRY.getByName("registry").get(repo);
  infoMemo.set(repo, { at: Date.now(), info });
  pruneInfoMemo();
  return info;
}

/** Cache API is a Cloudflare-only surface; celld has none, so feature-detect. */
function pageCache(): Cache | null {
  try {
    // eslint-disable-next-line no-undef
    return typeof caches !== "undefined" && (caches as unknown as { default?: Cache }).default
      ? (caches as unknown as { default: Cache }).default
      : null;
  } catch {
    return null;
  }
}

/**
 * R2 full-clone fast path, served entirely from the Worker so the DO is never
 * contacted for bytes (this is the read-offload that avoids the workerd
 * DO->response stall on large packs). Detects a true full clone from the tiny
 * negotiation body — wants, no haves, `done`, not shallow/deepen, side-band-64k
 * — then asks the DO only for the cheap versioned key (no pack generation) and
 * streams the stored raw pack from R2 with on-the-fly side-band framing. Returns
 * null (a miss, a partial/shallow fetch, or any failure) to fall through to the
 * normal DO clone path. Callers MUST invoke this only after the auth gate, so a
 * private repo never streams R2 bytes to an anonymous client.
 */
async function serveCloneFromR2(
  env: Env,
  repo: string,
  body: Uint8Array,
  stub: DurableObjectStub<RepoCell>
): Promise<Response | null> {
  const bucket = env.PACK_CACHE;
  if (!bucket) return null;
  const req = parseUploadRequest(body);
  const fullClone =
    req.wants.length > 0 &&
    req.wants.every(isOid) &&
    req.haves.length === 0 &&
    req.done &&
    req.deepen === 0 &&
    req.clientShallows.length === 0 &&
    (req.command === "fetch" || req.caps.has("side-band-64k"));
  if (!fullClone) return null;
  let key: string | null;
  try {
    key = await stub.currentPackKey(repo, req.wants);
  } catch {
    return null;
  }
  if (!key) return null;
  let obj: R2ObjectBody | null;
  try {
    obj = await bucket.get(key);
  } catch {
    return null;
  }
  if (!obj) return null;
  const objects = parseInt(obj.customMetadata?.objects ?? "", 10);
  if (!Number.isFinite(objects)) return null;
  return streamingCloneResponse(obj.body, objects, req.caps.has("no-progress"), req.command === "fetch");
}

function withCors(res: Response, origin: string | undefined): Response {
  if (origin) res.headers.set("access-control-allow-origin", origin);
  return res;
}

function corsPreflight(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET",
      "access-control-allow-headers": "authorization",
      "access-control-max-age": "86400",
    },
  });
}

function parseRefUpdates(res: Response): RefUpdate[] {
  const header = res.headers.get("x-ref-updates");
  if (!header) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(header)) as RefUpdate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** The returned handler: a valid Worker default export, with `fetch` non-optional
 * so it can also be delegated to from a wrapping router. */
export interface DurableGitHandler<E extends Env = Env> {
  fetch(req: Request, env: E, ctx: ExecutionContext): Promise<Response>;
}

/**
 * Parse a repository route: /<name>[.git][/sub] flat, /<owner>/<name>[.git][/sub]
 * namespaced. null for anything that is not a well-formed repository path
 * (bad or reserved names, undecodable escapes).
 */
function repoPath(
  pattern: URLPattern,
  namespaced: boolean,
  path: string
): { repo: string; sub: string } | null {
  const m = pattern.exec({ pathname: path });
  if (!m) return null;
  const g = m.pathname.groups;
  const segs: string[] = [];
  for (const raw of namespaced ? [g.owner, g.name] : [g.name]) {
    if (!raw) return null;
    let seg: string;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (!REPO_NAME.test(seg)) return null;
    segs.push(seg);
  }
  if (RESERVED.has(segs[0])) return null;
  return { repo: segs.join("/"), sub: g["0"] ? `/${g["0"]}` : "/" };
}

/** What a repository sub-path is asking for, and the authorize op it implies. */
function classify(sub: string, method: string, url: URL): {
  op: AuthOp;
  isReceive: boolean;
  isProtocol: boolean;
  isApi: boolean;
  isAdmin: boolean;
} {
  const isReceive =
    sub === "/git-receive-pack" ||
    (sub === "/info/refs" && url.searchParams.get("service") === "git-receive-pack");
  const isProtocol = isReceive || sub === "/git-upload-pack" || sub === "/info/refs";
  const isApi = sub.startsWith("/api/");
  const isAdmin =
    ((sub === "/config" || sub === "/description") && method === "PUT") ||
    (sub === "/gc" && method === "POST") ||
    ((sub === "/" || sub === "") && method === "DELETE");
  return { op: isReceive ? "write" : isAdmin ? "admin" : "read", isReceive, isProtocol, isApi, isAdmin };
}

export function createDurableGit<E extends Env = Env>(options: DurableGitOptions<E> = {}): DurableGitHandler<E> {
  const authorize = options.authorize ?? tokenAuthorize;
  const ui = options.ui !== false;
  const namespaced = !!options.namespaces;
  const repoRoute = new URLPattern({
    pathname: namespaced ? "/:owner/:name{.git}?{/*}?" : "/:name{.git}?{/*}?",
  });
  const inner = async (req: Request, env: E, ctx: ExecutionContext, signedIn: boolean): Promise<Response> => {
      const url = new URL(req.url);
      const path = url.pathname;

      if (ui && path === "/login") return loginRoute(req, env, url, signedIn);
      if (ui && path === "/logout") {
        if (req.method !== "POST") return new Response("method not allowed\n", { status: 405 });
        return redirect("/", clearSessionCookie());
      }

      // site-level JSON ("api" is a reserved repository name)
      if (path.startsWith("/api/")) {
        if (options.cors && req.method === "OPTIONS") return corsPreflight(options.cors);
        const json = (data: unknown, status = 200) =>
          withCors(Response.json(data, { status, headers: { "x-content-type-options": "nosniff" } }), options.cors);
        if (path === "/api/repos" && req.method === "GET") {
          const ns = url.searchParams.get("owner") ?? undefined;
          const repos = await env.REGISTRY.getByName("registry").list(1000, ns);
          return json({
            repos: repos.map((r) => ({ name: r.name, description: r.desc, owner: r.owner, section: r.section, idle: r.idle })),
          });
        }
        return json({ error: "not found" }, 404);
      }

      if (!ui && (path === "/" || path === "" || path === "/cgit.css" || path === "/app.js" || path === "/robots.txt" || path === "/favicon.ico")) {
        return new Response("not found\n", { status: 404 });
      }

      if (path === "/" || path === "") {
        if (signedIn) return indexPage(env, true);
        // the index is the front door under load: cache it briefly at the edge
        const cache = pageCache();
        if (cache) {
          const key = new Request(`${url.origin}/?__index&__ui=${UI_VER}`, { method: "GET" });
          const hit = await cache.match(key);
          if (hit) return hit;
          const res = await indexPage(env);
          const toCache = new Response(res.clone().body, res);
          toCache.headers.set("cache-control", "public, max-age=30");
          ctx.waitUntil(cache.put(key, toCache));
          return res;
        }
        return indexPage(env);
      }
      if (path === "/app.js") {
        return new Response(APP_JS, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": url.searchParams.get("v") === UI_VER ? "public, max-age=31536000, immutable" : "no-cache" } });
      }
      if (path === "/cgit.css") {
        return new Response(CSS, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": url.searchParams.get("v") === UI_VER ? "public, max-age=31536000, immutable" : "no-cache" } });
      }
      if (path === "/robots.txt") {
        return new Response(
          "User-agent: *\nDisallow: /*/snapshot/\nDisallow: /*/blame/\nDisallow: /*/stats/\nDisallow: /*/diff/\nDisallow: /*/rawdiff/\nDisallow: /*/patch/\n",
          { headers: { "content-type": "text/plain" } }
        );
      }
      if (path === "/favicon.ico") {
        return new Response("not found\n", { status: 404 });
      }

      const parsed = repoPath(repoRoute, namespaced, path);
      if (!parsed) {
        return ui
          ? errorPage(siteBase(env), `no such repository: ${path}`, 404)
          : new Response("not found\n", { status: 404 });
      }
      const { repo, sub } = parsed;
      const { op, isReceive, isProtocol, isApi, isAdmin } = classify(sub, req.method, url);

      const registry = env.REGISTRY.getByName("registry");

      // headless: pages 404 before touching the registry or the cell; a CORS
      // preflight (credential-less by spec) is answered before the auth gate
      if (!ui && !isProtocol && !isApi && !isAdmin) {
        return new Response("not found\n", { status: 404 });
      }
      if (options.cors && isApi && req.method === "OPTIONS") {
        return corsPreflight(options.cors);
      }

      // mutations read the registry fresh; page views tolerate a short memo
      const info: RepoInfo | null = await repoInfo(env, repo, isReceive || isAdmin);

      // every repo-scoped request passes through authorize; the default hook
      // waves reads of public repositories straight through
      const decision = await authorize({
        repo,
        op,
        private: !!info?.priv,
        credentials: parseBasic(req),
        request: req,
        env,
      });
      const pageRead = op === "read" && !isProtocol && !isApi;
      if (decision !== true && pageRead && signedIn) {
        // a signed-in browser may read any repository page
      } else if (decision instanceof Response) {
        if (pageRead && decision.status === 401 && !req.headers.has("authorization")) return redirect(`/login?next=${encodeURIComponent(path + url.search)}`);
        return decision;
      } else if (!decision) return unauthorized();

      // only pushes and admin ops may touch repos that don't exist yet
      if (!info && !isReceive && !isAdmin) {
        if (isApi) return Response.json({ error: `repository not found: ${repo}` }, { status: 404 });
        if (isProtocol) return new Response(`repository not found: ${repo}\n`, { status: 404 });
        return errorPage(siteBase(env), `no such repository: ${repo}`, 404);
      }

      // page cache for public repo GET pages (versioned key; skipped on celld)
      const cache = pageCache();
      const cacheable =
        cache !== null &&
        req.method === "GET" &&
        !isProtocol &&
        info !== null &&
        !info.priv &&
        !req.headers.has("authorization");
      let cacheKey: Request | null = null;
      if (cacheable) {
        const keyUrl = new URL(url.toString());
        keyUrl.searchParams.set("__v", String(info!.ver));
        keyUrl.searchParams.set("__ui", UI_VER);
        cacheKey = new Request(keyUrl.toString(), { method: "GET" });
        const hit = await cache!.match(cacheKey);
        if (hit) {
          // the edge keeps it briefly; browsers must revalidate so a new skin shows at once
          const out = new Response(hit.body, hit);
          out.headers.set("cache-control", "no-cache");
          return out;
        }
      }

      const stub = env.REPO.getByName(repo);
      const doUrl = new URL(req.url);
      doUrl.pathname = sub;
      // The push body streams straight through to the repository cell — the
      // outer Worker never holds the pack. celld <0.3 re-wrapped a bytes-backed
      // request into a stream-backed one that UTF-8-decoded the whole body
      // (fatal for a binary pack), so this path requires celld >=0.3, where the
      // body decodes lazily (denoland/celld.dev#129) and a local Durable Object
      // call forwards the body as a stream (denoland/celld.dev#156).
      let fwdBody: BodyInit | null = null;
      if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
        const declared = parseInt(req.headers.get("content-length") ?? "", 10);
        const smallUploadPack =
          sub === "/git-upload-pack" && (!Number.isFinite(declared) || declared <= MAX_UPLOAD_PACK_BYTES);
        if (smallUploadPack) {
          // buffer the tiny negotiation body so a full clone can be served straight
          // from R2 (never touching the DO for bytes); the auth gate above has
          // already run, so a private repo cannot reach this point anonymously.
          const raw = new Uint8Array(await req.arrayBuffer());
          let parsed: Uint8Array = raw;
          if (req.headers.get("content-encoding")?.includes("gzip")) {
            try {
              parsed = gunzipLimited(raw, MAX_UPLOAD_PACK_BYTES);
            } catch {
              parsed = new Uint8Array(0);
            }
          }
          if (env.PACK_CACHE && parsed.length) {
            const hit = await serveCloneFromR2(env, repo, parsed, stub);
            if (hit) return hit;
          }
          fwdBody = raw; // miss: forward the original (still-encoded) bytes to the DO
        } else {
          fwdBody = req.body;
        }
      }
      const fwd = new Request(doUrl.toString(), {
        method: req.method,
        headers: req.headers,
        body: fwdBody,
      });
      fwd.headers.set("x-repo", repo);
      fwd.headers.set("x-host", url.host);
      fwd.headers.set("x-proto", url.protocol.replace(":", ""));
      let res = await stub.fetch(fwd);
      // set before the cache put, so cached copies carry the header too
      if (options.cors && isApi) {
        res = new Response(res.body, res);
        res.headers.set("access-control-allow-origin", options.cors);
      }

      // bookkeeping after successful mutations. idle is the newest committer date
      // (x-commit-time), computed by the DO which alone can read the object graph
      if (res.ok && sub === "/git-receive-pack" && res.headers.get("x-changed") === "1") {
        const idle = parseInt(res.headers.get("x-commit-time") ?? "", 10) || Date.now();
        try {
          // a registry hiccup must not fail an already-applied push; next push heals
          await registry.upsert(repo, idle, res.headers.get("x-main-lang") ?? undefined);
        } catch {
          // registry deferred
        }
        if (options.onPush) {
          const event: PushEvent = { repo, updates: parseRefUpdates(res), commitTime: idle };
          ctx.waitUntil(
            Promise.resolve(options.onPush(event, env)).catch((err) => {
              console.log(`[onPush ${repo}] hook failed: ${err instanceof Error ? err.message : String(err)}`);
            })
          );
        }
      }
      if (res.ok && (sub === "/config" || sub === "/description") && req.method === "PUT") {
        try {
          const cfg = (await res.clone().json()) as {
            description: string;
            owner: string;
            section: string;
            private: boolean;
          };
          const idle = parseInt(res.headers.get("x-commit-time") ?? "", 10) || Date.now();
          if (!info) await registry.upsert(repo, idle);
          await registry.setConfig(
            repo,
            {
              desc: cfg.description,
              owner: cfg.owner,
              section: cfg.section,
              priv: cfg.private,
            },
            idle,
            res.headers.get("x-main-lang") ?? undefined
          );
        } catch {
          // non-JSON response; skip registry sync
        }
      }
      if (res.ok && (sub === "/" || sub === "") && req.method === "DELETE") {
        await registry.remove(repo);
      }
      if (isReceive || isAdmin) infoMemo.delete(repo); // this isolate sees its own mutations

      if (cacheable && cacheKey && res.ok && !res.headers.has("set-cookie")) {
        const toCache = new Response(res.clone().body, res);
        toCache.headers.set("cache-control", `public, max-age=${CACHE_TTL}`);
        ctx.waitUntil(cache!.put(cacheKey, toCache));
      }
      // x-ref-updates is a Worker<->cell event channel, not client data
      if (res.headers.has("x-ref-updates")) {
        const out = new Response(res.body, res);
        out.headers.delete("x-ref-updates");
        return out;
      }
      return res;
  };
  return {
    async fetch(req: Request, env: E, ctx: ExecutionContext): Promise<Response> {
      const u = new URL(req.url);
      if (env.CANONICAL_HOST && u.hostname !== env.CANONICAL_HOST && (req.method === "GET" || req.method === "HEAD") &&
          !/\/(info\/refs|git-upload-pack|git-receive-pack)$/.test(u.pathname) && !u.pathname.includes("/api/")) {
        u.hostname = env.CANONICAL_HOST;
        return new Response(null, { status: 301, headers: { location: u.toString() } });
      }
      const signedIn = ui ? await sessionValid(req, env) : false;
      const res = await inner(req, env, ctx, signedIn);
      return decorate(res, signedIn, new URL(req.url));
    },
  };
}
