# durable-git API

The library (`createDurableGit`), the JSON API every repository serves,
and the RPC surface on the repository cell. In MioGit the operational
endpoints (config, gc, delete) are no longer served on repository paths:
repository settings live in the `/~mio/` console (see the README). The
default `authorize` is the three-tier token policy (`src/policy.ts`);
per-ref push rules are enforced inside the repository cell from the
`x-mio-role` / `x-mio-token` headers the Worker always overwrites.

```sh
npm install durable-git
```

The package ships TypeScript source; wrangler bundles it directly. Bind
the Durable Object classes as dgit's own
[wrangler.jsonc](../wrangler.jsonc) does — `REPO` → `RepoCell`,
`REGISTRY` → `Registry`, both in `new_sqlite_classes` — and re-export
them from your entry module.

## createDurableGit(options?)

```ts
import { createDurableGit } from "durable-git";
export { RepoCell, Registry } from "durable-git";

export default createDurableGit(options);
```

Returns `{ fetch }` — a valid Worker default export that a wrapping
router can also delegate to. `createDurableGit<Env>` types the hooks'
`env` with your own bindings.

### authorize

```ts
authorize?: (ctx: AuthContext) => boolean | Response | Promise<boolean | Response>;
```

Runs for every repository-scoped request before any repository data is
touched, ahead of the page cache and the R2 clone path. The index page
is not repository-scoped; it lists public repositories regardless.

| `ctx` field | |
|---|---|
| `repo` | repository name, already validated against `[A-Za-z0-9][A-Za-z0-9._-]*` |
| `op` | `"read"` pages, clones, the JSON API · `"write"` push · `"admin"` config, gc, delete |
| `private` | the registry's private flag; `false` for a repository that does not exist yet |
| `credentials` | `{ user, pass }` from HTTP Basic, or `null` |
| `principal` | the token those credentials resolved to — `{ role: "admin" \| "writer" \| "reader", id, name }` — or `null` |
| `request` | headers and URL only — the body is consumed downstream; a hook that reads it breaks every push |
| `env` | your bindings |

Return `true` to allow, `false` for the 401 Basic challenge (git
clients then prompt), or a `Response` to send verbatim. The hook
replaces the default policy entirely: `private` protects nothing unless
the hook consults it, and the mistake is silent because private
repositories are hidden from the index either way. The safe skeleton:

```ts
async authorize({ op, private: priv, credentials, env }) {
  if (op === "read" && !priv) return true;
  return checkCredentials(env, credentials);
}
```

The default hook: public reads open; everything else requires a
`GIT_TOKEN`/`GIT_TOKENS` match, compared timing-safely, with per-IP
failure rate limiting.

### onPush

```ts
onPush?: (event: PushEvent, env: Env) => void | Promise<void>;

interface PushEvent {
  repo: string;
  updates: { ref: string; old: string; new: string }[];
  commitTime: number; // unix millis of the newest committer date
}
```

Fires after a push applies at least one ref update, via `waitUntil`: a
slow or throwing hook never fails the push. `old`/`new` are all-zeros
for a created/deleted ref; rejected commands never appear. Delivery is
at-most-once, and a push updating very many refs at once arrives
truncated (8 KB budget) — a consumer that must not miss updates
reconciles against `/api/refs`.

### ui, cors, namespaces

```ts
ui?: boolean;         // false = headless: protocol, admin, and API only; every page 404s
cors?: string;        // access-control-allow-origin for the API; preflights answered
namespaces?: boolean; // true = every repository is <owner>/<name>
```

Headless runs dgit as a pure git server behind your own frontend — git
needs only `/info/refs`, `/git-upload-pack`, and `/git-receive-pack`,
and the JSON API stays for your UI's data. With `namespaces` the
two-segment name is the repository name everywhere: hooks, the
registry, the API, RPC (`env.REPO.getByName("owner/name")`).

### secretsEqual(a, b)

