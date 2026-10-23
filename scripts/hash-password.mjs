#!/usr/bin/env node
// Print a console password hash for the ADMIN_PASSWORD_HASH secret.
// Reads the password from stdin (never from argv, which lands in shell history):
//   printf '%s' "$PASSWORD" | node scripts/hash-password.mjs | npx wrangler secret put ADMIN_PASSWORD_HASH
import { webcrypto as crypto } from "node:crypto";
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
if (password.length < 12) { console.error("password must be at least 12 characters"); process.exit(1); }
const ITER = 100000; // Workers' PBKDF2 ceiling, and the floor verifyPassword accepts
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITER }, key, 256);
process.stdout.write(`pbkdf2-sha256$${ITER}$${b64url(salt)}$${b64url(bits)}\n`);
