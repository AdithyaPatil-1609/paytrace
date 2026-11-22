/**
 * POST /api/ingest/ios: one bank SMS from the signed-in person's iPhone
 * Shortcut (plan card U4). iOS lets no app read SMS, so a Shortcut automation
 * posts {sender, text} with "Authorization: Bearer <personal token>". The token
 * picks the account; nothing in the body can. Same check order as the Android
 * route: limit per address, declared size, token, limit per token, then body.
 */
import { after } from "next/server";
import { createHash } from "node:crypto";
import { profileForIosToken } from "@/neo4j/accounts";
import { ingestLiveEvent } from "@/neo4j/live";
import { smsProvenance } from "@/server/ingestion/trust";
import { bearerToken, checkShortcutBody, describeHeader } from "@/server/ingestion/ios-token";
import { processSmsWithRetry } from "@/server/ingestion/sms-message";
import { SMS_INGEST_LIMITS } from "@/server/payments/rules";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";

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
    {
      ok: false,
      error:
        "Your Shortcut sent a GET request. In Get Contents of URL, tap › next to the URL and set Method to POST, " +
        "add the header Authorization = Bearer <your token>, and set Request Body to JSON with sender and text."
    },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const byAddress = takeHit("ingest-ios", clientKey(request), LIMITS.sms);
  if (!byAddress.ok) return tooMany(byAddress.retryAfter);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > SMS_INGEST_LIMITS.maxBodyBytes) return fail(413, "Message too large");

  if (!request.headers.get("authorization")?.trim()) {
    return fail(401, "No Authorization header. Under Headers add Key Authorization, Text Bearer <your token>.");
  }
  const token = bearerToken(request);
  if (!token) {
    // The description names only length, prefix and odd characters, never the header itself.
    return fail(401, `The Authorization header is not a Paytrace token. ${describeHeader(request)} Copy it again from Connect iPhone.`);
  }
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
  const provenance = smsProvenance("ios_token");
  afterResponse(() => processSmsWithRetry(owner, checked.message, { store: (who, event) => ingestLiveEvent(who, event, undefined, provenance) }));
  return Response.json({ ok: true, accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
