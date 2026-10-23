/**
 * libsodium crypto_box_seal (what GitHub requires for Actions secrets) on
 * tweetnacl + BLAKE2b: ephemeral X25519 key pair, nonce = BLAKE2b-192(epk || pk),
 * XSalsa20-Poly1305 box, output epk || box. No relative imports, so the unit
 * test (tests/sealed-box.test.ts) runs it under plain node.
 */
import nacl from "tweetnacl";
import { blake2b } from "blakejs";

/** libsodium crypto_box_seal: ephemeral X25519 key, nonce = BLAKE2b-192(epk || pk), XSalsa20-Poly1305. */
export function sealedBox(message: Uint8Array, recipientPk: Uint8Array): Uint8Array {
  const eph = nacl.box.keyPair();
  const nonceIn = new Uint8Array(64);
  nonceIn.set(eph.publicKey, 0);
  nonceIn.set(recipientPk, 32);
  const nonce = blake2b(nonceIn, undefined, 24);
  const boxed = nacl.box(message, nonce, recipientPk, eph.secretKey);
  const out = new Uint8Array(32 + boxed.length);
  out.set(eph.publicKey, 0);
  out.set(boxed, 32);
  return out;
}

/** inverse, for tests */
export function openSealedBox(sealed: Uint8Array, pk: Uint8Array, sk: Uint8Array): Uint8Array | null {
  const epk = sealed.slice(0, 32);
  const nonceIn = new Uint8Array(64);
  nonceIn.set(epk, 0);
  nonceIn.set(pk, 32);
  return nacl.box.open(sealed.slice(32), blake2b(nonceIn, undefined, 24), epk, sk);
}