Timing-safe string comparison for hooks. `credentials.pass === secret`
leaks the match through timing.

### Env

| | |
|---|---|
| `REPO`, `REGISTRY` | the Durable Object namespaces |
| `PACK_CACHE?` | R2 pack offload + full-clone cache; absent falls back to SQLite-only |
| `GIT_TOKEN?`, `GIT_TOKENS?` | passwords for the default authorize |
| `MAX_PUSH_MB?` | single-push cap, default 512 |
| `SHA1DC?` | `"1"` screens pushed objects for SHA-1 collisions |
| `SITE_NAME?`, `SITE_DESC?`, `SITE_OWNER?` | page chrome |

## JSON API

`/<repo>/api/*`, GET only, gated like the repository's pages
(`op: "read"`). Errors are `{ "error": "..." }` with a 404. `h` and
`id` take a branch, tag, full ref, or full 40-char oid — an oid is
served only when reachable from a current ref. Omitted means HEAD; tags
peel to commits.

### GET /api/repos?owner=\<ns\>

Site-level (not repository-scoped): public repositories, newest
activity first, capped at 1000. `owner` filters one namespace.

```json
{ "repos": [ { "name": "alice/blog", "description": "", "owner": "", "section": "", "idle": 1787198887000 } ] }
```

### GET /\<repo\>/api/refs

```json
{
  "head": "refs/heads/main",
  "refs": [
    { "name": "refs/heads/main", "target": "9e3c2c…" },
    { "name": "refs/tags/v1", "target": "77afdb…", "peeled": "9e3c2c…" }
  ]
}
```

`head` is null when unborn; `peeled` appears on annotated tags.

### GET /\<repo\>/api/log?h=\<ref\>&path=\<path\>&ofs=\<n\>&n=\<limit\>

`{ "commits": [<commit>, …], "more": true }`, newest first. `path`
filters to commits that changed it; `n` is 1–100, default 50. The walk
is bounded: 5000 commits, 2000 when path-filtered.

### GET /\<repo\>/api/commit?id=\<ref-or-oid\>

```json
{
  "oid": "9e3c2c…",
  "tree": "b1de8b…",
  "parents": ["d29562…"],
  "author":    { "name": "T", "email": "t@t.co", "time": 1787162584, "tz": "+0530" },
  "committer": { "name": "T", "email": "t@t.co", "time": 1787162584, "tz": "+0530" },
  "subject": "second",
  "message": "second\n"
}
```

`time` is unix seconds, git's own unit (`PushEvent.commitTime` is
millis).

### GET /\<repo\>/api/tree?h=\<ref\>&path=\<dir\>

```json
{
  "oid": "ead936…",
  "entries": [
    { "name": "a.ts", "mode": "100644", "type": "blob", "oid": "ad1d38…", "size": 20 },
    { "name": "vendor", "mode": "160000", "type": "commit", "oid": "abc123…" }
  ]
}
```

`type` is blob, tree, or commit (a gitlink); `size` on blobs only. 404
when `path` names a blob or nothing.

### GET /\<repo\>/api/files?h=\<ref\>

Every file path at a ref (the frontend's "t" file finder), sorted, capped
at 20 000 (`truncated: true` beyond that); submodules are skipped.

```json
{ "commit": "9e3c2c…", "paths": ["README.md", "src/a.ts"], "truncated": false }
```

### GET /\<repo\>/api/blob?h=\<ref\>&path=\<file\>

The raw bytes, not JSON. Content type from the extension with nosniff;
the blob's oid in the `x-oid` header.

### GET /\<repo\>/api/diff?id=\<ref-or-oid\>&id2=\<ref-or-oid\>

Changes id2..id; `id2` defaults to the first parent of `id`, `old` is
null for a root commit. `binary` and `toolarge` files carry no hunks.

```json
{
  "old": "0b520f…", "new": "c3f12e…", "truncated": false,
  "files": [{
    "path": "a.ts",
    "old": null, "new": { "oid": "ad1d38…", "mode": "100644" },
    "kind": "text", "add": 1, "del": 0,
    "hunks": [{ "aStart": 0, "aLen": 0, "bStart": 1, "bLen": 1,
                "ops": [{ "tag": "add", "line": "const x = 1;" }] }]
  }]
}
```

### GET /\<repo\>/api/view/compare/\<base\>...\<head\>

GitHub's three-dot compare (the frontend's `/<repo>/compare/…` page):
`ahead` / `behind` commit counts, the commits on head that base lacks
(newest first, 250 at most) and the diff from the merge base to head in
the commit view's shape. `related: false` when the two share no history
inside the walk bound (5 000 commits; `capped: true` then means the counts
are lower bounds) — the diff is base..head then. A missing side is a 404
with `missing: "base" | "head"`.

