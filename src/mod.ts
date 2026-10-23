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
import { envTokens, resolveToken, secretsEqual as secretsEqualImpl } from "./auth";
import { roleAllows, type Principal } from "./policy";
import { createConsole, CONSOLE } from "./admin";

export { RepoCell } from "./repo";
export { Registry } from "./registry";
export type { Env } from "./env";
export type { RepoInfo, RepoConfig } from "./registry";
export type { RefsResult, CommitJson, TreeResult, TreeEntryJson, BlobResult, LogResult, DiffResult, DiffFileJson } from "./repo";
export type { Person } from "./git/objects";
export type { Principal, Role } from "./policy";

/** an upload-pack negotiation body is wants/haves/caps only — a few hundred KB */
const MAX_UPLOAD_PACK_BYTES = 16 * 1024 * 1024;

const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** MioGit mark: a monoline M with a clay full stop; the M follows the colour scheme. */
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>path{stroke:#1f1e1d}@media (prefers-color-scheme:dark){path{stroke:#f5f4ee}}</style><path d="M8 50V15l18 19 18-19v35" fill="none" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="56.5" cy="50" r="5" fill="#d97757"/></svg>`;
const RESERVED = new Set(["api", "cgit.css", "app.js", "favicon.ico", "favicon.svg", "robots.txt", "info", "git-upload-pack", "git-receive-pack"]);
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
  /** the token those credentials resolved to (env admin token or a per-assistant token), if any */
  principal: Principal | null;
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

function unauthorized(): Response {
  return new Response("auth required\n", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="MioGit"' },
  });
}

function forbidden(msg: string): Response {
  return new Response(`${msg}\n`, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function tooManyRequests(retryAfterMs: number): Response {
  return new Response("too many failed attempts\n", {
    status: 429,
    headers: { "retry-after": String(Math.ceil(retryAfterMs / 1000)) },
  });
}

/**
 * Timing-safe string comparison for authorize hooks. `credentials.pass ===
 * secret` leaks the match length through timing; compare through this instead.
 */
export const secretsEqual = secretsEqualImpl;

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

/**
 * Resolve the request's HTTP Basic password to a token principal, with per-IP
 * failure rate limiting. Returns a Response for a rate-limited client.
 */
async function principalFor(req: Request, env: Env): Promise<Principal | null | Response> {
  if (!(req.headers.get("authorization") ?? "").startsWith("Basic ")) return null;
  const ip = clientIp(req);
  const retryMs = rateLimited(ip);
  if (retryMs !== null) return tooManyRequests(retryMs);
  const creds = parseBasic(req);
  const p = creds ? await resolveToken(env, creds.pass) : null;
  // a Basic header that failed to decode counts as a failed attempt too
  if (!p) recordAuthFailure(ip);
  return p;
}

/**
 * The default authorize: three-tier tokens. Reads of public repositories are
 * open; anything else needs a token whose role allows the op (reader: read,
 * writer: read + push, admin: everything). Per-ref push rules (main
 * protection, ownership, no force-push) are enforced inside the repository
 * cell, where the ref update commands are visible.
 */
async function tokenAuthorize(ctx: AuthContext): Promise<boolean | Response> {
  if (ctx.op === "read" && !ctx.private) return true;
  if (!ctx.principal) {
    if (!envTokens(ctx.env).length && !ctx.credentials) {
      return new Response("auth required (set the GIT_TOKEN secret)\n", { status: 401, headers: { "www-authenticate": 'Basic realm="MioGit"' } });
    }
    return unauthorized();
  }
  if (roleAllows(ctx.principal.role, ctx.op, ctx.private)) return true;
  return forbidden(ctx.op === "write" ? "read-only token: pushing is not allowed" : "this token cannot change configuration");
}

/** A smart-HTTP refusal git prints as "remote error: <msg>" instead of a bare HTTP status. */
function gitError(service: string, msg: string): Response {
  const line = (s: string) => {
    const b = new TextEncoder().encode(s);
    return (b.length + 4).toString(16).padStart(4, "0") + s;
  };
  return new Response(`${line(`# service=${service}\n`)}0000${line(`ERR ${msg}\n`)}0000`, {
    status: 200,
    headers: { "content-type": `application/x-${service}-advertisement`, "cache-control": "no-cache" },
  });
}

function redirect(to: string, cookie?: string): Response {
  const h = new Headers({ location: to, "cache-control": "no-store" });
  if (cookie) h.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers: h });
}

