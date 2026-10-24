/**
 * Multi-file tree edits for web commits (new / upload / delete / rename / edit).
 *
 * Pure and dependency-free (the caller injects tree loading and hashing), so the
 * rules are unit-testable on their own (tests/tree-edit.test.ts):
 *   - every path is validated segment by segment (no "", ".", "..", ".git",
 *     control characters, backslashes; byte limits);
 *   - only the trees along the touched paths are loaded and rewritten;
 *   - entries are written in git's canonical order (byte order, a tree sorts as
 *     "<name>/"), so `git fsck` stays clean;
 *   - directories that end up empty are pruned (git cannot store an empty tree
 *     entry); the root itself may become the empty tree.
 */

export interface Entry {
  mode: string;
  name: string;
  oid: string;
}

export type Change =
  /** write a file (create, or overwrite when `overwrite`); mode defaults to the old mode or 100644 */
  | { op: "put"; path: string; blob: string; mode?: string; overwrite?: boolean }
  | { op: "delete"; path: string }
  /** rename / move a file (also across directories); keeps its content and mode */
  | { op: "move"; from: string; to: string };

export interface Deps {
  /** raw tree object data for an oid, or null when missing / not a tree */
  loadTree(oid: string): Promise<Uint8Array | null>;
  hash(type: "tree", data: Uint8Array): string;
}

export class EditError extends Error {
  /** 400 bad input · 404 missing path · 422 conflicts with the tree */
  status: 400 | 404 | 422;
  constructor(status: 400 | 404 | 422, message: string) {
    super(message);
    this.status = status;
  }
}

const te = new TextEncoder();
const td = new TextDecoder();

export const MAX_PATH_BYTES = 4096;
export const MAX_SEGMENT_BYTES = 255;

/**
 * Split and validate a repository path. Throws EditError(400) with a reason.
 * Rules (stricter than git itself, matching what GitHub's web editor allows):
 * no empty segments, no "." / "..", no ".git" in any case, no control
 * characters, no backslash, no leading/trailing spaces in a segment, segment
 * <= 255 bytes, path <= 4096 bytes.
 */
export function splitPath(path: string): string[] {
  if (typeof path !== "string" || !path) throw new EditError(400, "empty path");
  if (te.encode(path).length > MAX_PATH_BYTES) throw new EditError(400, "path too long");
  if (path.startsWith("/") || path.endsWith("/")) throw new EditError(400, `bad path: ${path}`);
  const segs = path.split("/");
  for (const s of segs) {
    if (!s) throw new EditError(400, `empty path segment in ${path}`);
    if (s === "." || s === "..") throw new EditError(400, `“${s}” is not allowed in a path`);
    if (s.toLowerCase() === ".git") throw new EditError(400, "“.git” is not allowed in a path");
    if (/[\x00-\x1f\x7f\\]/.test(s)) throw new EditError(400, `bad character in ${JSON.stringify(s)}`);
    if (s !== s.trim()) throw new EditError(400, `leading or trailing space in ${JSON.stringify(s)}`);
    if (te.encode(s).length > MAX_SEGMENT_BYTES) throw new EditError(400, "path segment too long");
  }
  return segs;
}

export const isTree = (mode: string) => mode === "40000" || mode === "040000";
const isGitlink = (mode: string) => mode === "160000";
const VALID_FILE_MODES = new Set(["100644", "100755", "120000"]);

function cmpBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/** git's tree order: byte order of the name, a tree compared as if it ended in "/" */
export function sortEntries(entries: Entry[]): Entry[] {
  const key = (e: Entry) => te.encode(isTree(e.mode) ? `${e.name}/` : e.name);
  return entries
    .map((e) => ({ e, k: key(e) }))
    .sort((x, y) => cmpBytes(x.k, y.k))
    .map((x) => x.e);
}

