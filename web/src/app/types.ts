// View models returned by /<repo>/api/view… and /~mio/api/… (see src/repo.ts view(), src/admin.ts api()).
export interface Meta {
  repo: string;
  desc: string;
  head: string;
  ref: string;
  branches: string[];
  nBranches: number;
  nTags: number;
  /** console only */
  priv?: boolean;
}
export interface Brief { oid: string; subject: string; author: string; time: number }
export interface Person { name: string; email: string; time: number; tz: string }
export interface Entry { name: string; type: 'tree' | 'blob' | 'commit'; oid?: string; size?: number }
export interface Deco { type: 'branch' | 'tag'; name: string }
export interface Hunk { aStart: number; aLen: number; bStart: number; bLen: number; ops: { tag: 'ctx' | 'add' | 'del'; line: string }[] }

export type View =
  | { kind: 'error'; error: string; meta?: Meta }
  | { kind: 'empty'; meta: Meta; cloneUrl: string }
  | {
      kind: 'summary';
      meta: Meta;
      cloneUrl: string;
      commits: number | string;
      last: Brief | null;
      snapRef: string;
      files: Entry[];
      readme: { name: string; html?: string; text?: string } | null;
      langs: { name: string; color: string; pct: number }[];
      bytes: number;
    }
  | { kind: 'tree'; meta: Meta; path: string[]; entries: Entry[] }
  | { kind: 'blob'; meta: Meta; path: string[]; size: number; binary: boolean; lineCount: number; image?: boolean; html?: string; lines?: string[] }
  | { kind: 'log'; meta: Meta; ofs: number; pageSize: number; more: boolean; filter: { qt: string; q: string; path: string }; commits: (Brief & { deco: Deco[] })[] }
  | { kind: 'branches'; meta: Meta; items: { name: string; isDefault: boolean; commit: Brief | null }[] }
  | { kind: 'tags'; meta: Meta; items: { name: string; when: number; commit: Brief | null }[] }
  | {
      kind: 'commit';
      meta: Meta;
      oid: string;
      subject: string;
      body: string;
      author: Person;
      committer: Person;
      parents: string[];
      deco: Deco[];
      truncated: boolean;
      files: { path: string; status: 'added' | 'deleted' | 'mode' | 'modified'; oldMode: string | null; newMode: string | null; kind: 'text' | 'binary' | 'toolarge'; add: number; del: number; hunks: Hunk[] }[];
    }
  | { kind: 'tag'; meta: Meta; name: string; annotated: boolean; tagger?: Person | null; message?: string; commit: Brief; snapName: string };

export interface RepoItem { name: string; description: string; owner: string; section: string; idle: number; private: boolean; lang: string; langColor?: string; bytes?: number }
export interface Storage {
  db: number;
  r2: number;
  total: number;
  repos: number;
  private: number;
  usage: { read: number; written: number } | null;
  limits: { doBytes: number; r2Bytes: number; rowsRead: number; rowsWritten: number };
  top: { name: string; bytes: number }[];
}
export interface TokenRow { id: string; name: string; role: 'admin' | 'writer' | 'reader'; created: number; last_used: number; expires_at: number }
export interface RepoSettings { name: string; description: string; owner: string; section: string; private: boolean; sync?: boolean; syncAt?: string | null; syncLinked?: boolean; syncConflicts?: string[] }
