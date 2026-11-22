/**
 * POST /api/devices/pair  {code, publicKey, label}
 * Called once by the Paytrace phone app. The phone sends the code shown on the
 * account page and its Android Keystore public key; it gets back its device id.
 * Strict limits per network address make guessing a code hopeless.
 */
import { pairDevice, normalizePairingCode } from "@/neo4j/devices";
import { parseDevicePublicKey } from "@/server/ingestion/signature";
import { readJsonBody } from "@/server/security/body";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";

const headers = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status, headers });

export async function POST(request: Request) {
  const hit = takeHit("pair", clientKey(request), LIMITS.pairing);
  if (!hit.ok) return tooMany(hit.retryAfter);

  const read = await readJsonBody(request, 1024);
  if (!read.ok) return fail(read.status, read.error);
  const input = (read.value ?? {}) as Record<string, unknown>;

  const code = normalizePairingCode(input.code);
  const publicKey = typeof input.publicKey === "string" ? input.publicKey : "";
  const label = typeof input.label === "string" ? input.label.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 40) || "Phone" : "Phone";
  if (!code) return fail(400, "Enter the 8-character code from your account page");
  if (!parseDevicePublicKey(publicKey)) return fail(400, "Send a P-256 public key");

  try {
    const result = await pairDevice(code, publicKey, label);
    if (!result.ok) return fail(result.reason === "invalid-code" ? 401 : 409, result.reason === "invalid-code" ? "Code is wrong or expired" : "Too many phones on this account; remove one first");
    return Response.json({ ok: true, deviceId: result.deviceId }, { status: 201, headers });
  } catch {
    return fail(503, "Pairing unavailable; retry");
  }
}
