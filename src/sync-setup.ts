/**
 * GitHub-side setup and maintenance for the two-way sync, run by the Worker
 * with its SYNC_GITHUB_TOKEN secret, so the PAT only ever lives in two
 * secret stores (this Worker and the sync repository's Actions secrets) and
 * never has to be handled in plain text by a person or a script:
 *
 *   POST /~sync/api/github/setup   create mio-co/miogit-sync (private), write the
 *                                  workflow files given in the body, store the
 *                                  Actions secrets GH_SYNC_PAT + MIOGIT_SYNC_TOKEN
 *                                  (libsodium sealed box), create / update the
 *                                  organisation webhook -> /~sync/github
 *   POST /~sync/api/github/run     workflow_dispatch the sync workflow
 *   GET  /~sync/api/github/runs    recent runs (+ ?job=<id> for one job's log tail)
 *   POST /~sync/api/github/test-commit, DELETE /~sync/api/github/test-repo/<name>
 *                                  end-to-end test helpers, limited to
 *                                  repositories named miogit-synctest-*
 *
 * All behind the sync token (src/sync.ts api()); responses never echo a secret.
 */
import { sealedBox } from "./sealed-box";
import type { Env } from "./env";
import { syncRepoSlug } from "./sync";

export const TEST_REPO_PREFIX = "miogit-synctest-";
const WORKFLOW_FILE = "sync.yml";

function apiBase(env: Env): string {
  return ((env.SYNC_GITHUB_API ?? "").trim() || "https://api.github.com").replace(/\/+$/, "");
}