/**
 * Fill the top bar's account slot per request, so cached pages stay shared:
 * outside the console it is a link into /~mio/ (the console cookie is scoped
 * to /~mio/ and never reaches these pages). The blob page's edit slot links
 * to the console editor.
 */
function decorate(res: Response, url: URL): Response {
  if (!(res.headers.get("content-type") ?? "").startsWith("text/html")) return res;
  if (url.pathname === CONSOLE || url.pathname.startsWith(`${CONSOLE}/`)) {
    if (typeof HTMLRewriter === "undefined") return res;
    return new HTMLRewriter().on("#mh-auth", { element(e) { e.remove(); } }).transform(res);
  }
  const html = `<a class='mio-btn mio-btn-ghost mio-auth' href='${CONSOLE}/' rel='nofollow'>${t("Console", "管理")}</a>`;
  if (typeof HTMLRewriter === "undefined") return new Response(res.body, res);
  return new HTMLRewriter()
    .on("#mh-auth", { element(e) { e.replace(html, { html: true }); } })
    .on("#mh-edit", {
      element(e) {
        const href = e.getAttribute("data-href");
        // data-href is "/<repo>/edit/<path>?h=..": the editor lives in the console
        if (href && href.startsWith("/")) e.replace(`<a class='mio-btn mio-btn-secondary blob-edit' rel='nofollow' href='${CONSOLE}/edit${href.replace(/^\/([^/]+)\/edit/, "/$1").replace(/'/g, "%27")}'>${t("Edit", "编辑")}</a>`, { html: true });
        else e.remove();
      },
    })
    .transform(res);
}

function siteBase(env: Env) {
  return {
    site: env.SITE_NAME ?? "MioGit",
    siteDesc: env.SITE_DESC ?? "",
    title: env.SITE_NAME ?? "MioGit",
    sub: env.SITE_DESC ?? "",
    tab: "index",
  };
}

function parseStoreBytes(res: Response): { db: number; r2: number } | null {
  try {
    const v = JSON.parse(res.headers.get("x-store-bytes") ?? "");
    if (typeof v?.db === "number" && typeof v?.r2 === "number") return v;
  } catch {
    // header absent
  }
  return null;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// Cloudflare free-plan storage allowances the usage bars measure against
const FREE_DO_BYTES = 5 * 1024 ** 3;
const FREE_R2_BYTES = 10 * 1024 ** 3;

type DoUsage = { read: number; written: number; at: number };
let usageMemo: DoUsage | null = null;
const FREE_ROWS_READ = 5_000_000;
const FREE_ROWS_WRITTEN = 100_000;

/** Today's (UTC) Durable Object rows read/written from the GraphQL analytics API, memoized 5 min. */
async function doUsage(env: Env): Promise<DoUsage | null> {
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) return null;
  if (usageMemo && Date.now() - usageMemo.at < 300_000) return usageMemo;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        query: "query($a:String!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){durableObjectsPeriodicGroups(limit:10000,filter:{date:$d}){sum{rowsRead rowsWritten}}}}}",
        variables: { a: env.CF_ACCOUNT_ID, d: day },
      }),
    });
    const j = (await res.json()) as any;
    const groups: any[] = j?.data?.viewer?.accounts?.[0]?.durableObjectsPeriodicGroups;
    if (!Array.isArray(groups)) return usageMemo;
    let read = 0, written = 0;
    for (const g of groups) { read += g.sum?.rowsRead ?? 0; written += g.sum?.rowsWritten ?? 0; }
    usageMemo = { read, written, at: Date.now() };
    return usageMemo;
  } catch {
    return usageMemo;
  }
}

function fmtRows(n: number): string {
  return n >= 10_000 ? `${(n / 10_000).toFixed(n >= 1_000_000 ? 0 : 1)} 万` : String(n);
}

