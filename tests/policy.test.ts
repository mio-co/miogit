// Unit tests for the pure access policy. Run: node --test tests/  (Node >= 22.18 strips types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { prePushReasons, postPushReason, atomicReasons, roleAllows, isAdminRole, isRole, MSG, ZERO_OID, type Principal } from "../src/policy.ts";

const A = "a".repeat(40), B = "b".repeat(40);
const admin: Principal = { role: "admin", id: "env:0", name: "GIT_TOKEN" };
const writer: Principal = { role: "writer", id: "t_w", name: "hark6" };
const reader: Principal = { role: "reader", id: "t_r", name: "hark7" };
const owners = new Map([["refs/heads/mine", "t_w"], ["refs/heads/theirs", "t_other"]]);
const ctx = { head: "refs/heads/main", empty: false, ownerOf: (r: string) => owners.get(r) ?? null };

test("admin may do anything", () => {
  assert.deepEqual(prePushReasons(admin, [{ ref: "refs/heads/main", old: A, next: ZERO_OID }], ctx), [null]);
  assert.deepEqual(prePushReasons(admin, [{ ref: "refs/tags/v1", old: ZERO_OID, next: A }], { ...ctx, empty: true }), [null]);
  assert.equal(postPushReason(admin, "refs/heads/main", true, ctx.ownerOf), null);
});

test("reader may not push at all", () => {
  assert.deepEqual(prePushReasons(reader, [{ ref: "refs/heads/x", old: ZERO_OID, next: A }], ctx), [MSG.readOnly]);
});

test("writer: feature branches yes, main / default branch no", () => {
  const r = prePushReasons(writer, [
    { ref: "refs/heads/feat", old: ZERO_OID, next: A },
    { ref: "refs/heads/main", old: A, next: B },
    { ref: "refs/heads/main", old: A, next: ZERO_OID },
  ], ctx);
  assert.deepEqual(r, [null, MSG.protectedRef, MSG.protectedRef]);
  // the default branch is protected even when it is not called main
  assert.deepEqual(prePushReasons(writer, [{ ref: "refs/heads/trunk", old: A, next: B }], { ...ctx, head: "refs/heads/trunk" }), [MSG.protectedRef]);
});

test("writer: no tags, no new repositories", () => {
  assert.deepEqual(prePushReasons(writer, [{ ref: "refs/tags/v1", old: ZERO_OID, next: A }], ctx), [MSG.branchesOnly]);
  assert.deepEqual(prePushReasons(writer, [{ ref: "refs/heads/feat", old: ZERO_OID, next: A }], { ...ctx, empty: true }), [MSG.noCreateRepo]);
});

test("writer: delete and force only own branches", () => {
  assert.deepEqual(prePushReasons(writer, [{ ref: "refs/heads/mine", old: A, next: ZERO_OID }], ctx), [null]);
  assert.deepEqual(prePushReasons(writer, [{ ref: "refs/heads/theirs", old: A, next: ZERO_OID }], ctx), [MSG.notOwnerDelete]);
  assert.equal(postPushReason(writer, "refs/heads/mine", true, ctx.ownerOf), null);
  assert.equal(postPushReason(writer, "refs/heads/theirs", true, ctx.ownerOf), MSG.notOwnerForce);
  assert.equal(postPushReason(writer, "refs/heads/theirs", false, ctx.ownerOf), null); // fast-forward is fine
});

test("atomic: one refusal refuses all", () => {
  assert.equal(atomicReasons([null, null]), null);
  assert.deepEqual(atomicReasons([null, "x"]), [MSG.atomic, "x"]);
});

test("worker gate", () => {
  assert.equal(roleAllows(null, "read", false), true);
  assert.equal(roleAllows(null, "read", true), false);
  assert.equal(roleAllows("reader", "read", true), true);
  assert.equal(roleAllows("reader", "write", false), false);
  assert.equal(roleAllows("writer", "write", true), true);
  assert.equal(roleAllows("writer", "admin", false), false);
  assert.equal(roleAllows("admin", "admin", true), true);
  assert.equal(roleAllows("owner", "admin", true), true);
  assert.equal(roleAllows("owner", "write", true), true);
});

test("owner role", () => {
  assert.equal(isRole("owner"), true);
  assert.equal(isAdminRole("owner"), true);
  assert.equal(isAdminRole("admin"), true);
  assert.equal(isAdminRole("writer"), false);
  assert.equal(isAdminRole(null), false);
});