async function gh(env: Env, method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(apiBase(env) + path, {
    method,
    headers: {
      authorization: `Bearer ${env.SYNC_GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "miogit-sync",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "follow",
  });
  const text = await res.text();
  let data: any = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // plain text (logs)
  }
  return { status: res.status, data };
}

function msg(r: { status: number; data: any }): string {
  return `HTTP ${r.status}${r.data && typeof r.data === "object" && r.data.message ? `: ${r.data.message}` : ""}`;
}

function b64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const b = atob(s);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function putSecret(env: Env, repo: string, name: string, value: string): Promise<string> {
  const key = await gh(env, "GET", `/repos/${repo}/actions/secrets/public-key`);
  if (key.status !== 200) return `${name}: public key ${msg(key)}`;
  const sealed = sealedBox(new TextEncoder().encode(value), unb64(key.data.key));
  const put = await gh(env, "PUT", `/repos/${repo}/actions/secrets/${name}`, { encrypted_value: b64(sealed), key_id: key.data.key_id });
  return put.status === 201 || put.status === 204 ? `${name}: stored` : `${name}: ${msg(put)}`;
}

async function putFile(env: Env, repo: string, path: string, content: string, message: string): Promise<string> {
  const cur = await gh(env, "GET", `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`);
  const sha = cur.status === 200 && cur.data?.sha ? cur.data.sha : undefined;
  if (sha && cur.data?.content && cur.data.content.replace(/\n/g, "") === content) return `${path}: unchanged`;
  const put = await gh(env, "PUT", `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
    message,
    content,
    ...(sha ? { sha } : {}),
    committer: { name: "miogit-sync", email: "sync@miogit.300031.xyz" },
  });
  return put.status === 200 || put.status === 201 ? `${path}: ${sha ? "updated" : "created"}` : `${path}: ${msg(put)}`;
}

async function setup(env: Env, origin: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const repo = syncRepoSlug(env);
  const [org, name] = repo.split("/");
  const out: Record<string, unknown> = { repo };
  // 1. the sync repository
  let r = await gh(env, "GET", `/repos/${repo}`);
  if (r.status === 404) {
    const c = await gh(env, "POST", `/orgs/${org}/repos`, {
      name,
      private: true,
      description: "MioGit <-> GitHub two-way sync (source: miogit.300031.xyz/MioGit, sync/github/)",
      auto_init: false,
      has_issues: false,
      has_wiki: false,
      has_projects: false,
    });
    out.created = c.status === 201 ? true : msg(c);
    if (c.status !== 201) return out;
  } else if (r.status !== 200) {
    out.error = `sync repository: ${msg(r)}`;
    return out;
  } else {
    out.created = false;
  }
  // 2. files (path -> base64), workflow last so the first run sees the script
  const files = (body.files && typeof body.files === "object" ? body.files : {}) as Record<string, string>;
  const order = Object.keys(files).sort((a, b) => Number(a.startsWith(".github/")) - Number(b.startsWith(".github/")) || a.localeCompare(b));
  const fileResults: string[] = [];
  for (const p of order) {
    if (!/^[A-Za-z0-9._/-]+$/.test(p) || p.includes("..") || typeof files[p] !== "string") {
      fileResults.push(`${p}: bad path`);
      continue;
    }
    fileResults.push(await putFile(env, repo, p, files[p], typeof body.message === "string" ? body.message : `sync: update ${p}`));
  }
  out.files = fileResults;
  // 3. Actions secrets
  const secrets: string[] = [];
  if (env.SYNC_GITHUB_TOKEN) secrets.push(await putSecret(env, repo, "GH_SYNC_PAT", env.SYNC_GITHUB_TOKEN));
  if (env.SYNC_GIT_TOKEN) secrets.push(await putSecret(env, repo, "MIOGIT_SYNC_TOKEN", env.SYNC_GIT_TOKEN));
  out.secrets = secrets;
  // 4. organisation webhook
  if (env.SYNC_WEBHOOK_SECRET && body.webhook !== false) {
    const hookUrl = `${origin}/~sync/github`;
    const config = { url: hookUrl, content_type: "json", insecure_ssl: "0", secret: env.SYNC_WEBHOOK_SECRET };
    const list = await gh(env, "GET", `/orgs/${org}/hooks?per_page=100`);
    if (list.status !== 200) {
      out.webhook = `list hooks: ${msg(list)}`;
    } else {
      const found = (list.data as any[]).find((h) => h?.config?.url === hookUrl);
      const res = found
        ? await gh(env, "PATCH", `/orgs/${org}/hooks/${found.id}`, { active: true, events: ["push", "repository"], config })
        : await gh(env, "POST", `/orgs/${org}/hooks`, { name: "web", active: true, events: ["push", "repository"], config });
      out.webhook = res.status === 200 || res.status === 201 ? { id: res.data.id, url: hookUrl, events: res.data.events, updated: !!found } : msg(res);
    }
  }
  return out;
}

export async function githubOps(req: Request, env: Env, sub: string): Promise<Response | null> {
  if (!sub.startsWith("/github/")) return null;
  const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  if (!env.SYNC_GITHUB_TOKEN) return json({ error: "SYNC_GITHUB_TOKEN is not set" }, 503);
  const repo = syncRepoSlug(env);
  const url = new URL(req.url);
  const body = async (): Promise<Record<string, unknown>> => {
    try {
      const v = JSON.parse((await req.text()) || "{}");
      return v && typeof v === "object" ? v : {};
    } catch {
      return {};
    }
  };

  if (sub === "/github/setup" && req.method === "POST") return json(await setup(env, url.origin, await body()));

  if (sub === "/github/run" && req.method === "POST") {
    const b = await body();
    const inputs: Record<string, string | boolean> = {};
    if (typeof b.repo === "string") inputs.repo = b.repo;
    if (b.dry_run === true) inputs.dry_run = true;
    const r = await gh(env, "POST", `/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, { ref: typeof b.ref === "string" ? b.ref : "main", inputs });
    return json({ ok: r.status === 204, status: r.status, error: r.status === 204 ? undefined : msg(r) }, r.status === 204 ? 200 : 502);
  }

  if (sub === "/github/runs" && req.method === "GET") {
    const job = url.searchParams.get("job");
    if (job && /^\d+$/.test(job)) {
      const r = await gh(env, "GET", `/repos/${repo}/actions/jobs/${job}/logs`);
      const text = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
      return json({ status: r.status, log: text.slice(-30000) });
    }
    const run = url.searchParams.get("run");
    if (run && /^\d+$/.test(run)) {
      const r = await gh(env, "GET", `/repos/${repo}/actions/runs/${run}/jobs`);
      return json({ status: r.status, jobs: (r.data?.jobs ?? []).map((j: any) => ({ id: j.id, status: j.status, conclusion: j.conclusion, steps: (j.steps ?? []).map((s: any) => ({ name: s.name, conclusion: s.conclusion })) })) });
    }
    const r = await gh(env, "GET", `/repos/${repo}/actions/runs?per_page=${Math.min(50, parseInt(url.searchParams.get("n") ?? "15", 10) || 15)}`);
    return json({
      status: r.status,
      runs: (r.data?.workflow_runs ?? []).map((x: any) => ({ id: x.id, event: x.event, status: x.status, conclusion: x.conclusion, created_at: x.created_at, title: x.display_title, url: x.html_url })),
    });
  }

  if (sub === "/github/test-commit" && req.method === "POST") {
    const b = await body();
    const name = String(b.repo ?? "");
    if (!name.startsWith(TEST_REPO_PREFIX) || !/^[A-Za-z0-9._-]+$/.test(name)) return json({ error: `only ${TEST_REPO_PREFIX}* repositories` }, 403);
    const org = repo.split("/")[0];
    const path = String(b.path ?? "github.txt");
    const cur = await gh(env, "GET", `/repos/${org}/${name}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(String(b.branch ?? "main"))}`);
    const r = await gh(env, "PUT", `/repos/${org}/${name}/contents/${encodeURIComponent(path)}`, {
      message: String(b.message ?? "test commit on GitHub"),
      content: btoa(String(b.content ?? `from GitHub ${new Date().toISOString()}\n`)),
      branch: String(b.branch ?? "main"),
      ...(cur.status === 200 && cur.data?.sha ? { sha: cur.data.sha } : {}),
    });
    return json({ status: r.status, commit: r.data?.commit?.sha ?? null, error: r.status < 300 ? undefined : msg(r) }, r.status < 300 ? 200 : 502);
  }

  const tr = /^\/github\/test-repo\/([A-Za-z0-9._-]+)$/.exec(sub);
  if (tr && req.method === "DELETE") {
    if (!tr[1].startsWith(TEST_REPO_PREFIX)) return json({ error: `only ${TEST_REPO_PREFIX}* repositories` }, 403);
    const r = await gh(env, "DELETE", `/repos/${repo.split("/")[0]}/${tr[1]}`);
    return json({ status: r.status, deleted: r.status === 204, error: r.status === 204 ? undefined : msg(r) }, r.status === 204 || r.status === 404 ? 200 : 502);
  }

  return json({ error: "not found" }, 404);
}
