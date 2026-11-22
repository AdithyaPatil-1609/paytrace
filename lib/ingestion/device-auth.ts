/**
 * Decides who sent an SMS request, in the order of plan card S2: cheap header
 * checks first, then the device lookup and its limit, then the body (with a
 * hard size limit), then the signature over the exact body bytes, and only
 * then the one-use number. Nothing is parsed before the signature passes.
 *
 * Two ways in:
 *  - signed: a phone paired to a person's account. Its SMS go to that person's
 *    own data, so nobody else ever sees them.
 *  - legacy: the old shared pairing code (x-paytrace-device), kept only until
 *    every phone has the signing update. Set PAYTRACE_ALLOW_DEVICE_CODE=false
 *    to turn it off (plan card S11).
 */
import { createHash, type KeyObject } from "node:crypto";
import type { DeviceOwner } from "@/db/neo4j/devices";
import { authorized, liveProfile } from "@/lib/ingestion/auth";
import { claimNonce } from "@/lib/ingestion/nonce-store";
import { checkSignedHeaders, looksSigned, parseDevicePublicKey, verifyDeviceSignature, type SignedPurpose } from "@/lib/ingestion/signature";
import { DEVICE_LIMITS, SMS_INGEST_LIMITS } from "@/lib/payments/rules";
import { LIMITS, takeHit } from "@/lib/security/rate-limit";

export type DeviceLookup = (deviceId: string) => Promise<DeviceOwner | null>;
export type SmsSender =
  /** profile is null only on the legacy path when live storage is switched off. */
  | { ok: true; profile: string | null; raw: string; deviceId: string | null }
  | { ok: false; status: 400 | 401 | 409 | 413 | 429 | 503; error: string; retryAfter?: number };

type Cached = { owner: DeviceOwner | null; key: KeyObject | null; until: number };
const cache = new Map<string, Cached>();

async function findDevice(deviceId: string, lookup: DeviceLookup, now: number) {
  const hit = cache.get(deviceId);
  if (hit && hit.until > now) return hit;
  const owner = await lookup(deviceId);
  const entry = { owner, key: owner ? parseDevicePublicKey(owner.publicKey) : null, until: now + DEVICE_LIMITS.deviceCacheMs };
  cache.set(deviceId, entry);
  if (cache.size > 10_000) cache.delete(cache.keys().next().value!);
  return entry;
}

/** Called when a person unpairs phones, so this server forgets them at once. */
export function forgetDevices(deviceIds: string[]) {
  for (const id of deviceIds) cache.delete(id);
}
export function resetDeviceCache() {
  cache.clear();
}

async function readLimitedBody(request: Request, maxBytes: number = SMS_INGEST_LIMITS.maxBodyBytes) {
  const raw = await request.text();
  return Buffer.byteLength(raw) > maxBytes ? null : raw;
}

/**
 * A request signed by a paired phone, for one purpose. Signed only: the old
 * shared code is never accepted here. Same order as for SMS: headers, device,
 * limit per device, body, signature, then the one-use number.
 */
export async function identifySignedDevice(request: Request, lookup: DeviceLookup, options: { purpose: SignedPurpose; maxBodyBytes: number; bucket: string }, now = Date.now()): Promise<SmsSender> {
  if (!looksSigned(request)) return { ok: false, status: 401, error: "Unsigned or malformed request" };
  const checked = checkSignedHeaders(request, now);
  if (!checked.ok) return { ok: false, status: 401, error: checked.error };
  const { headers } = checked;

  let device: Cached;
  try {
    device = await findDevice(headers.deviceId, lookup, now);
  } catch {
    return { ok: false, status: 503, error: "Device check unavailable; retry" };
  }
  if (!device.owner || !device.key) return { ok: false, status: 401, error: "Unknown device" };

  const byDevice = takeHit(options.bucket, headers.deviceId, LIMITS.sms, now);
  if (!byDevice.ok) return { ok: false, status: 429, error: "Too many requests", retryAfter: byDevice.retryAfter };

  const raw = await readLimitedBody(request, options.maxBodyBytes);
  if (raw === null) return { ok: false, status: 413, error: "Message too large" };
  if (!verifyDeviceSignature(device.key, headers, raw, options.purpose)) return { ok: false, status: 401, error: "Bad signature" };
  // Only a correctly signed request may use up a nonce, so nobody can fill the store.
  if (!claimNonce(headers.deviceId, headers.nonce, now)) return { ok: false, status: 409, error: "Replayed request" };
  return { ok: true, profile: device.owner.profile, raw, deviceId: headers.deviceId };
}

export async function identifySmsSender(request: Request, lookup: DeviceLookup, now = Date.now()): Promise<SmsSender> {
  if (looksSigned(request)) return identifySignedDevice(request, lookup, { purpose: "SMS", maxBodyBytes: SMS_INGEST_LIMITS.maxBodyBytes, bucket: "ingest-device" }, now);

  const code = process.env.PAYTRACE_DEVICE_CODE;
  if (process.env.PAYTRACE_ALLOW_DEVICE_CODE === "false" || !authorized(request, "x-paytrace-device", code)) {
    return { ok: false, status: 401, error: "Unknown device" };
  }
  const device = createHash("sha256").update(code!).digest("hex").slice(0, 16);
  const byDevice = takeHit("ingest-device", device, LIMITS.sms, now);
  if (!byDevice.ok) return { ok: false, status: 429, error: "Too many requests", retryAfter: byDevice.retryAfter };
  const raw = await readLimitedBody(request);
  if (raw === null) return { ok: false, status: 413, error: "Message too large" };
  return { ok: true, profile: liveProfile(), raw, deviceId: null };
}
