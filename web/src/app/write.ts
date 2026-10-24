// Web writes from the console: one JSON request per commit (src/admin.ts ->
// src/repo.ts commitChanges), plus the client-side mirrors of the server's path
// and branch-name rules so mistakes show up while typing, in both languages.
import { invalidate, post, postWithProgress, type Res } from './api';
import { repoPath } from './format';

export type WriteChange =
  | { op: 'put'; path: string; content: string; encoding?: 'utf8' | 'base64'; overwrite?: boolean }
  | { op: 'delete'; path: string }
  | { op: 'move'; from: string; to: string };

export interface CommitOk { commit: string; parent: string; branch: string; paths: string[] }
export interface WriteErr { error?: string; code?: 'stale' | 'conflict' | 'missing' | 'invalid' | 'toolarge' | 'unchanged' | 'exists' | 'default' | 'protected' | 'policy'; tip?: string }

/** the per-commit limits enforced by the cell (src/repo.ts) */
export const MAX_COMMIT_BYTES = 20 * 1024 * 1024;
export const MAX_COMMIT_FILES = 200;

type T = (en: string, zh: string) => string;

const te = new TextEncoder();

/** mirror of src/git/tree-edit.ts splitPath(): null = fine, else a message */
export function pathProblem(path: string, t: T): string | null {
  if (!path) return t('Enter a file name.', '请输入文件名。');
  if (path.startsWith('/') || path.endsWith('/')) return t('A path cannot start or end with “/”.', '路径不能以“/”开头或结尾。');
  if (te.encode(path).length > 4096) return t('The path is too long.', '路径太长。');
  for (const s of path.split('/')) {
    if (!s) return t('A path cannot contain “//”.', '路径里不能有连续的“//”。');
    if (s === '.' || s === '..') return t('“.” and “..” are not allowed in a path.', '路径里不能有“.”或“..”。');
    if (s.toLowerCase() === '.git') return t('“.git” is reserved.', '“.git”是保留名称。');
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f\\]/.test(s)) return t('Backslashes and control characters are not allowed.', '不能包含反斜杠或控制字符。');
    if (s !== s.trim()) return t('A name cannot start or end with a space.', '名称不能以空格开头或结尾。');
    if (te.encode(s).length > 255) return t('A file or folder name is too long.', '文件或文件夹名太长。');
  }
  return null;
}

/** mirror of badBranchName() */
export function branchProblem(name: string, t: T): string | null {
  if (!name) return t('Enter a branch name.', '请输入分支名。');
  if (te.encode(name).length > 200) return t('The branch name is too long.', '分支名太长。');
  if (name === '@' || name === 'HEAD') return t('This name is reserved.', '这个名字是保留的。');
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(name)) return t('Branch names cannot contain spaces or ~ ^ : ? * [ \\', '分支名不能包含空格或 ~ ^ : ? * [ \\');
  if (name.includes('..') || name.includes('@{') || name.includes('//')) return t('Branch names cannot contain “..”, “@{” or “//”.', '分支名不能包含“..”“@{”或“//”。');
  if (name.startsWith('/') || name.endsWith('/') || name.endsWith('.') || name.startsWith('-')) return t('Cannot start with “/” or “-”, or end with “/” or “.”.', '不能以“/”或“-”开头，也不能以“/”或“.”结尾。');
  if (name.split('/').some((p) => p.startsWith('.') || p.endsWith('.lock'))) return t('No part may start with “.” or end with “.lock”.', '每一段都不能以“.”开头或以“.lock”结尾。');
  return null;
}

/** a server answer -> one sentence in the current language */
export function writeError(r: Res<WriteErr>, t: T): string {
  const b = r.body ?? {};
  const detail = b.error ? ` (${b.error})` : '';
  if (r.status === 0) return t('Network error. Nothing was committed; try again.', '网络错误，没有提交任何内容，请重试。');
  if (b.code === 'stale' || r.status === 409) return t('The branch has new commits since you opened this page. Reload to get them, then commit again — your edits are kept.', '打开页面后分支有了新提交。请先刷新到最新，再提交一次——你的修改会保留。');
  if (b.code === 'toolarge' || r.status === 413) return t('Too large: at most 20 MB and 200 files per commit.', '太大了：每次提交最多 20 MB、200 个文件。');
  if (b.code === 'unchanged') return t('Nothing changed, so there is nothing to commit.', '没有任何改动，无需提交。');
  if (b.code === 'conflict' || b.code === 'exists') return t(`Conflicts with what is in the branch${detail}.`, `与分支里现有的内容冲突${detail}。`);
  if (b.code === 'missing' || r.status === 404) return t(`Not found${detail}.`, `没有找到${detail}。`);
  if (b.code === 'default') return t('The default branch cannot be deleted. Make another branch the default first.', '默认分支不能删除，请先把其他分支设为默认。');
  if (b.code === 'protected' || b.code === 'policy' || r.status === 403) return t(`Refused by branch protection${detail}.`, `被分支保护拒绝${detail}。`);
  if (r.status === 401) return t('Your console session ended. Sign in again.', '管理台登录已过期，请重新登录。');
  return b.error || t('Something went wrong.', '出错了，请稍后再试。');
}

export interface CommitRequest { branch: string; base: string; message: string; changes: WriteChange[] }

export async function commitChanges(repo: string, req: CommitRequest, csrf: string, onProgress?: (f: number) => void): Promise<Res<CommitOk & WriteErr>> {
  const url = `/~mio/api/r/${repoPath(repo)}/commit`;
  const r = onProgress ? await postWithProgress<CommitOk & WriteErr>(url, req, csrf, onProgress) : await post<CommitOk & WriteErr>(url, req, csrf);
  // every cached page of every repository view may now be stale (lists, trees, logs)
  if (r.status === 200) invalidate();
  return r;
}

export async function refsAction(repo: string, body: { action: 'create' | 'delete' | 'default'; name: string; from?: string; expect?: string }, csrf: string) {
  const r = await post<WriteErr & { commit?: string; created?: string; deleted?: string; default?: string }>(`/~mio/api/r/${repoPath(repo)}/refs`, body, csrf);
  if (r.status === 200) invalidate();
  return r;
}

/** bytes -> base64 in chunks (a spread of a 20 MB array would overflow the stack) */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** "a/b/c.txt" -> ["a/b", "c.txt"] */
export function splitDir(path: string): [string, string] {
  const i = path.lastIndexOf('/');
  return i < 0 ? ['', path] : [path.slice(0, i), path.slice(i + 1)];
}
