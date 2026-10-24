// Unit tests for the web-commit tree editor (src/git/tree-edit.ts), checked
// against real git: the trees we build must hash exactly like `git write-tree`
// and pass `git fsck`. Run: node --experimental-strip-types --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { applyChanges, splitPath, sortEntries, badBranchName, EditError, EMPTY_TREE, parseTreeData, type Change } from "../src/git/tree-edit.ts";

const te = new TextEncoder();
const sha1 = (type: string, data: Uint8Array) => createHash("sha1").update(Buffer.concat([Buffer.from(`${type} ${data.length}\0`), Buffer.from(data)])).digest("hex");

/** an in-memory object store with helpers to build trees from a {path: content} map */
function store() {
  const objs = new Map<string, Uint8Array>();
  const blob = (s: string) => {
    const d = te.encode(s);
    const oid = sha1("blob", d);
    objs.set(oid, d);
    return oid;
  };
  const deps = {
    loadTree: async (oid: string) => objs.get(oid) ?? null,
    hash: (type: "tree", data: Uint8Array) => {
      const oid = sha1(type, data);
      objs.set(oid, data);
      return oid;
    },
  };
  return { objs, blob, deps };
}

/** list every file path -> blob oid under a tree */
function walk(objs: Map<string, Uint8Array>, tree: string, prefix = "", out = new Map<string, string>()) {
  for (const e of parseTreeData(objs.get(tree)!)) {
    const p = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.mode === "40000") walk(objs, e.oid, p, out);
    else out.set(p, e.oid);
  }
  return out;
}

/** what git itself says the tree of these files is */
function gitTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "tree-edit-"));
  try {
    execFileSync("git", ["init", "-q", dir]);
    for (const [p, c] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), c);
    }
    execFileSync("git", ["-C", dir, "add", "-A"]);
    return execFileSync("git", ["-C", dir, "write-tree"]).toString().trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function build(s: ReturnType<typeof store>, files: Record<string, string>) {
  const changes: Change[] = Object.entries(files).map(([path, c]) => ({ op: "put", path, blob: s.blob(c) }));
  return (await applyChanges(null, changes, s.deps)).tree;
}

test("trees hash exactly like git write-tree (ordering: a.b < a/ < a0, unicode by bytes)", async () => {
  const s = store();
  const files = { "a.b": "1", "a/x": "2", a0: "3", "é.txt": "4", "z/y/w.md": "5", "Ab": "6", "ab": "7", "a-b/c": "8" };
  assert.equal(await build(s, files), gitTree(files));
});

test("create, overwrite, delete, move across directories", async () => {
  const s = store();
  const root = await build(s, { "README.md": "r", "src/a.ts": "a", "src/b.ts": "b", "docs/x/y.txt": "y" });
  const r = await applyChanges(root, [
    { op: "put", path: "src/new/c.ts", blob: s.blob("c") },
    { op: "put", path: "README.md", blob: s.blob("r2"), overwrite: true },
    { op: "delete", path: "src/b.ts" },
    { op: "move", from: "src/a.ts", to: "lib/a.ts" },
  ], s.deps);
  const want = { "README.md": "r2", "src/new/c.ts": "c", "lib/a.ts": "a", "docs/x/y.txt": "y" };
  assert.equal(r.tree, gitTree(want));
  assert.deepEqual([...walk(s.objs, r.tree).keys()].sort(), Object.keys(want).sort());
});

test("deleting the last file prunes empty directories (and can empty the root)", async () => {
  const s = store();
  const root = await build(s, { "keep.txt": "k", "a/b/c/only.txt": "o" });
  const r = await applyChanges(root, [{ op: "delete", path: "a/b/c/only.txt" }], s.deps);
  assert.equal(r.tree, gitTree({ "keep.txt": "k" }));
  const r2 = await applyChanges(r.tree, [{ op: "delete", path: "keep.txt" }], s.deps);
  assert.equal(r2.tree, EMPTY_TREE);
  const r3 = await applyChanges(root, [{ op: "move", from: "a/b/c/only.txt", to: "only.txt" }], s.deps);
  assert.equal(r3.tree, gitTree({ "keep.txt": "k", "only.txt": "o" }));
});

test("only the trees along the touched path are rewritten", async () => {
  const s = store();
  const root = await build(s, { "a/1": "1", "b/2": "2", "c/d/3": "3" });
  const r = await applyChanges(root, [{ op: "put", path: "c/d/4", blob: s.blob("4") }], s.deps);
  assert.equal(r.trees.length, 3); // c/d, c, root
});

test("conflicts and missing paths", async () => {
  const s = store();
  const root = await build(s, { "f.txt": "f", "d/g.txt": "g" });
  const code = async (c: Change[]) => {
    try {
      await applyChanges(root, c, s.deps);
      return 0;
    } catch (e) {
      assert.ok(e instanceof EditError, String(e));
      return (e as EditError).status;
    }
  };
  assert.equal(await code([{ op: "put", path: "f.txt", blob: s.blob("x") }]), 422, "create over an existing file");
  assert.equal(await code([{ op: "put", path: "d", blob: s.blob("x"), overwrite: true }]), 422, "file over a directory");
  assert.equal(await code([{ op: "put", path: "f.txt/x", blob: s.blob("x") }]), 422, "through a file");
  assert.equal(await code([{ op: "delete", path: "nope.txt" }]), 404);
  assert.equal(await code([{ op: "delete", path: "d" }]), 422, "delete a directory as a file");
  assert.equal(await code([{ op: "move", from: "f.txt", to: "d/g.txt" }]), 422, "move onto an existing file");
  assert.equal(await code([{ op: "move", from: "f.txt", to: "f.txt" }]), 400);
  assert.equal(await code([{ op: "put", path: "f.txt", blob: s.blob("x"), overwrite: true }]), 0);
});

test("path validation, segment by segment", () => {
  for (const bad of ["", "/a", "a/", "a//b", "a/../b", "./a", ".git/config", "x/.GIT/y", "a\\b", "a\u0000b", "a\nb", " a", "a /b", "x".repeat(256)]) {
    assert.throws(() => splitPath(bad), EditError, JSON.stringify(bad));
  }
  assert.deepEqual(splitPath("docs/中文 名.md"), ["docs", "中文 名.md"]);
  assert.deepEqual(splitPath(".github/workflows/ci.yml"), [".github", "workflows", "ci.yml"]);
});

test("sortEntries puts trees after same-prefix files the way git does", () => {
  const names = sortEntries([
    { mode: "40000", name: "a", oid: "0".repeat(40) },
    { mode: "100644", name: "a.b", oid: "0".repeat(40) },
    { mode: "100644", name: "a0", oid: "0".repeat(40) },
  ]).map((e) => e.name);
  assert.deepEqual(names, ["a.b", "a", "a0"]);
});

test("branch names", () => {
  for (const ok of ["main", "feat/web-files", "release-1.2", "中文"]) assert.equal(badBranchName(ok), null, ok);
  for (const bad of ["", "a b", "a..b", "a~1", "x^", "a:b", "-x", "x/", "/x", "x.", "x.lock", "a/.b", "@", "HEAD", "a@{1}", "a//b"]) assert.notEqual(badBranchName(bad), null, bad);
});