export function parseTreeData(data: Uint8Array): Entry[] {
  const out: Entry[] = [];
  let pos = 0;
  while (pos < data.length) {
    let sp = pos;
    while (sp < data.length && data[sp] !== 0x20) sp++;
    let nul = sp + 1;
    while (nul < data.length && data[nul] !== 0) nul++;
    if (nul + 21 > data.length) throw new Error("malformed tree");
    const mode = td.decode(data.subarray(pos, sp));
    const name = td.decode(data.subarray(sp + 1, nul));
    let oid = "";
    for (let i = nul + 1; i < nul + 21; i++) oid += data[i].toString(16).padStart(2, "0");
    out.push({ mode, name, oid });
    pos = nul + 21;
  }
  return out;
}

export function encodeTreeData(entries: Entry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  let len = 0;
  for (const e of sortEntries(entries)) {
    const head = te.encode(`${e.mode.replace(/^0+(?=4)/, "")} ${e.name}\0`);
    const oid = new Uint8Array(20);
    for (let i = 0; i < 20; i++) oid[i] = parseInt(e.oid.slice(i * 2, i * 2 + 2), 16);
    parts.push(head, oid);
    len += head.length + 20;
  }
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

interface Dir {
  entries: Map<string, Entry>;
  /** loaded subdirectories (by name); only these can have changed */
  kids: Map<string, Dir>;
  dirty: boolean;
}

export interface EditResult {
  /** the new root tree oid */
  tree: string;
  /** every new tree object, children before parents */
  trees: { oid: string; data: Uint8Array }[];
  /** paths that were written / removed (for messages) */
  touched: string[];
}

/**
 * Apply `changes` in order to the tree `root` (null = empty repository).
 * Throws EditError for invalid paths and conflicts; never writes anything.
 */
export async function applyChanges(root: string | null, changes: Change[], deps: Deps): Promise<EditResult> {
  const load = async (oid: string | null): Promise<Dir> => {
    const d: Dir = { entries: new Map(), kids: new Map(), dirty: false };
    if (!oid) return d;
    const data = await deps.loadTree(oid);
    if (!data) throw new EditError(422, `missing tree ${oid}`);
    for (const e of parseTreeData(data)) d.entries.set(e.name, e);
    return d;
  };
  const top = await load(root);

  /** the directory holding segs[0..n-1]; create = make missing directories */
  const dirOf = async (segs: string[], create: boolean): Promise<Dir | null> => {
    let d = top;
    for (let i = 0; i < segs.length - 1; i++) {
      const name = segs[i];
      let kid = d.kids.get(name);
      if (!kid) {
        const e = d.entries.get(name);
        if (e && !isTree(e.mode)) {
          const at = segs.slice(0, i + 1).join("/");
          throw new EditError(422, isGitlink(e.mode) ? `${at} is a submodule` : `a file already exists at ${at}`);
        }
        if (!e && !create) return null;
        kid = await load(e ? e.oid : null);
        d.kids.set(name, kid);
        if (!e) d.entries.set(name, { mode: "40000", name, oid: "" });
      }
      d = kid;
    }
    return d;
  };
  const markDirty = async (segs: string[]) => {
    let d = top;
    d.dirty = true;
    for (let i = 0; i < segs.length - 1; i++) {
      d = d.kids.get(segs[i])!;
      d.dirty = true;
    }
  };
  const fileAt = async (path: string, segs: string[]): Promise<{ dir: Dir; entry: Entry }> => {
    const dir = await dirOf(segs, false);
    const entry = dir?.entries.get(segs[segs.length - 1]);
    if (!dir || !entry) throw new EditError(404, `no such file: ${path}`);
    if (isTree(entry.mode)) throw new EditError(422, `${path} is a directory`);
    if (isGitlink(entry.mode)) throw new EditError(422, `${path} is a submodule`);
    return { dir, entry };
  };
  const touched: string[] = [];
  const put = async (path: string, segs: string[], oid: string, mode: string, overwrite: boolean) => {
    const dir = (await dirOf(segs, true))!;
    const name = segs[segs.length - 1];
    const old = dir.entries.get(name);
    if (old) {
      if (isTree(old.mode)) throw new EditError(422, `a directory already exists at ${path}`);
      if (isGitlink(old.mode)) throw new EditError(422, `${path} is a submodule`);
      if (!overwrite) throw new EditError(422, `a file already exists at ${path}`);
    }
    dir.entries.set(name, { mode, name, oid });
    await markDirty(segs);
    touched.push(path);
  };

  for (const c of changes) {
    if (c.op === "put") {
      const segs = splitPath(c.path);
      if (!/^[0-9a-f]{40}$/.test(c.blob)) throw new EditError(400, "bad blob id");
      const prev = (await dirOf(segs, false))?.entries.get(segs[segs.length - 1]);
      const mode = c.mode ?? (prev && !isTree(prev.mode) && !isGitlink(prev.mode) ? prev.mode : "100644");
      if (!VALID_FILE_MODES.has(mode)) throw new EditError(400, `bad file mode ${mode}`);
      await put(c.path, segs, c.blob, mode, !!c.overwrite);
    } else if (c.op === "delete") {
      const segs = splitPath(c.path);
      const { dir, entry } = await fileAt(c.path, segs);
      dir.entries.delete(entry.name);
      await markDirty(segs);
      touched.push(c.path);
    } else if (c.op === "move") {
      const from = splitPath(c.from);
      const to = splitPath(c.to);
      if (c.from === c.to) throw new EditError(400, "the new path is the same as the old one");
      const { dir, entry } = await fileAt(c.from, from);
      dir.entries.delete(entry.name);
      await markDirty(from);
      await put(c.to, to, entry.oid, entry.mode, false);
      touched.push(c.from);
    } else {
      throw new EditError(400, "unknown change");
    }
  }

  // serialize bottom-up: only dirty directories get new objects; empty ones are pruned
  const trees: { oid: string; data: Uint8Array }[] = [];
  const write = (d: Dir): string | null => {
    for (const [name, kid] of d.kids) {
      if (!kid.dirty) {
        // loaded only for a lookup; a directory created by a failed lookup never stays
        if (d.entries.get(name)?.oid === "") d.entries.delete(name);
        continue;
      }
      const oid = write(kid);
      if (oid === null) d.entries.delete(name);
      else d.entries.set(name, { mode: "40000", name, oid });
    }
    if (d.entries.size === 0) return null;
    const data = encodeTreeData([...d.entries.values()]);
    const oid = deps.hash("tree", data);
    trees.push({ oid, data });
    return oid;
  };
  let tree: string;
  if (!top.dirty) {
    tree = root ?? EMPTY_TREE;
  } else {
    const oid = write(top);
    if (oid === null) {
      const data = new Uint8Array(0);
      tree = deps.hash("tree", data);
      trees.push({ oid: tree, data });
    } else tree = oid;
  }
  return { tree, trees, touched };
}

export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/**
 * Validate a branch name like `git check-ref-format --branch` (the parts a web
 * form can get wrong). Returns an error message or null.
 */
export function badBranchName(name: string): string | null {
  if (!name) return "empty branch name";
  if (te.encode(name).length > 200) return "branch name too long";
  if (name === "@" || name === "HEAD") return `“${name}” is not a valid branch name`;
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(name)) return "branch names cannot contain spaces or ~ ^ : ? * [ \\";
  if (name.includes("..") || name.includes("@{") || name.includes("//")) return "branch names cannot contain “..”, “@{” or “//”";
  if (name.startsWith("/") || name.endsWith("/") || name.endsWith(".") || name.startsWith("-")) return "branch names cannot start with “/” or “-”, or end with “/” or “.”";
  for (const part of name.split("/")) {
    if (part.startsWith(".") || part.endsWith(".lock")) return "no part of a branch name may start with “.” or end with “.lock”";
  }
  return null;
}