function statsPanel(repos: RepoInfo[], usage: DoUsage | null = null): string {
  const db = repos.reduce((a, r) => a + (r.db_bytes || 0), 0);
  const r2 = repos.reduce((a, r) => a + (r.r2_bytes || 0), 0);
  const priv = repos.filter((r) => r.priv).length;
  const bar = (used: number, cap: number) => {
    const pct = Math.min(100, (used / cap) * 100);
    return `<div class='st-bar' role='progressbar' aria-valuemin='0' aria-valuemax='100' aria-valuenow='${pct.toFixed(1)}'><i style='width:${Math.max(pct, used ? 0.6 : 0).toFixed(2)}%'></i></div>`;
  };
  const top = [...repos].sort((a, b) => (b.db_bytes + b.r2_bytes) - (a.db_bytes + a.r2_bytes)).slice(0, 5).filter((r) => r.db_bytes + r.r2_bytes > 0);
  const max = top[0] ? top[0].db_bytes + top[0].r2_bytes : 1;
  const topRows = top.map((r) => {
    const n = r.db_bytes + r.r2_bytes;
    return `<li><a href='/${repoUrl(r.name)}/'>${esc(r.name)}</a><span class='st-mini'><i style='width:${((n / max) * 100).toFixed(1)}%'></i></span><span class='st-num'>${fmtBytes(n)}</span></li>`;
  }).join("");
  return `<section class='mio-card st-panel' aria-label='storage'>` +
    `<div class='st-head'><h2>${t("Storage", "存储空间")}<details class='st-help'><summary aria-label='注意事项 / Notes' title='注意事项 / Notes'>?</summary><div class='st-pop' role='note'>` +
    `<b>${t("Free plan limits", "免费版额度")}</b><ul>` +
    `<li>${t("Durable Objects: 5M rows read and 100K rows written per day.", "Durable Objects 每天最多读 500 万行、写 10 万行。")}</li>` +
    `<li>${t("Resets daily at 00:00 UTC (08:00 Beijing).", "每天 UTC 0 点（北京时间 8 点）重置。")}</li>` +
    `<li>${t("Over the limit, pushes, pulls, clones and pages all fail until the reset. No data is lost.", "超额后推送、拉取、clone 和页面都会报错，直到重置，数据不会丢。")}</li>` +
    `<li>${t("Writes count per git object, so first imports of large histories may need several days.", "写入按 git 对象计，大仓库首次导入完整历史可能要分几天推。")}</li>` +
    `<li>${t("Each push is capped at 100 MB; push big repos branch by branch.", "单次推送上限 100 MB，大仓库按分支分批推。")}</li>` +
    `<li>${t("Storage: 5 GB in Durable Objects, 10 GB in R2.", "存储：Durable Objects 5 GB，R2 10 GB。")}</li>` +
    `</ul></div></details></h2><span class='st-total'>${fmtBytes(db + r2)}</span></div>` +
    `<div class='st-kpis'>` +
    `<div><span class='st-k'>${t("Repositories", "仓库")}</span><span class='st-v'>${repos.length}</span></div>` +
    `<div><span class='st-k'>${t("Private", "私有")}</span><span class='st-v'>${priv}</span></div>` +
    `<div><span class='st-k'>${t("Public", "公开")}</span><span class='st-v'>${repos.length - priv}</span></div></div>` +
    `<div class='st-quota'><div class='st-row'><span>Durable Objects</span><span class='st-num'>${fmtBytes(db)} / 5 GB</span></div>${bar(db, FREE_DO_BYTES)}</div>` +
    `<div class='st-quota'><div class='st-row'><span>R2</span><span class='st-num'>${fmtBytes(r2)} / 10 GB</span></div>${bar(r2, FREE_R2_BYTES)}</div>` +
    (usage
      ? `<h3>${t("Today's Durable Objects usage (UTC day)", "今日 Durable Objects 用量")}</h3>` +
        `<div class='st-quota${usage.read >= FREE_ROWS_READ ? " st-over" : ""}'><div class='st-row'><span>${t("Rows read", "读取行数")}</span><span class='st-num'>${fmtRows(usage.read)} / 500 万</span></div>${bar(usage.read, FREE_ROWS_READ)}</div>` +
        `<div class='st-quota${usage.written >= FREE_ROWS_WRITTEN ? " st-over" : ""}'><div class='st-row'><span>${t("Rows written", "写入行数")}</span><span class='st-num'>${fmtRows(usage.written)} / 10 万</span></div>${bar(usage.written, FREE_ROWS_WRITTEN)}</div>`
      : "") +
    (topRows ? `<h3>${t("Largest repositories", "占用最多")}</h3><ul class='st-top'>${topRows}</ul>` : "") +
    `</section>`;
}

