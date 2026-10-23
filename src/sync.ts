/**
 * Two-way sync between MioGit and a GitHub organisation (mio-co).
 *
 * The Worker only *notices* changes and hands them to one GitHub Actions
 * workflow (in SYNC_GITHUB_REPO, default mio-co/miogit-sync), which does the
 * git work for every repository (sync/github/ in this repository):
 *
 *   MioGit push      -> onPushSync()        -> repository_dispatch "miogit-push"
 *   GitHub push /    -> POST /~sync/github  -> repository_dispatch "github-push"
 *   repo created        (org webhook, HMAC X-Hub-Signature-256)
 *
 * The workflow reads and writes MioGit through /~sync/api/* (Basic auth with
 * the SYNC_GIT_TOKEN secret only) and pushes with that same token, whose pushes
 * onPushSync skips — so a synced commit is never echoed back. The webhook skips
 * a GitHub push whose new value MioGit already has (the echo of the workflow's
 * own push to GitHub).
 *
 * Every secret is optional: without SYNC_GITHUB_TOKEN nothing is dispatched,
 * without SYNC_WEBHOOK_SECRET the webhook answers 503, without SYNC_GIT_TOKEN
 * the API answers 401. A push never waits for, or fails because of, sync.
 *
 * /~sync/ is outside the Cloudflare Access application (which covers /~mio/
 * only); each endpoint authenticates itself.
 */
import type { Env } from "./env";
import { bytesEqual, resolveToken, SYNC_PRINCIPAL_ID } from "./auth";
import type { Principal } from "./policy";
import { githubOps, TEST_REPO_PREFIX } from "./sync-setup";

export const SYNC_PREFIX = "/~sync";
const ZERO = "0000000000000000000000000000000000000000";
const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SYNCED_REF = /^refs\/(heads|tags)\//;
/** GitHub caps webhook payloads at 25 MB */
const MAX_WEBHOOK_BYTES = 26 * 1024 * 1024;
const MAX_STATE_BYTES = 256 * 1024;
const te = new TextEncoder();

export interface SyncPushEvent {
  repo: string;
  updates: { ref: string; old: string; new: string }[];
  principal?: Principal | null;
}

export interface SyncDeps {
  /** drop cached registry rows / list pages after a visibility change */
  invalidate: (repo: string, origin?: string) => unknown;
}

export function syncRepoSlug(env: Env): string {
  return (env.SYNC_GITHUB_REPO ?? "").trim() || "mio-co/miogit-sync";
}

function githubApi(env: Env): string {
  return ((env.SYNC_GITHUB_API ?? "").trim() || "https://api.github.com").replace(/\/+$/, "");
}

/**
 * The workflow's concurrency / cache key for a repository: not the name (the sync
 * repository is public, so its UI must not show private repository names) but a
 * keyed hash of the lower-cased name, the same from both directions.
 */