## Web writes (console only)

Not served on repository paths: every `/<repo>/~…` sub-path is a 404 on the
public routes, whatever the credentials. The console proxies them under
`/~mio/api/r/<repo>/…` behind Cloudflare Access, the console session, the
`x-csrf-token` header, a JSON body and a same-origin check; tokens cannot
use them. A successful write is booked exactly like a push: registry
upsert (list order, page-cache version) and `onPush` with the ref update
(GitHub sync).

### POST /~mio/api/r/\<repo\>/commit

One commit from a list of changes onto a branch tip:

```json
{ "branch": "main", "base": "<tip the page was opened at>", "message": "…",
  "changes": [
    { "op": "put", "path": "docs/a.md", "content": "…", "encoding": "utf8", "overwrite": false },
    { "op": "put", "path": "img/logo.png", "content": "<base64>", "encoding": "base64", "overwrite": true },
    { "op": "delete", "path": "old.txt" },
    { "op": "move", "from": "a/b.txt", "to": "c/b.txt" } ] }
```

Paths are validated segment by segment (no empty, `.`, `..`, `.git`,
backslash or control characters); trees are written in git order and
directories left empty are pruned. Writes are serialized with pushes.
Answers `{ commit, parent, branch, tree, paths }`, or an error with a
`code`: 409 `stale` (the branch moved; `tip` is the new one), 422
`conflict` / `unchanged`, 404 `missing`, 400 `invalid`, 413 `toolarge`
(20 MB decoded / 200 files per commit).

### POST /~mio/api/r/\<repo\>/refs

`{ "action": "create", "name", "from" }` (branch, tag or SHA),
`{ "action": "delete", "name", "expect"? }` (409 when the tip is not
`expect`), `{ "action": "default", "name" }` (moves HEAD). The default
branch and `main` are never deletable here; the push policy
(`src/policy.ts`) is applied to every ref change.

### GET /~mio/api/r/\<repo\>/files?h=\<ref\>

`/api/files` for any repository (private ones included) with the console
session.

## RPC

The same surface as typed methods on the cell, for same-account Workers
holding the `REPO` binding:

```ts
const repo = env.REPO.getByName("myrepo");
await repo.listRefs();                              // RefsResult
await repo.readCommit("v1");                        // CommitJson | null
await repo.listLog("main", { path: "src", n: 20 }); // LogResult
await repo.listTree("main", "src");                 // TreeResult | null
await repo.readBlob("main", "src/a.ts");            // BlobResult | null — { oid, mode, data }
await repo.readDiff("main");                        // DiffResult | null
```

Resolution, bounds, and reachability match the JSON API; pass
`undefined` as the ref for HEAD. Every shape is an exported type,
alongside `PushEvent`, `AuthContext`, `DurableGitOptions`, `Env`, and
`RepoInfo`.

RPC runs no auth — a binding is trusted infrastructure. A route built
on it gates itself: validate the name before `getByName` (an unchecked
name materializes a billable cell per probe), check the registry, and
hold private reads to real credentials. The registry is addressed the
same way:

```ts
await env.REGISTRY.getByName("registry").get(repo); // RepoInfo | null
```
