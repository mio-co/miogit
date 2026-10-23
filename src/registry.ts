import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { isRole, type Role } from "./policy";

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

/** A per-assistant access token. Only the SHA-256 of the secret is stored. */
export type TokenRow = {
  id: string;
  name: string;
  role: Role;
  created: number;
  last_used: number;
  /** unix millis after which the token stops working; 0 = never expires (every token from before expiry existed) */
  expires_at: number;
};

/** authToken result for a token that exists but is past its expires_at */
export type ExpiredToken = { expired: true; id: string; name: string };

/** last_used is refreshed at most this often per token (each refresh is a DO row write) */
const TOKEN_TOUCH_MS = 10 * 60 * 1000;
const TOKEN_COLS = "id, name, role, created, last_used, expires_at";

/** console login: this many failures per IP per window, then locked until the window ends */
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

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
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        hash TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        created INTEGER NOT NULL,
        last_used INTEGER NOT NULL DEFAULT 0,
        revoked INTEGER NOT NULL DEFAULT 0
      );
    `);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS login_fail (
        ip TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_at INTEGER NOT NULL
      );
    `);
    // tokens from before expiry existed get 0 = never expires (no data rewrite)
    try {
      ctx.storage.sql.exec("ALTER TABLE tokens ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0");
    } catch {
      // column already exists
    }
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

  // ---- access tokens -------------------------------------------------------

  /**
   * Resolve a token by the SHA-256 (hex) of its secret. Revoked tokens never
   * match, so revocation takes effect on the very next request; a token past
   * its expires_at comes back as { expired } (checked on every request, so it
   * stops working the moment it expires). Refreshes last_used, throttled to
   * one write per token per TOKEN_TOUCH_MS.
   */
  authToken(hash: string, now = Date.now()): TokenRow | ExpiredToken | null {
    const row = this.ctx.storage.sql
      .exec<TokenRow>(`SELECT ${TOKEN_COLS} FROM tokens WHERE hash = ? AND revoked = 0`, hash)
      .toArray()[0];
    if (!row || !isRole(row.role)) return null;
    if (row.expires_at > 0 && now >= row.expires_at) return { expired: true, id: row.id, name: row.name };
    if (now - row.last_used > TOKEN_TOUCH_MS) {
      this.ctx.storage.sql.exec("UPDATE tokens SET last_used = ? WHERE id = ?", now, row.id);
      row.last_used = now;
    }
    return row;
  }

  /** Active token by id (sessions re-check their token on every request). */
  tokenById(id: string): TokenRow | null {
    const row = this.ctx.storage.sql
      .exec<TokenRow>(`SELECT ${TOKEN_COLS} FROM tokens WHERE id = ? AND revoked = 0`, id)
      .toArray()[0];
    return row && isRole(row.role) ? row : null;
  }

  listTokens(): TokenRow[] {
    return this.ctx.storage.sql
      .exec<TokenRow>(`SELECT ${TOKEN_COLS} FROM tokens WHERE revoked = 0 ORDER BY created DESC LIMIT 500`)
      .toArray();
  }

  /** expiresAt: unix millis, 0 = never expires */
  createToken(id: string, hash: string, name: string, role: Role, expiresAt = 0, now = Date.now()): TokenRow {
    if (!isRole(role)) throw new Error("bad role");
    const exp = Number.isFinite(expiresAt) && expiresAt > 0 ? Math.floor(expiresAt) : 0;
    this.ctx.storage.sql.exec(
      "INSERT INTO tokens (id, hash, name, role, created, last_used, revoked, expires_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)",
      id,
      hash,
      name,
      role,
      now,
      exp
    );
    return { id, name, role, created: now, last_used: 0, expires_at: exp };
  }

  /** Revoke (kept as a tombstone so the id is never reused); true if it was active. */
  revokeToken(id: string): boolean {
    const cur = this.tokenById(id);
    if (!cur) return false;
    this.ctx.storage.sql.exec("UPDATE tokens SET revoked = ? WHERE id = ?", Date.now(), id);
    return true;
  }

  // ---- console settings / login throttle -----------------------------------

  getSetting(key: string): string | null {
    return this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = ?", key).toArray()[0]?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      value
    );
  }

  /** ms until this IP may try again (0 = allowed). Shared by every isolate, unlike an in-memory map. */
  loginBlocked(ip: string, now = Date.now()): number {
    const r = this.ctx.storage.sql.exec<{ count: number; reset_at: number }>("SELECT count, reset_at FROM login_fail WHERE ip = ?", ip).toArray()[0];
    if (!r || r.reset_at <= now) return 0;
    return r.count >= LOGIN_MAX_FAILS ? r.reset_at - now : 0;
  }

  loginFailed(ip: string, now = Date.now()): void {
    const r = this.ctx.storage.sql.exec<{ count: number; reset_at: number }>("SELECT count, reset_at FROM login_fail WHERE ip = ?", ip).toArray()[0];
    if (!r || r.reset_at <= now) {
      this.ctx.storage.sql.exec(
        "INSERT INTO login_fail (ip, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET count = 1, reset_at = excluded.reset_at",
        ip,
        now + LOGIN_WINDOW_MS
      );
    } else {
      this.ctx.storage.sql.exec("UPDATE login_fail SET count = count + 1 WHERE ip = ?", ip);
    }
    // bounded: drop expired rows now and then
    if (Math.random() < 0.05) this.ctx.storage.sql.exec("DELETE FROM login_fail WHERE reset_at <= ?", now);
  }

  loginSucceeded(ip: string): void {
    this.ctx.storage.sql.exec("DELETE FROM login_fail WHERE ip = ?", ip);
  }
}
