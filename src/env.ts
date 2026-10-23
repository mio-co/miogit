import type { Registry } from "./registry";
import type { RepoCell } from "./repo";

export interface Env {
  REPO: DurableObjectNamespace<RepoCell>;
  REGISTRY: DurableObjectNamespace<Registry>;
  /** optional R2 bucket that offloads full-clone packs (absent on celld) */
  PACK_CACHE?: R2Bucket;
  /** admin git token (Basic auth password); per-assistant tokens live in the Registry */
  GIT_TOKEN?: string;
  /** browsers on any other host are redirected here; git and API traffic is served everywhere */
  CANONICAL_HOST?: string;
  /** optional comma-separated extra admin tokens */
  GIT_TOKENS?: string;
  /** max accepted push size in MB (default 512) */
  MAX_PUSH_MB?: string;
  /** in-memory ingest cache budget in MB, holding decompressed objects for
   * delta-base resolution during a push. Misses reload from SQLite, so a
   * smaller budget trades ingest speed for peak memory. Default: 16 on real
   * Workers (hard 128MB isolate), 64 on celld (multi-GB heap). */
  INGEST_CACHE_MB?: string;
  /** "1" screens every pushed object with SHA-1DC collision detection; default
   * hashes with native crypto.subtle (identical oid, far faster) */
  SHA1DC?: string;
  /** optional read-only Cloudflare token (Account Analytics: Read) for today's DO usage */
  CF_ANALYTICS_TOKEN?: string;
  /** Cloudflare account id the analytics query targets */
  CF_ACCOUNT_ID?: string;
  /** author identity and timezone for commits made in the web editor */
  EDIT_AUTHOR_NAME?: string;
  EDIT_AUTHOR_EMAIL?: string;
  EDIT_TZ?: string;
  /** web console (/~mio/) username; default "mio" */
  ADMIN_USER?: string;
  /** web console password as "pbkdf2-sha256$100000$<salt>$<hash>" (secret); a password changed in the console overrides it */
  ADMIN_PASSWORD_HASH?: string;
  /** optional extra secret mixed into the console session HMAC key */
  SESSION_SECRET?: string;
  /** Cloudflare Access team domain, e.g. "example.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application protecting /~mio/ */
  ACCESS_AUD?: string;
  /** tests / self-hosted only: inline JWKS JSON used instead of fetching the team certs */
  ACCESS_JWKS?: string;
  SITE_NAME?: string;
  SITE_DESC?: string;
  SITE_OWNER?: string;
}
