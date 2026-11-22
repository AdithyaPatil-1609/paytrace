/**
 * POST /api/ingest/sms: one real bank SMS from the Android companion app,
 * {sender, text, receivedAt}. Cheap checks run first, in this order: limit per
 * network address, body size from the header, then server/ingestion/device-auth.ts
 * (signature headers, device, limit per device, body, signature, one-use number).
 * A signed phone's SMS go to its owner's own data. The phone gets 202 at once; the AI reader and
 * Neo4j run right after, because Qwen can take longer than the phone waits.
 */
import { after } from "next/server";
import { ingestLiveEvent } from "@/neo4j/live";
import { deviceById, markDeviceSeen } from "@/neo4j/devices";
import { identifySmsSender } from "@/server/ingestion/device-auth";
import { smsProvenance } from "@/server/ingestion/trust";
import { checkSmsBody, processSmsWithRetry } from "@/server/ingestion/sms-message";
import { SMS_INGEST_LIMITS } from "@/server/payments/rules";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";

const fail = (status: number, error: string) => {
  // Status and our own fixed reason only: never the sender, the text or the code.
  console.info(`ingest/sms: refused ${status} (${error})`);
  return Response.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
};

/** Runs work after the answer is sent; outside a Next request (tests, scripts) it simply starts it. */
function afterResponse(work: () => Promise<unknown>) {
  try {
    after(work);
  } catch {
    void work();
  }
}

/** A browser visit gets a clear answer instead of an empty 405 that phones offer as a download. */
export function GET() {
  return Response.json(
    { ok: false, error: "This address only accepts messages from the Paytrace phone app or iPhone Shortcut (POST)." },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const byAddress = takeHit("ingest", clientKey(request), LIMITS.sms);
  if (!byAddress.ok) return tooMany(byAddress.retryAfter);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > SMS_INGEST_LIMITS.maxBodyBytes) return fail(413, "Message too large");

  const sender = await identifySmsSender(request, deviceById);
  if (!sender.ok) return sender.status === 429 ? tooMany(sender.retryAfter ?? 60) : fail(sender.status, sender.error);

  let body: unknown;
  try {
    body = JSON.parse(sender.raw);
  } catch {
    return fail(400, "Send JSON");
  }
  const checked = checkSmsBody(body);
  if (!checked.ok) return fail(400, checked.error);

  const { profile, deviceId } = sender;
  if (!profile) return fail(503, "Live storage is disabled");

  console.info("ingest/sms: accepted, reading in the background");
  afterResponse(async () => {
    if (deviceId) await markDeviceSeen(deviceId).catch(() => undefined);
    // Trust follows how the request was authenticated, decided here on the server.
    const provenance = smsProvenance(deviceId ? "signed_device" : "legacy_code");
    await processSmsWithRetry(profile, checked.message, { store: (owner, event) => ingestLiveEvent(owner, event, undefined, provenance) });
  });
  return Response.json({ ok: true, accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