async function indexPage(env: Env, signedIn = false): Promise<Response> {
  return htmlResponse(layout({ ...siteBase(env), body: await indexBody(env, signedIn) }));
}

async function indexBody(env: Env, signedIn = false, settings = false): Promise<string> {
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
      (signedIn && r.db_bytes + r.r2_bytes > 0 ? `<span class='rl-size' data-noi18n>${fmtBytes(r.db_bytes + r.r2_bytes)}</span>` : "") +
      `<time datetime='${iso}' title='${iso.slice(0, 16).replace("T", " ")} UTC'>${age(secs)}</time>` +
      (settings ? `<a class='rl-set' href='${CONSOLE}/repos/${repoUrl(r.name)}'>${t("Settings", "设置")}</a>` : "") +
      `</div></li>`;
  }
  const sortBar = repos.length > 1
    ? `<div class='mio-seg rl-sort' role='group' aria-label='sort'>` +
      `<button type='button' data-sort='time' aria-pressed='true'>${t("Recently updated", "最近更新")}</button>` +
      `<button type='button' data-sort='name' aria-pressed='false'>${t("Name", "名称")}</button></div>`
    : "";
  const body = repos.length
    ? (signedIn ? statsPanel(repos, await doUsage(env)) : "") + `<div class='rl-bar'><span class='rl-count'>${t(`${repos.length} repositories`, `${repos.length} 个仓库`)}</span>${sortBar}</div><ul class='repo-list' id='repo-list'>${rows}</ul>`
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
  const console_ = createConsole({ siteBase, indexBody, invalidate: (repo) => infoMemo.delete(repo) });
  const inner = async (req: Request, env: E, ctx: ExecutionContext): Promise<Response> => {
      const url = new URL(req.url);
      const path = url.pathname;

      // the console: everything management-related lives under /~mio/ (one
      // Cloudflare Access app, JWT re-verified inside). "~" never starts a
      // repository name, so this cannot shadow a repository.
      if (/^\/%7e/i.test(path)) {
        // one spelling only, so an Access path rule cannot be sidestepped
        const u = new URL(url.toString());
        u.pathname = "/~" + path.slice(4);
        return new Response(null, { status: 301, headers: { location: u.toString() } });
      }
      if (ui && (path === CONSOLE || path.startsWith(`${CONSOLE}/`))) return console_.handle(req, env);
      if (!ui && path.startsWith("/~")) return new Response("not found\n", { status: 404 });
      // legacy entry points: no unprotected sign-in outside /~mio/
      if (ui && (path === "/login" || path === "/logout")) {
        return new Response(null, { status: 302, headers: { location: `${CONSOLE}/login`, "cache-control": "no-store" } });
      }

      // the request's token, resolved at most once
      let principalMemo: Principal | null | Response | undefined;
      const principal = async () => (principalMemo === undefined ? (principalMemo = await principalFor(req, env)) : principalMemo);

      // site-level JSON ("api" is a reserved repository name)
      if (path.startsWith("/api/")) {
        if (options.cors && req.method === "OPTIONS") return corsPreflight(options.cors);
        const json = (data: unknown, status = 200) =>
          withCors(Response.json(data, { status, headers: { "x-content-type-options": "nosniff" } }), options.cors);
        if (path === "/api/repos" && req.method === "GET") {
          const ns = url.searchParams.get("owner") ?? undefined;
          // private repos are listed for any valid token (reader and up)
          let full = false;
          if (req.headers.has("authorization")) {
            const p = await principal();
            if (p instanceof Response) return withCors(p, options.cors);
            const d = await authorize({ repo: "", op: "read", private: true, credentials: parseBasic(req), principal: p, request: req, env });
            if (d instanceof Response) return withCors(d, options.cors);
            full = d === true;
          }
          const repos = await env.REGISTRY.getByName("registry").list(1000, ns, full);
          const res = json({
            repos: repos.map((r) => ({ name: r.name, description: r.desc, owner: r.owner, section: r.section, idle: r.idle, private: !!r.priv, ...(full ? { bytes: (r.db_bytes || 0) + (r.r2_bytes || 0) } : {}) })),
          });
          res.headers.set("cache-control", "private, no-store");
          return res;
        }
        return json({ error: "not found" }, 404);
      }

      if (!ui && (path === "/" || path === "" || path === "/cgit.css" || path === "/app.js" || path === "/robots.txt" || path === "/favicon.ico" || path === "/favicon.svg")) {
        return new Response("not found\n", { status: 404 });
      }

      if (path === "/" || path === "") {
        if (ui && req.headers.has("authorization")) {
          const p = await principal();
          if (p instanceof Response) return p;
          const d = await authorize({ repo: "", op: "read", private: true, credentials: parseBasic(req), principal: p, request: req, env });
          if (d instanceof Response) return d;
          if (d === true) {
            const res = await indexPage(env, true);
            res.headers.set("cache-control", "private, no-store");
            return res;
          }
        }
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
      if (path === "/favicon.ico" || path === "/favicon.svg") {
        return new Response(FAVICON_SVG, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
      }

      const parsed = repoPath(repoRoute, namespaced, path);
      if (!parsed) {
        return ui
          ? errorPage(siteBase(env), `no such repository: ${path}`, 404)
          : new Response("not found\n", { status: 404 });
      }
      const { repo, sub } = parsed;
      const { op, isReceive, isProtocol, isApi, isAdmin } = classify(sub, req.method, url);
      // the web editor moved into the console (/~mio/edit/<repo>/<path>)
      if (ui && (sub === "/edit" || sub.startsWith("/edit/"))) {
        if (req.method === "GET" && sub.startsWith("/edit/")) return redirect(`${CONSOLE}/edit/${repoUrl(repo)}${sub.slice(5)}${url.search}`);
        return new Response("the web editor lives under /~mio/edit/\n", { status: 404 });
      }
      // configuration / gc / delete are console-only now (/~mio/repos/<name>)
      if (isAdmin) {
        return new Response("repository management moved to the console: /~mio/repos/<name>\n", { status: 404 });
      }

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
      const who = await principal();
      if (who instanceof Response) return who;
      const decision = await authorize({
        repo,
        op,
        private: !!info?.priv,
        credentials: parseBasic(req),
        principal: who,
        request: req,
        env,
      });
      if (decision instanceof Response) {
        // a refused push gets a message git prints, not a bare status
        if (isReceive && sub === "/info/refs" && decision.status === 403) return gitError("git-receive-pack", "read-only token: pushing is not allowed");
        return decision;
      }
      if (!decision) return unauthorized();
      // what the cell enforces per ref: the token's role (a custom hook that
      // admitted the request without a token principal counts as admin)
      const role = who?.role ?? "admin";
      if (isReceive && !info && role !== "admin") {
        // pushing to a new name creates a repository: admin only
        if (sub === "/info/refs") return gitError("git-receive-pack", "writer token cannot create repositories");
        return forbidden("writer token cannot create repositories");
      }

      // only pushes may touch repos that don't exist yet
      if (!info && !isReceive) {
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
      // always overwritten: the cell trusts these for per-ref push policy
      fwd.headers.set("x-mio-role", role);
      fwd.headers.set("x-mio-token", who?.id ?? "hook");
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
          const sb = parseStoreBytes(res);
          if (sb) await registry.setBytes(repo, sb);
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
      if (isReceive) infoMemo.delete(repo); // this isolate sees its own mutations

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
      const res = await inner(req, env, ctx);
      return ui ? decorate(res, new URL(req.url)) : res;
    },
  };
}
