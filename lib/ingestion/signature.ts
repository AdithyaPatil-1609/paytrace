/**
 * Checks that a request really comes from a paired phone (plan card S5).
 *
 * The phone signs, with its Android Keystore P-256 key, these exact bytes:
 *   "PAYTRACE-SMS-v1\n" + deviceId + "\n" + time + "\n" + nonce + "\n" + body
 * App-usage reports use "PAYTRACE-USAGE-v1" instead, so a signature made for
 * one kind of request can never be replayed as the other.
 * and sends four headers: x-paytrace-device-id, x-paytrace-time (milliseconds
 * since 1970), x-paytrace-nonce and x-paytrace-signature (base64, DER, as
 * Android's Signature("SHA256withECDSA") makes it).
 * Signing the time, the nonce and the device together with the body means none
 * of them can be swapped, and the nonce store refuses an exact replay.
 */
import { createPublicKey, verify, type KeyObject } from "node:crypto";
import { DEVICE_LIMITS } from "@/lib/payments/rules";

export const SIGNATURE_HEADERS = {
  device: "x-paytrace-device-id",
  time: "x-paytrace-time",
  nonce: "x-paytrace-nonce",
  signature: "x-paytrace-signature"
} as const;

const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const NONCE = /^[A-Za-z0-9_-]{16,64}$/;
const TIME = /^\d{10,16}$/;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

export type SignedHeaders = { deviceId: string; time: number; nonce: string; signature: Buffer };
export type HeaderCheck = { ok: true; headers: SignedHeaders } | { ok: false; error: string };

/** True when a request carries any signature header, so it must be fully signed. */
export function looksSigned(request: Request) {
  return Object.values(SIGNATURE_HEADERS).some(name => request.headers.has(name));
}

/** Cheap checks on the headers alone, before any database call or body read. */
export function checkSignedHeaders(request: Request, now = Date.now()): HeaderCheck {
  const deviceId = request.headers.get(SIGNATURE_HEADERS.device) ?? "";
  const time = request.headers.get(SIGNATURE_HEADERS.time) ?? "";
  const nonce = request.headers.get(SIGNATURE_HEADERS.nonce) ?? "";
  const signature = request.headers.get(SIGNATURE_HEADERS.signature) ?? "";
  if (!DEVICE_ID.test(deviceId) || !TIME.test(time) || !NONCE.test(nonce)) return { ok: false, error: "Unsigned or malformed request" };
  if (signature.length < 8 || signature.length > 200 || !BASE64.test(signature)) return { ok: false, error: "Unsigned or malformed request" };
  const at = Number(time);
  if (Math.abs(now - at) > DEVICE_LIMITS.maxClockSkewMs) return { ok: false, error: "Request time is too far from the server time" };
  return { ok: true, headers: { deviceId, time: at, nonce, signature: Buffer.from(signature, "base64") } };
}

/** What a signed request is for; part of the signed bytes. */
export type SignedPurpose = "SMS" | "USAGE";

/** The exact bytes the phone signs. */
export function signedBytes(deviceId: string, time: number, nonce: string, rawBody: string, purpose: SignedPurpose = "SMS") {
  return Buffer.concat([Buffer.from(`PAYTRACE-${purpose}-v1\n${deviceId}\n${time}\n${nonce}\n`, "utf8"), Buffer.from(rawBody, "utf8")]);
}

/**
 * Reads a phone's public key (X.509 SubjectPublicKeyInfo, base64, which is
 * what Android's publicKey.encoded gives). Only P-256 keys are accepted.
 */
export function parseDevicePublicKey(base64: string): KeyObject | null {
  if (typeof base64 !== "string" || base64.length > DEVICE_LIMITS.maxPublicKeyBytes * 2 || !BASE64.test(base64)) return null;
  const der = Buffer.from(base64, "base64");
  if (der.length === 0 || der.length > DEVICE_LIMITS.maxPublicKeyBytes) return null;
  try {
    const key = createPublicKey({ key: der, format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") return null;
    return key;
  } catch {
    return null;
  }
}

/** Verifies the signature over the exact body bytes. Never throws. */
export function verifyDeviceSignature(publicKey: KeyObject, headers: SignedHeaders, rawBody: string, purpose: SignedPurpose = "SMS") {
  try {
    return verify("sha256", signedBytes(headers.deviceId, headers.time, headers.nonce, rawBody, purpose), { key: publicKey, dsaEncoding: "der" }, headers.signature);
  } catch {
    return false;
  }
}
