/**
 * Authentication primitives for MioGit:
 *  - git tokens: env secrets (GIT_TOKEN / GIT_TOKENS, admin) and per-assistant
 *    tokens stored in the Registry as SHA-256 hashes (admin / writer / reader)
 *  - the web console account (/~mio/*): username + PBKDF2-SHA256 password hash,
 *    a signed HttpOnly SameSite=Strict cookie scoped to /~mio/, CSRF tokens
 *  - Cloudflare Access JWT verification for everything under /~mio/
 *
 * git tokens and the console session are deliberately disjoint: a token never
 * signs in to the console, and the console cookie (Path=/~mio/) never reaches
 * a git endpoint.
 */
import type { Env } from "./env";
import type { Principal, Role } from "./policy";

const te = new TextEncoder();

// ---- encoding / digests ------------------------------------------------------

export function b64url(b: ArrayBuffer | Uint8Array): string {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s)));
}

export async function sha256Hex(s: string): Promise<string> {
  return [...(await sha256(s))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare of two byte strings (length difference folded in). */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Timing-safe string compare via fixed-length digests. */
export async function secretsEqual(a: string, b: string): Promise<boolean> {
  return bytesEqual(await sha256(a), await sha256(b));
}

// ---- git tokens ----------------------------------------------------------------

/** env tokens (GIT_TOKEN + comma-separated GIT_TOKENS): always admin. */
export function envTokens(env: Env): string[] {
  return [env.GIT_TOKEN ?? "", ...(env.GIT_TOKENS ?? "").split(",")].map((t) => t.trim()).filter(Boolean);
}

/** A fresh token secret: "mgt_" + 32 random bytes (256 bits), base64url. */
export function newTokenSecret(): string {
  return "mgt_" + b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function newTokenId(): string {
  return "t_" + b64url(crypto.getRandomValues(new Uint8Array(9)));
}

/**
 * Resolve a git credential (HTTP Basic password) to a principal, or null.
 * Env tokens are checked first (constant-time against each), then the token
 * table by SHA-256. Revoked tokens never resolve; an expired one resolves to
 * "expired" so the caller can refuse it outright (public reads included).
 */
export async function resolveToken(env: Env, pass: string): Promise<Principal | "expired" | null> {
  if (!pass) return null;
  const pd = await sha256(pass);
  const list = envTokens(env);
  let envIdx = -1;
  for (let i = 0; i < list.length; i++) if (bytesEqual(pd, await sha256(list[i])) && envIdx === -1) envIdx = i;
  if (envIdx !== -1) return { role: "admin", id: `env:${envIdx}`, name: envIdx === 0 && env.GIT_TOKEN ? "GIT_TOKEN" : `GIT_TOKENS[${envIdx}]` };
  if (!pass.startsWith("mgt_")) return null; // table tokens always carry the prefix
  const hex = [...pd].map((b) => b.toString(16).padStart(2, "0")).join("");
  const row = await env.REGISTRY.getByName("registry").authToken(hex);
  if (!row) return null;
  if ("expired" in row) return "expired";
  return { role: row.role as Role, id: row.id, name: row.name };
}

// ---- console password (PBKDF2-SHA256) -----------------------------------------

/** Workers caps PBKDF2 at 100k iterations; that is also the floor we require. */
export const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS, salt?: Uint8Array): Promise<string> {
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: s, iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${b64url(s)}$${b64url(bits)}`;
}

/** Verify against a stored "pbkdf2-sha256$iter$salt$hash" string; constant-time compare. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iter = parseInt(parts[1], 10);
  if (!Number.isFinite(iter) || iter < PBKDF2_ITERATIONS || iter > PBKDF2_ITERATIONS) return false;
  let salt: Uint8Array, want: Uint8Array;
  try {
    salt = fromB64url(parts[2]);
    want = fromB64url(parts[3]);
  } catch {
    return false;
  }
  const got = (await hashPassword(password, iter, salt)).split("$")[3];
  return bytesEqual(fromB64url(got), want);
}

export function adminUser(env: Env): string {
  return (env.ADMIN_USER ?? "mio").trim() || "mio";
}

/** Current password hash: the one set from the console (Registry) wins over the ADMIN_PASSWORD_HASH secret. */
export async function adminPasswordHash(env: Env): Promise<string | null> {
  const stored = await env.REGISTRY.getByName("registry").getSetting("admin_password_hash");
  return stored ?? env.ADMIN_PASSWORD_HASH ?? null;
}

// ---- console session -----------------------------------------------------------

export const SESSION_COOKIE = "mg_admin";
export const SESSION_PATH = "/~mio/";
export const SESSION_TTL_S = 12 * 3600;
/** "Remember me": the session survives closing the browser for 30 days. */
export const REMEMBER_TTL_S = 30 * 24 * 3600;

/** HMAC key bound to the current password hash: changing the password signs every session out. */
async function sessionKey(env: Env, passHash: string): Promise<CryptoKey> {
  const raw = await sha256(`miogit-session\0${env.SESSION_SECRET ?? ""}\0${passHash}`);
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function hmac(key: CryptoKey, msg: string): Promise<string> {
  return b64url(await crypto.subtle.sign("HMAC", key, te.encode(msg)));
}

export async function makeSession(env: Env, passHash: string, ttl = SESSION_TTL_S, now = Date.now()): Promise<string> {
  const exp = String(Math.floor(now / 1000) + ttl);
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const body = `${adminUser(env)}.${exp}.${nonce}`;
  return `${body}.${await hmac(await sessionKey(env, passHash), body)}`;
}

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** The session cookie value if it is valid for the current password, else null. */
export async function validSession(req: Request, env: Env, passHash: string | null): Promise<string | null> {
  if (!passHash) return null;
  const v = readCookie(req, SESSION_COOKIE);
  if (!v) return null;
  const parts = v.split(".");
  if (parts.length !== 4) return null;
  const [user, exp, nonce, sig] = parts;
  if (user !== adminUser(env) || !/^\d+$/.test(exp) || parseInt(exp, 10) < Date.now() / 1000 || !nonce) return null;
  const expect = await hmac(await sessionKey(env, passHash), `${user}.${exp}.${nonce}`);
  return (await secretsEqual(expect, sig)) ? v : null;
}

/** Seconds left on a valid session value (its signed expiry). */
export function sessionSecondsLeft(v: string, now = Date.now()): number {
  return Math.max(0, parseInt(v.split(".")[1] ?? "0", 10) - Math.floor(now / 1000));
}

/**
 * remember = true: persistent cookie that lives as long as the signed expiry (30 days).
 * remember = false: browser-session cookie (gone when the browser closes), signed expiry 12 h.
 * SameSite=Lax so links from other sites/apps into /~mio/ keep the session; every POST is CSRF-checked.
 */
export function sessionCookie(v: string, remember = false): string {
  const age = remember ? `; Max-Age=${sessionSecondsLeft(v)}` : "";
  return `${SESSION_COOKIE}=${v}; Path=${SESSION_PATH}${age}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=${SESSION_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * Signed-in hint for the public pages: carries no secret and grants nothing.
 * It only makes "/" and the top-left logo lead to the console list (/~mio/),
 * where Access and the real session (Path=/~mio/) are checked as always.
 */
export const HINT_COOKIE = "mg_signed";
export function hintCookie(): string {
  return `${HINT_COOKIE}=1; Path=/; Max-Age=${REMEMBER_TTL_S}; HttpOnly; Secure; SameSite=Lax`;
}
export function clearHintCookie(): string {
  return `${HINT_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
export function hasHint(req: Request): boolean {
  return new RegExp(`(?:^|;\\s*)${HINT_COOKIE}=1(?:;|$)`).test(req.headers.get("cookie") ?? "");
}

/** CSRF token bound to the session cookie (synchronizer token, derived — nothing stored). */
export async function csrfToken(env: Env, passHash: string, session: string): Promise<string> {
  return hmac(await sessionKey(env, passHash), `csrf\0${session}`);
}

export async function csrfValid(env: Env, passHash: string, session: string, given: string | null): Promise<boolean> {
  if (!given) return false;
  return secretsEqual(await csrfToken(env, passHash, session), given);
}

/** Same-origin check for state-changing requests (defence in depth next to the CSRF token). */
export function sameOrigin(req: Request): boolean {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  // pages are served with Referrer-Policy: no-referrer, under which browsers
  // send "Origin: null" on same-origin form posts: decide by Sec-Fetch-Site
  if (origin === "null") return site === "same-origin";
  if (origin) {
    try {
      return new URL(origin).host === url.host;
    } catch {
      return false;
    }
  }
  return !site || site === "same-origin";
}

// ---- Cloudflare Access JWT -----------------------------------------------------

type Jwk = JsonWebKey & { kid?: string };
let jwksMemo: { url: string; at: number; keys: Jwk[] } | null = null;

async function accessKeys(env: Env): Promise<Jwk[]> {
  if (env.ACCESS_JWKS) return (JSON.parse(env.ACCESS_JWKS) as { keys: Jwk[] }).keys ?? [];
  const url = `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
  if (jwksMemo && jwksMemo.url === url && Date.now() - jwksMemo.at < 3600_000) return jwksMemo.keys;
  const res = await fetch(url, { cf: { cacheTtl: 300 } } as RequestInit);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const keys = ((await res.json()) as { keys: Jwk[] }).keys ?? [];
  jwksMemo = { url, at: Date.now(), keys };
  return keys;
}

export type AccessResult = { ok: true; email: string } | { ok: false; status: number; why: string };

/**
 * Verify Cf-Access-Jwt-Assertion: RS256 signature against the team's certs,
 * iss = https://<team domain>, aud contains ACCESS_AUD, exp/nbf in range.
 * Fails closed when Access is not configured.
 */
export async function verifyAccess(req: Request, env: Env, now = Date.now()): Promise<AccessResult> {
  const team = (env.ACCESS_TEAM_DOMAIN ?? "").trim();
  const aud = (env.ACCESS_AUD ?? "").trim();
  if (!team || !aud) return { ok: false, status: 503, why: "Cloudflare Access is not configured (ACCESS_TEAM_DOMAIN / ACCESS_AUD)" };
  const jwt = req.headers.get("cf-access-jwt-assertion");
  if (!jwt) return { ok: false, status: 403, why: "missing Cloudflare Access assertion" };
  const parts = jwt.split(".");
  if (parts.length !== 3) return { ok: false, status: 403, why: "malformed Access assertion" };
  let header: { alg?: string; kid?: string }, payload: { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  } catch {
    return { ok: false, status: 403, why: "malformed Access assertion" };
  }
  if (header.alg !== "RS256") return { ok: false, status: 403, why: "unexpected Access assertion algorithm" };
  let keys: Jwk[];
  try {
    keys = await accessKeys(env);
  } catch {
    return { ok: false, status: 503, why: "cannot fetch Cloudflare Access certs" };
  }
  const candidates = header.kid ? keys.filter((k) => k.kid === header.kid) : keys;
  let verified = false;
  for (const jwk of candidates) {
    try {
      const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(parts[2]), te.encode(`${parts[0]}.${parts[1]}`))) {
        verified = true;
        break;
      }
    } catch {
      // try the next key
    }
  }
  if (!verified) return { ok: false, status: 403, why: "bad Access assertion signature" };
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return { ok: false, status: 403, why: "Access assertion audience mismatch" };
  if (payload.iss !== `https://${team}`) return { ok: false, status: 403, why: "Access assertion issuer mismatch" };
  const t = Math.floor(now / 1000);
  if (typeof payload.exp !== "number" || payload.exp < t) return { ok: false, status: 403, why: "Access assertion expired" };
  if (typeof payload.nbf === "number" && payload.nbf > t + 60) return { ok: false, status: 403, why: "Access assertion not yet valid" };
  return { ok: true, email: payload.email ?? "" };
}
