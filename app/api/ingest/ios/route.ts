/**
 * POST /api/ingest/ios: one bank SMS from the signed-in person's iPhone
 * Shortcut (plan card U4). iOS lets no app read SMS, so a Shortcut automation
 * posts {sender, text} with "Authorization: Bearer <personal token>". The token
 * picks the account; nothing in the body can. Same check order as the Android
 * route: limit per address, declared size, token, limit per token, then body.
 */
import { after } from "next/server";
import { createHash } from "node:crypto";
import { profileForIosToken } from "@/db/neo4j/accounts";
import { ingestLiveEvent } from "@/db/neo4j/live";
import { bearerToken, checkShortcutBody } from "@/lib/ingestion/ios-token";
import { processSmsWithRetry } from "@/lib/ingestion/sms-message";
import { SMS_INGEST_LIMITS } from "@/lib/payments/rules";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

const fail = (status: number, error: string) => {
  // Status and our own fixed reason only: never the sender, the text or the token.
  console.info(`ingest/ios: refused ${status} (${error})`);
  return Response.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
};

function afterResponse(work: () => Promise<unknown>) {
  try {
    after(work);
  } catch {
    void work();
  }
}

export function GET() {
  return Response.json(
    { ok: false, error: "This address only accepts messages from your Paytrace iPhone Shortcut (POST)." },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const byAddress = takeHit("ingest-ios", clientKey(request), LIMITS.sms);
  if (!byAddress.ok) return tooMany(byAddress.retryAfter);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > SMS_INGEST_LIMITS.maxBodyBytes) return fail(413, "Message too large");

  const token = bearerToken(request);
  if (!token) return fail(401, "Missing or malformed token");
  let profile: string | null;
  try {
    profile = await profileForIosToken(token);
  } catch {
    return fail(503, "Storage unavailable; retry");
  }
  if (!profile) return fail(401, "Unknown token");

  const device = createHash("sha256").update(token).digest("hex").slice(0, 16);
  const byToken = takeHit("ingest-ios-token", device, LIMITS.sms);
  if (!byToken.ok) return tooMany(byToken.retryAfter);

  const raw = await request.text();
  if (Buffer.byteLength(raw) > SMS_INGEST_LIMITS.maxBodyBytes) return fail(413, "Message too large");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Send JSON");
  }
  const checked = checkShortcutBody(body);
  if (!checked.ok) return fail(400, checked.error);

  console.info("ingest/ios: accepted, reading in the background");
  const owner = profile;
  afterResponse(() => processSmsWithRetry(owner, checked.message, { store: ingestLiveEvent }));
  return Response.json({ ok: true, accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
