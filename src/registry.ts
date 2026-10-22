import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

export type RepoInfo = {
  name: string;
  desc: string;
  owner: string;
  section: string;
  priv: number; // 1 = requires auth for all access, hidden from index
  /** unix millis of the newest commit; the index sort key */
  idle: number;
  /** bumped on every push/config change; used as the page-cache version */
  ver: number;
  /** primary language of the default branch ("" = none) */
  lang: string;
  /** bytes in the repo's Durable Object SQLite file */
  db_bytes: number;
  /** pack bytes kept in R2 */
  r2_bytes: number;
};

export type RepoConfig = {
  desc?: string;
  owner?: string;
  section?: string;
  priv?: boolean;
};

/** Site-wide list of repositories (one instance, name "registry"). */
export class Registry extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS repos (
        name TEXT PRIMARY KEY,
        desc TEXT NOT NULL DEFAULT '',
        owner TEXT NOT NULL DEFAULT '',
        section TEXT NOT NULL DEFAULT '',
        priv INTEGER NOT NULL DEFAULT 0,
        idle INTEGER NOT NULL DEFAULT 0,
        ver INTEGER NOT NULL DEFAULT 1
      );
    `);
    // upgrade path for databases created by earlier versions
    for (const col of ["section TEXT NOT NULL DEFAULT ''", "priv INTEGER NOT NULL DEFAULT 0", "ver INTEGER NOT NULL DEFAULT 1", "lang TEXT NOT NULL DEFAULT ''", "db_bytes INTEGER NOT NULL DEFAULT 0", "r2_bytes INTEGER NOT NULL DEFAULT 0"]) {
      try {
        ctx.storage.sql.exec(`ALTER TABLE repos ADD COLUMN ${col}`);
      } catch {
        // column already exists
      }
    }
  }

  upsert(name: string, idle: number, lang?: string): void {
    // seed ver from the clock so a deleted-and-recreated repo never reuses
    // cache-key versions from its previous incarnation
    this.ctx.storage.sql.exec(
      "INSERT INTO repos (name, idle, ver, lang) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET idle = excluded.idle, ver = ver + 1, lang = COALESCE(?, lang)",
      name,
      idle,
      Date.now(),
      lang ?? "",
      lang ?? null
    );
  }

  setConfig(name: string, cfg: RepoConfig, idle?: number, lang?: string): void {
    const cur = this.get(name);
    if (!cur) return;
    this.ctx.storage.sql.exec(
      "UPDATE repos SET desc = ?, owner = ?, section = ?, priv = ?, idle = ?, lang = ?, ver = ver + 1 WHERE name = ?",
      cfg.desc ?? cur.desc,
      cfg.owner ?? cur.owner,
      cfg.section ?? cur.section,
      cfg.priv === undefined ? cur.priv : cfg.priv ? 1 : 0,
      idle ?? cur.idle,
      lang ?? cur.lang,
      name
    );
  }

  setBytes(name: string, b: { db: number; r2: number }): void {
    this.ctx.storage.sql.exec("UPDATE repos SET db_bytes = ?, r2_bytes = ? WHERE name = ?", Math.max(0, b.db | 0), Math.max(0, b.r2 | 0), name);
  }

  remove(name: string): void {
    this.ctx.storage.sql.exec("DELETE FROM repos WHERE name = ?", name);
  }

  get(name: string): RepoInfo | null {
    const rows = this.ctx.storage.sql
      .exec<RepoInfo>("SELECT name, desc, owner, section, priv, idle, ver, lang, db_bytes, r2_bytes FROM repos WHERE name = ?", name)
      .toArray();
    return rows[0] ?? null;
  }

  /** Public index page feed: excludes private repos, bounded so a large table
   * can't dump wholesale over RPC. `ns` filters to one namespace ("ns/..."),
   * as a range scan: '0' is the code point after '/'. */
  list(limit = 1000, ns?: string, includePrivate = false): RepoInfo[] {
    const pv = includePrivate ? "" : "priv = 0 AND ";
    if (ns) {
      return this.ctx.storage.sql
        .exec<RepoInfo>(
          `SELECT name, desc, owner, section, priv, idle, ver, lang, db_bytes, r2_bytes FROM repos WHERE ${pv}name >= ? AND name < ? ORDER BY idle DESC LIMIT ?`,
          `${ns}/`,
          `${ns}0`,
          limit
        )
        .toArray();
    }
    return this.ctx.storage.sql
      .exec<RepoInfo>(
        `SELECT name, desc, owner, section, priv, idle, ver, lang, db_bytes, r2_bytes FROM repos ${includePrivate ? "" : "WHERE priv = 0 "}ORDER BY idle DESC LIMIT ?`,
        limit
      )
      .toArray();
  }
}
