/**
 * Three-tier access policy (admin / writer / reader) — pure functions, no I/O,
 * so the rules are unit-testable on their own and shared by the Worker (which
 * decides who may reach a repository) and the RepoCell (which decides, per ref
 * update command, what a push may change).
 *
 *   owner  — everything admin can do, plus deleting repositories over HTTP
 *            (owner tokens are created in the console; nothing else is owner)
 *   admin  — everything else (the GIT_TOKEN / GIT_TOKENS secrets, plus admin tokens)
 *   writer — read every repository; push branches other than main / the default
 *            branch: create, fast-forward, and delete or force-push only the
 *            branches it created itself. No tags, no new repositories, no
 *            configuration or management endpoints.
 *   reader — read every repository; every push is refused.
 */

export type Role = "owner" | "admin" | "writer" | "reader";
export const ROLES: readonly Role[] = ["owner", "admin", "writer", "reader"];

/** admin-level rights: owner is admin plus repository deletion */
export function isAdminRole(role: Role | null | undefined): boolean {
  return role === "admin" || role === "owner";
}

export function isRole(v: unknown): v is Role {
  return v === "owner" || v === "admin" || v === "writer" || v === "reader";
}

/** Who a request authenticated as. `id` is stable per token (env tokens: "env:<n>"). */
export interface Principal {
  role: Role;
  id: string;
  name: string;
}

export const ZERO_OID = "0000000000000000000000000000000000000000";

export interface PolicyCommand {
  ref: string;
  old: string;
  next: string;
}

export interface PrePushContext {
  /** HEAD symref target, e.g. "refs/heads/main" */
  head: string;
  /** the repository has no refs at all (a brand-new or emptied repository) */
  empty: boolean;
  /** token id that created each ref (only refs a writer created are tracked) */
  ownerOf: (ref: string) => string | null;
}

/** main plus whatever HEAD points at (the default branch) are writer-read-only. */
export function protectedRefs(head: string): Set<string> {
  return new Set(["refs/heads/main", head]);
}

export const MSG = {
  readOnly: "read-only token: pushing is not allowed",
  noCreateRepo: "writer token cannot create repositories",
  branchesOnly: "writer token may only push branches (refs/heads/*)",
  protectedRef: "protected branch: writer token cannot push to main or the default branch",
  notOwnerDelete: "writer token can only delete branches it created",
  notOwnerForce: "non-fast-forward: writer token can only force-push branches it created",
  atomic: "atomic push failed: another ref in this push was refused",
} as const;

/**
 * Checks that need no objects: run BEFORE the pack is ingested, so a refused
 * push writes nothing at all. Returns one reason (or null = allowed so far)
 * per command, in order.
 */
export function prePushReasons(p: Principal, commands: PolicyCommand[], ctx: PrePushContext): (string | null)[] {
  if (isAdminRole(p.role)) return commands.map(() => null);
  if (p.role !== "writer") return commands.map(() => MSG.readOnly);
  const prot = protectedRefs(ctx.head);
  return commands.map((c) => {
    if (ctx.empty) return MSG.noCreateRepo;
    if (!c.ref.startsWith("refs/heads/")) return MSG.branchesOnly;
    if (prot.has(c.ref)) return MSG.protectedRef;
    if (c.next === ZERO_OID && ctx.ownerOf(c.ref) !== p.id) return MSG.notOwnerDelete;
    return null;
  });
}

/**
 * The check that needs the pushed objects (is this update a fast-forward?):
 * run after validatePush has classified each command.
 */
export function postPushReason(p: Principal, ref: string, forced: boolean, ownerOf: (ref: string) => string | null): string | null {
  if (isAdminRole(p.role)) return null;
  if (p.role !== "writer") return MSG.readOnly;
  if (forced && ownerOf(ref) !== p.id) return MSG.notOwnerForce;
  return null;
}

/**
 * All-or-nothing: when any command is refused by policy, every command is
 * refused, so a mixed push never half-applies. Returns null when nothing was
 * refused, else the final per-command reasons.
 */
export function atomicReasons(reasons: (string | null)[]): string[] | null {
  if (!reasons.some((r) => r !== null)) return null;
  return reasons.map((r) => r ?? MSG.atomic);
}

/** Worker-level gate: may this principal perform `op` at all? */
export function roleAllows(role: Role | null, op: "read" | "write" | "admin", isPrivate: boolean): boolean {
  if (op === "read") return !isPrivate || role !== null;
  if (op === "write") return isAdminRole(role) || role === "writer";
  return isAdminRole(role);
}
