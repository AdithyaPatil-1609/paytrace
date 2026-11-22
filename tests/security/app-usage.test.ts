/**
 * App-usage reports (card M3): signed with their own purpose, so an SMS
 * signature can never be replayed as a usage report (or the other way round),
 * and app names match only the person's own subscriptions with that name.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { identifySignedDevice, identifySmsSender, resetDeviceCache } from "../../lib/ingestion/device-auth";
import { resetNonces } from "../../lib/ingestion/nonce-store";
import { signedBytes, type SignedPurpose } from "../../lib/ingestion/signature";
import { resetRateLimits } from "../../lib/security/rate-limit";
import { usageMatches } from "../../db/neo4j/app-usage";

const phone = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKey = phone.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const deviceId = "dev_" + randomBytes(16).toString("hex");
const lookup = async (id: string) => (id === deviceId ? { deviceId, sub: "sub-a", profile: "google-aaaa", publicKey } : null);
const usage = { purpose: "USAGE" as const, maxBodyBytes: 8192, bucket: "usage-device" };

function signed(body: string, purpose: SignedPurpose) {
  const time = Date.now(), nonce = randomBytes(16).toString("base64url");
  const signature = sign("sha256", signedBytes(deviceId, time, nonce, body, purpose), { key: phone.privateKey, dsaEncoding: "der" }).toString("base64");
  return new Request("http://localhost/api/ingest/usage", { method: "POST", body, headers: { "content-type": "application/json", "x-paytrace-device-id": deviceId, "x-paytrace-time": String(time), "x-paytrace-nonce": nonce, "x-paytrace-signature": signature } });
}
const body = JSON.stringify({ windowStart: "2026-06-01", apps: [{ package: "com.spotify.music", merchant: "SPOTIFY", lastUsed: "2026-09-01", minutes30d: 3 }] });

test.beforeEach(() => { resetNonces(); resetDeviceCache(); resetRateLimits(); });

test("a usage report signed for USAGE is accepted for its owner", async () => {
  const result = await identifySignedDevice(signed(body, "USAGE"), lookup, usage);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.profile, "google-aaaa");
});

test("an SMS signature is refused on the usage address, and a usage signature on the SMS address", async () => {
  const asSms = await identifySignedDevice(signed(body, "SMS"), lookup, usage);
  assert.equal(asSms.ok ? 0 : asSms.status, 401);
  const asUsage = await identifySmsSender(signed(body, "USAGE"), lookup);
  assert.equal(asUsage.ok ? 0 : asUsage.status, 401);
});

test("the usage address never accepts the old shared code", async () => {
  process.env.PAYTRACE_DEVICE_CODE = "x".repeat(64);
  const request = new Request("http://localhost/api/ingest/usage", { method: "POST", body, headers: { "x-paytrace-device": "x".repeat(64) } });
  const result = await identifySignedDevice(request, lookup, usage);
  assert.equal(result.ok ? 0 : result.status, 401);
  delete process.env.PAYTRACE_DEVICE_CODE;
});

test("app names match subscriptions by name, never on short fragments", () => {
  assert.equal(usageMatches("YOUTUBE MUSIC PREMIUM STUDENT", "YOUTUBE MUSIC"), true);
  assert.equal(usageMatches("NETFLIX", "Netflix"), true);
  assert.equal(usageMatches("SPOTIFY", "NETFLIX"), false);
  assert.equal(usageMatches("JIO", "JIOHOTSTAR"), false);
  assert.equal(usageMatches("PRIME", "PRIME VIDEO"), true);
  assert.equal(usageMatches("A1", "A1"), false);
  assert.equal(usageMatches("JIOHOTSTAR", "HOTSTAR"), true);
  assert.equal(usageMatches("DISNEY+ HOTSTAR", "HOTSTAR"), true);
  assert.equal(usageMatches("MYZEE5", "ZEE5"), false);
});
