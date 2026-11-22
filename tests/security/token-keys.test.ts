/**
 * Gmail token encryption with key versions (plan card S6): new values name
 * their key, old unversioned values still open, and after a rotation the
 * previous key still reads what it sealed. Keys here are made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { open, seal } from "../../server/accounts/security";

const OLD = "1".repeat(64), NEW = "2".repeat(64);
function env(vars: Record<string, string | undefined>) {
  Object.assign(process.env, { GOOGLE_WEB_CLIENT_ID: "id", GOOGLE_WEB_CLIENT_SECRET: "secret", PAYTRACE_APP_URL: "https://paytrace.co.in/" });
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
}

test("sealed values name their key version", () => {
  env({ PAYTRACE_AUTH_KEY: OLD, PAYTRACE_AUTH_KEY_ID: "1", PAYTRACE_AUTH_KEY_PREVIOUS: undefined, PAYTRACE_AUTH_KEY_PREVIOUS_ID: undefined });
  const sealed = seal("refresh-token", "gmail:a");
  assert.match(sealed, /^k1\./);
  assert.equal(open(sealed, "gmail:a"), "refresh-token");
  assert.throws(() => open(sealed, "gmail:b"));
});

test("values sealed before versions existed still open", () => {
  env({ PAYTRACE_AUTH_KEY: OLD, PAYTRACE_AUTH_KEY_ID: "1" });
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(OLD, "hex"), iv);
  cipher.setAAD(Buffer.from("gmail:a"));
  const data = Buffer.concat([cipher.update("legacy", "utf8"), cipher.final()]);
  const legacy = [iv, cipher.getAuthTag(), data].map(x => x.toString("base64url")).join(".");
  assert.equal(open(legacy, "gmail:a"), "legacy");
});

test("after rotation, new values use the new key and old values still open", () => {
  env({ PAYTRACE_AUTH_KEY: OLD, PAYTRACE_AUTH_KEY_ID: "1", PAYTRACE_AUTH_KEY_PREVIOUS: undefined, PAYTRACE_AUTH_KEY_PREVIOUS_ID: undefined });
  const before = seal("old-token", "gmail:a");
  env({ PAYTRACE_AUTH_KEY: NEW, PAYTRACE_AUTH_KEY_ID: "2", PAYTRACE_AUTH_KEY_PREVIOUS: OLD, PAYTRACE_AUTH_KEY_PREVIOUS_ID: "1" });
  assert.equal(open(before, "gmail:a"), "old-token");
  assert.match(seal("new-token", "gmail:a"), /^k2\./);
  env({ PAYTRACE_AUTH_KEY_PREVIOUS: undefined, PAYTRACE_AUTH_KEY_PREVIOUS_ID: undefined });
  assert.throws(() => open(before, "gmail:a"), "once the old key is removed, its values no longer open");
});