export async function syncGroup(env: Env, name: string): Promise<string> {
  const key = env.SYNC_WEBHOOK_SECRET || env.SYNC_GIT_TOKEN || "";
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(`miogit-sync-group\0${key}\0${name.toLowerCase()}`)));
  return [...d.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** POST /repos/<sync repo>/dispatches. false (logged, never thrown) when not configured or refused. */
export async function dispatchSync(env: Env, eventType: "miogit-push" | "github-push", payload: Record<string, unknown>): Promise<boolean> {
  const token = env.SYNC_GITHUB_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`${githubApi(env)}/repos/${syncRepoSlug(env)}/dispatches`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
        "user-agent": "miogit-sync",
      },
      body: JSON.stringify({ event_type: eventType, client_payload: { ...payload, group: await syncGroup(env, String(payload.repo ?? "")) } }),
    });
    if (!res.ok) console.log(`[sync] dispatch ${eventType} ${String(payload.repo)}: HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.log(`[sync] dispatch ${eventType} failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * The onPush hook (src/index.ts). Skips pushes made by the sync workflow
 * itself, repositories with sync switched off, and pushes that touched no
 * branch or tag.
 */
export async function onPushSync(event: SyncPushEvent, env: Env): Promise<void> {
  if (!env.SYNC_GITHUB_TOKEN) return;
  if (event.principal?.id === SYNC_PRINCIPAL_ID) return;
  const refs = event.updates.filter((u) => SYNCED_REF.test(u.ref));
  if (!refs.length) return;
  const reg = env.REGISTRY.getByName("registry");
  if (!(await reg.syncEnabled(event.repo))) return;
  const info = await reg.get(event.repo);
  // the workflow syncs every ref of the repository; the list is only a hint
  await dispatchSync(env, "miogit-push", {
    repo: event.repo,
    origin: "miogit",
    private: !!info?.priv,
    refs: refs.slice(0, 30).map((u) => ({ ref: u.ref, old: u.old, new: u.new })),
  });
}

// ---- webhook -------------------------------------------------------------------

function hexToBytes(h: string): Uint8Array | null {
  if (!/^[0-9a-f]*$/i.test(h) || h.length % 2) return null;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** X-Hub-Signature-256: "sha256=" + hex HMAC-SHA256(secret, raw body); constant-time compare. */
export async function verifyGithubSignature(secret: string, body: Uint8Array, header: string | null): Promise<boolean> {
  if (!secret || !header || !header.startsWith("sha256=")) return false;
  const given = hexToBytes(header.slice(7));
  if (!given || given.length !== 32) return false;
  const key = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  return bytesEqual(want, given);
}

/** The MioGit repository a GitHub name maps to: exact name first, then case-insensitive (GitHub names are). */
async function miogitNameFor(env: Env, ghName: string): Promise<string | null> {
  const reg = env.REGISTRY.getByName("registry");
  if (await reg.get(ghName)) return ghName;
  const lower = ghName.toLowerCase();
  const all = await reg.list(5000, undefined, true);
  return all.find((r) => r.name.toLowerCase() === lower)?.name ?? null;
}

function text(msg: string, status: number): Response {
  return new Response(`${msg}\n`, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

async function webhook(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (req.method !== "POST") return text("method not allowed", 405);
  if (!env.SYNC_WEBHOOK_SECRET) return text("sync is not configured", 503);
  const declared = parseInt(req.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) return text("payload too large", 413);
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length > MAX_WEBHOOK_BYTES) return text("payload too large", 413);
  if (!(await verifyGithubSignature(env.SYNC_WEBHOOK_SECRET, body, req.headers.get("x-hub-signature-256")))) return text("bad signature", 401);

  const event = req.headers.get("x-github-event") ?? "";
  if (event === "ping") return text("pong", 200);
  let p: any;
  try {
    p = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return text("bad JSON", 400);
  }
  const ghName: string = p?.repository?.name ?? "";
  const ghFull: string = p?.repository?.full_name ?? "";
  // never sync the sync repository itself, nor names MioGit cannot hold
  if (!ghName || ghFull.toLowerCase() === syncRepoSlug(env).toLowerCase() || !REPO_NAME.test(ghName)) return text("ignored", 202);

  if (event === "push") {
    const ref: string = p.ref ?? "";
    const after: string = p.after ?? "";
    if (!SYNCED_REF.test(ref) || !/^[0-9a-f]{40}$/.test(after)) return text("ignored", 202);
    const mname = await miogitNameFor(env, ghName);
    if (mname) {
      const reg = env.REGISTRY.getByName("registry");
      if (!(await reg.syncEnabled(mname))) return text("sync is off for this repository", 202);
      // the echo of a push the workflow just made (or a ref already equal): nothing to do
      try {
        const refs = await env.REPO.getByName(mname).listRefs();
        const cur = refs.refs.find((r) => r.name === ref)?.target ?? ZERO;
        if (cur === after) return text("already in sync", 202);
      } catch {
        // cannot read the repository: let the workflow decide
      }
    }
    ctx.waitUntil(
      dispatchSync(env, "github-push", {
        repo: ghName,
        miogit: mname,
        origin: "github",
        private: !!p.repository?.private,
        refs: [{ ref, old: p.before ?? ZERO, new: after }],
      })
    );
    return text("queued", 202);
  }
  if (event === "repository" && ["created", "publicized", "privatized"].includes(p.action)) {
    const mname = await miogitNameFor(env, ghName);
    if (mname && !(await env.REGISTRY.getByName("registry").syncEnabled(mname))) return text("sync is off for this repository", 202);
    ctx.waitUntil(dispatchSync(env, "github-push", { repo: ghName, miogit: mname, origin: "github", private: !!p.repository?.private, action: p.action, refs: [] }));
    return text("queued", 202);
  }
  return text("ignored", 202);
}

// ---- API for the sync workflow -----------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

async function syncPrincipal(req: Request, env: Env): Promise<boolean> {
  if (!env.SYNC_GIT_TOKEN) return false;
  const h = req.headers.get("authorization") ?? "";
  if (!h.startsWith("Basic ")) return false;
  let pass = "";
  try {
    const d = atob(h.slice(6));
    pass = d.slice(d.indexOf(":") + 1);
  } catch {
    return false;
  }
  const p = await resolveToken(env, pass);
  return !!p && p !== "expired" && p.id === SYNC_PRINCIPAL_ID;
}

function decodeName(raw: string): string | null {
  try {
    const n = decodeURIComponent(raw);
    return REPO_NAME.test(n) && n.length <= 100 ? n : null;
  } catch {
    return null;
  }
}

async function readJson(req: Request, max = 64 * 1024): Promise<Record<string, unknown> | null> {
  const raw = await req.text();
  if (raw.length > max) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

async function api(req: Request, env: Env, sub: string, deps: SyncDeps): Promise<Response> {
  if (!(await syncPrincipal(req, env))) {
    return new Response("auth required\n", { status: 401, headers: { "www-authenticate": 'Basic realm="MioGit sync"', "cache-control": "no-store" } });
  }
  const reg = env.REGISTRY.getByName("registry");
  const url = new URL(req.url);

  // GitHub-side setup / run control / e2e helpers, done with the Worker's PAT (src/sync-setup.ts)
  const gres = await githubOps(req, env, sub);
  if (gres) return gres;

  // e2e helper: delete a MioGit test repository (miogit-synctest-* only)
  const td = /^\/test-repo\/([^/]+)$/.exec(sub);
  if (td && req.method === "DELETE") {
    const name = decodeName(td[1]);
    if (!name || !name.startsWith(TEST_REPO_PREFIX)) return json({ error: `only ${TEST_REPO_PREFIX}* repositories` }, 403);
    if (await reg.get(name)) {
      const res = await env.REPO.getByName(name).fetch(
        new Request(`${url.origin}/`, { method: "DELETE", headers: { "x-repo": name, "x-host": url.host, "x-mio-role": "admin", "x-mio-token": SYNC_PRINCIPAL_ID } })
      );
      if (!res.ok) return json({ error: (await res.text()).slice(0, 200) }, 500);
      await reg.remove(name);
    }
    await reg.setSyncEnabled(name, true);
    await reg.deleteSetting(`sync_state:${name}`);
    deps.invalidate(name, url.origin);
    return json({ deleted: name });
  }

  if (sub === "/repos" && req.method === "GET") {
    const rows = await reg.syncOverview();
    return json({
      repos: rows.map((r) => {
        let state: unknown = null;
        try {
          state = r.state ? JSON.parse(r.state) : null;
        } catch {
          state = null;
        }
        return r.priv === -1
          ? { name: r.name, deleted: true, sync: r.sync, state }
          : { name: r.name, private: r.priv === 1, description: r.desc, sync: r.sync, state };
      }),
    });
  }

  const m = /^\/repos\/([^/]+)$/.exec(sub);
  if (m && req.method === "POST") {
    const name = decodeName(m[1]);
    if (!name) return json({ error: "bad repository name" }, 400);
    const b = await readJson(req);
    if (!b) return json({ error: "bad JSON" }, 400);
    let info = await reg.get(name);
    if (!info) {
      if (b.create !== true) return json({ error: "no such repository" }, 404);
      if (typeof b.private !== "boolean") return json({ error: "creating needs private: true|false" }, 400);
      info = await reg.ensure(name, b.private, typeof b.description === "string" ? b.description : "");
      deps.invalidate(name, url.origin);
      return json({ name: info.name, private: !!info.priv, created: true });
    }
    if (!(await reg.syncEnabled(name))) return json({ error: "sync is off for this repository" }, 409);
    if (typeof b.private === "boolean" && b.private !== !!info.priv) {
      const cfg = { description: info.desc, owner: info.owner, section: info.section, private: b.private };
      const res = await env.REPO.getByName(name).fetch(
        new Request(`${url.origin}/config`, {
          method: "PUT",
          headers: { "content-type": "application/json", "x-repo": name, "x-host": url.host, "x-mio-role": "admin", "x-mio-token": SYNC_PRINCIPAL_ID },
          body: JSON.stringify(cfg),
        })
      );
      if (!res.ok) return json({ error: (await res.text()).slice(0, 200) }, 500);
      const idle = parseInt(res.headers.get("x-commit-time") ?? "", 10) || info.idle;
      await reg.setConfig(name, { priv: b.private }, idle, res.headers.get("x-main-lang") ?? undefined);
      deps.invalidate(name, url.origin);
      info = (await reg.get(name)) ?? info;
    }
    return json({ name: info.name, private: !!info.priv, created: false });
  }

  // the last run's full (unmasked) report; the public workflow log masks private names
  if (sub === "/report" && req.method === "PUT") {
    const b = await readJson(req, MAX_STATE_BYTES);
    if (!b) return json({ error: "bad JSON" }, 400);
    await reg.setSetting(`sync_report:${b.mode === "reconcile" ? "reconcile" : "event"}`, JSON.stringify(b));
    return json({ ok: true });
  }

  const st = /^\/state\/([^/]+)$/.exec(sub);
  if (st && req.method === "PUT") {
    const name = decodeName(st[1]);
    if (!name) return json({ error: "bad repository name" }, 400);
    const b = await readJson(req, MAX_STATE_BYTES);
    if (!b) return json({ error: "bad JSON" }, 400);
    await reg.setSetting(`sync_state:${name}`, JSON.stringify(b));
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
}

/** Everything under /~sync/ (routed from createDurableGit before the console and repositories). */
export async function handleSync(req: Request, env: Env, ctx: ExecutionContext, deps: SyncDeps): Promise<Response> {
  const path = new URL(req.url).pathname;
  if (path === `${SYNC_PREFIX}/github`) return webhook(req, env, ctx);
  if (path.startsWith(`${SYNC_PREFIX}/api/`)) return api(req, env, path.slice(`${SYNC_PREFIX}/api`.length), deps);
  return text("not found", 404);
}
