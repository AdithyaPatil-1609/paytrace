/**
 * POST /api/ingest/sms: one real bank SMS from the Android companion app,
 * {sender, text, receivedAt}. Cheap checks run first, in this order: limit per
 * network address, body size from the header, the device code, limit per
 * device, then the body itself. The phone gets 202 at once; the AI reader and
 * Neo4j run right after, because Qwen can take longer than the phone waits.
 */
import { after } from "next/server";
import { createHash } from "node:crypto";
import { ingestLiveEvent } from "@/db/neo4j/live";
import { authorized, liveProfile } from "@/lib/ingestion/auth";
import { checkSmsBody, processSmsWithRetry } from "@/lib/ingestion/sms-message";
import { SMS_INGEST_LIMITS } from "@/lib/payments/rules";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

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
  if (declared > SMS_INGEST_LIMITS.maxBodyBytes) return fail(413, "Message too large");

  const code = process.env.PAYTRACE_DEVICE_CODE;
  if (!authorized(request, "x-paytrace-device", code)) return fail(401, "Unknown device");

  const device = createHash("sha256").update(code!).digest("hex").slice(0, 16);
  const byDevice = takeHit("ingest-device", device, LIMITS.sms);
  if (!byDevice.ok) return tooMany(byDevice.retryAfter);

  const raw = await request.text();
  if (Buffer.byteLength(raw) > SMS_INGEST_LIMITS.maxBodyBytes) return fail(413, "Message too large");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Send JSON");
  }
  const checked = checkSmsBody(body);
  if (!checked.ok) return fail(400, checked.error);

  const profile = liveProfile();
  if (!profile) return fail(503, "Live storage is disabled");

  console.info("ingest/sms: accepted, reading in the background");
  afterResponse(() => processSmsWithRetry(profile, checked.message, { store: ingestLiveEvent }));
  return Response.json({ ok: true, accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
