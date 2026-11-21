/**
 * Signed phone requests (plan cards S5, S8): a good signature passes once;
 * a replay, an old time, a changed body, a wrong key or a wrong curve fail.
 * Keys are made up for each run; no real data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { identifySmsSender, resetDeviceCache } from "../../lib/ingestion/device-auth";
import { resetNonces, claimNonce } from "../../lib/ingestion/nonce-store";
import { checkSignedHeaders, parseDevicePublicKey, signedBytes } from "../../lib/ingestion/signature";
import { resetRateLimits } from "../../lib/security/rate-limit";
import { DEVICE_LIMITS } from "../../lib/payments/rules";

const phone = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKey = phone.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const deviceId = "dev_" + randomBytes(16).toString("hex");
const owner = { deviceId, sub: "sub-a", profile: "google-aaaa", publicKey };
const lookup = async (id: string) => (id === deviceId ? owner : null);

function signedRequest(body: string, opts: { time?: number; nonce?: string; key?: typeof phone.privateKey; id?: string; sentBody?: string } = {}) {
  const time = opts.time ?? Date.now();
  const nonce = opts.nonce ?? randomBytes(16).toString("base64url");
  const id = opts.id ?? deviceId;
  const signature = sign("sha256", signedBytes(id, time, nonce, body), { key: opts.key ?? phone.privateKey, dsaEncoding: "der" }).toString("base64");
  const sent = opts.sentBody ?? body;
  return new Request("http://localhost/api/ingest/sms", {
    method: "POST",
    body: sent,
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(sent)), "x-paytrace-device-id": id, "x-paytrace-time": String(time), "x-paytrace-nonce": nonce, "x-paytrace-signature": signature }
  });
}

const body = JSON.stringify({ sender: "AX-HDFCBK-S", text: "Rs 199 debited for test", receivedAt: new Date().toISOString() });

test.beforeEach(() => { resetNonces(); resetDeviceCache(); resetRateLimits(); delete process.env.PAYTRACE_DEVICE_CODE; });

test("a correctly signed request is accepted and goes to its owner's own profile", async () => {
  const result = await identifySmsSender(signedRequest(body), lookup);
  assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.profile, "google-aaaa"); assert.equal(result.raw, body); assert.equal(result.deviceId, deviceId); }
});

test("the same signed request sent twice is refused as a replay", async () => {
  const nonce = randomBytes(16).toString("base64url"), time = Date.now();
  assert.equal((await identifySmsSender(signedRequest(body, { nonce, time }), lookup)).ok, true);
  const again = await identifySmsSender(signedRequest(body, { nonce, time }), lookup);
  assert.deepEqual(again.ok ? null : again.status, 409);
});

test("a request older or newer than five minutes is refused before any lookup", async () => {
  let lookups = 0;
  const counting = async (id: string) => { lookups++; return lookup(id); };
  for (const time of [Date.now() - DEVICE_LIMITS.maxClockSkewMs - 1000, Date.now() + DEVICE_LIMITS.maxClockSkewMs + 1000]) {
    const result = await identifySmsSender(signedRequest(body, { time }), counting);
    assert.equal(result.ok ? 0 : result.status, 401);
  }
  assert.equal(lookups, 0);
});

test("a changed body fails the signature", async () => {
  const tampered = body.replace("199", "1,99,999");
  const result = await identifySmsSender(signedRequest(body, { sentBody: tampered }), lookup);
  assert.equal(result.ok ? 0 : result.status, 401);
});

test("a signature from another key fails, and does not use up the nonce", async () => {
  const thief = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const nonce = randomBytes(16).toString("base64url"), time = Date.now();
  const forged = await identifySmsSender(signedRequest(body, { key: thief.privateKey, nonce, time }), lookup);
  assert.equal(forged.ok ? 0 : forged.status, 401);
  assert.equal(claimNonce(deviceId, nonce), true, "a forged request must not burn the real phone's nonce");
});

test("an unknown device is refused", async () => {
  const result = await identifySmsSender(signedRequest(body, { id: "dev_" + "f".repeat(32) }), lookup);
  assert.equal(result.ok ? 0 : result.status, 401);
});

test("a half-signed request (some headers missing) is refused, not treated as legacy", async () => {
  process.env.PAYTRACE_DEVICE_CODE = "legacy-code";
  const request = new Request("http://localhost/api/ingest/sms", { method: "POST", body, headers: { "x-paytrace-device": "legacy-code", "x-paytrace-nonce": "abcdefghijklmnopqrstuv" } });
  const result = await identifySmsSender(request, lookup);
  assert.equal(result.ok ? 0 : result.status, 401);
});

test("the legacy shared code can be switched off", async () => {
  process.env.PAYTRACE_DEVICE_CODE = "legacy-code";
  process.env.PAYTRACE_ALLOW_DEVICE_CODE = "false";
  const request = new Request("http://localhost/api/ingest/sms", { method: "POST", body, headers: { "x-paytrace-device": "legacy-code" } });
  const result = await identifySmsSender(request, lookup);
  assert.equal(result.ok ? 0 : result.status, 401);
  delete process.env.PAYTRACE_ALLOW_DEVICE_CODE;
});

test("only P-256 public keys are accepted when pairing", () => {
  assert.ok(parseDevicePublicKey(publicKey));
  const p384 = generateKeyPairSync("ec", { namedCurve: "secp384r1" }).publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 }).publicKey.export({ format: "der", type: "spki" }).toString("base64");
  assert.equal(parseDevicePublicKey(p384), null);
  assert.equal(parseDevicePublicKey(rsa), null);
  assert.equal(parseDevicePublicKey("not a key"), null);
  assert.equal(parseDevicePublicKey("A".repeat(5000)), null);
});

test("malformed signature headers are refused", () => {
  const bad = new Request("http://localhost/x", { headers: { "x-paytrace-device-id": "short", "x-paytrace-time": "abc", "x-paytrace-nonce": "x", "x-paytrace-signature": "!!" } });
  assert.equal(checkSignedHeaders(bad).ok, false);
});
