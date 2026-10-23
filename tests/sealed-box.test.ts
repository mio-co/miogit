// Unit test for the sealed box used to write GitHub Actions secrets. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import nacl from "tweetnacl";
import { sealedBox, openSealedBox } from "../src/sealed-box.ts";

test("sealed box round-trips and is randomised", () => {
  const kp = nacl.box.keyPair();
  const msg = new TextEncoder().encode("ghp_example_secret_value");
  const a = sealedBox(msg, kp.publicKey);
  const b = sealedBox(msg, kp.publicKey);
  assert.equal(a.length, 32 + 16 + msg.length);
  assert.notDeepEqual(a, b);
  assert.deepEqual(openSealedBox(a, kp.publicKey, kp.secretKey), msg);
  const other = nacl.box.keyPair();
  assert.equal(openSealedBox(a, other.publicKey, other.secretKey), null);
});
