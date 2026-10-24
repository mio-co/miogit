/**
 * The React frontend (web/, built to web/dist and served by Workers Static
 * Assets). The Worker keeps every route decision — git smart HTTP, the API,
 * redirects, the Access + session gates — and only at the very end, for a page
 * the frontend owns, answers with index.html plus the page's first data
 * inlined as a JSON block (no extra round trip on first paint; the CSP stays
 * script-src 'self' because a type="application/json" block never executes).
 */
import type { Env } from "./env";
import type { RepoInfo } from "./registry";
import { CSP } from "./ui/html";
import { langColor } from "./ui/langs";

/** Is the React frontend on? (an ASSETS binding and SPA != "0") */
export function spaOn(env: Env): boolean {
  return !!env.ASSETS && env.SPA !== "0";
}

/** Repository sub-paths rendered by the frontend; everything else stays server-rendered. */
export function isSpaSub(sub: string): boolean {
  if (sub === "/" || sub === "") return true;
  if (sub === "/tree" || sub.startsWith("/tree/")) return true;
  if (sub === "/compare" || sub.startsWith("/compare/")) return true;
  return ["/log", "/branches", "/tags", "/commit", "/tag"].some((p) => sub === p || sub === `${p}/`);
}

/** Console-only frontend pages on top of isSpaSub: the new-file and upload forms (/~mio/r/<repo>/new|upload/<dir>). */
export function isConsoleSpaSub(sub: string): boolean {
  return isSpaSub(sub) || /^\/(new|upload)(\/|$)/.test(sub);
}

export interface Boot {
  site: string;
  owner: string;
  /** the secret-free signed-in hint (public pages) or a real session (console) */
  signed: boolean;
  console: boolean;
  /** console only: the signed-in user and the CSRF token for JSON POSTs */
  session?: { user: string; csrf: string } | null;
  /** first data, keyed by the API URL the frontend would request */
  data: Record<string, { status: number; body: unknown }>;
}

export function bootBase(env: Env): Pick<Boot, "site" | "owner"> {
  return { site: env.SITE_NAME ?? "MioGit", owner: env.SITE_OWNER ?? "" };
}

function inlineJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** index.html with the boot block, or null when the frontend is off / missing (caller falls back to server pages). */
export async function spaShell(req: Request, env: Env, boot: Boot, status = 200): Promise<Response | null> {
  if (!spaOn(env)) return null;
  let html: string;
  try {
    const r = await env.ASSETS!.fetch(new Request(new URL("/index.html", req.url).toString(), { method: "GET" }));
    if (!r.ok) return null;
    html = await r.text();
  } catch {
    return null;
  }
  if (!html.includes("<!--mio-boot-->")) return null;
  html = html.replace("<!--mio-boot-->", `<script type="application/json" id="mio-boot">${inlineJson(boot)}</script>`);
  return new Response(req.method === "HEAD" ? null : html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    },
  });
}

/** /api/repos item shape (public fields; `bytes` only for a caller allowed to see private repositories) */
export function repoJson(r: RepoInfo, full: boolean) {
  return {
    name: r.name,
    description: r.desc,
    owner: r.owner,
    section: r.section,
    idle: r.idle,
    private: !!r.priv,
    lang: r.lang || "",
    langColor: r.lang ? langColor(r.lang) : "",
    ...(full ? { bytes: (r.db_bytes || 0) + (r.r2_bytes || 0) } : {}),
  };
}

// Cloudflare free-plan allowances the storage card measures against
export const FREE = { doBytes: 5 * 1024 ** 3, r2Bytes: 10 * 1024 ** 3, rowsRead: 5_000_000, rowsWritten: 100_000 };

export function storageJson(repos: RepoInfo[], usage: { read: number; written: number } | null) {
  const db = repos.reduce((a, r) => a + (r.db_bytes || 0), 0);
  const r2 = repos.reduce((a, r) => a + (r.r2_bytes || 0), 0);
  const top = [...repos]
    .sort((a, b) => b.db_bytes + b.r2_bytes - (a.db_bytes + a.r2_bytes))
    .slice(0, 5)
    .filter((r) => r.db_bytes + r.r2_bytes > 0)
    .map((r) => ({ name: r.name, bytes: r.db_bytes + r.r2_bytes }));
  return {
    db,
    r2,
    total: db + r2,
    repos: repos.length,
    private: repos.filter((r) => r.priv).length,
    usage: usage ? { read: usage.read, written: usage.written } : null,
    limits: FREE,
    top,
  };
}
