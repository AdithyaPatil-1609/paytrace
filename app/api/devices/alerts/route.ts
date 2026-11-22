/**
 * POST /api/devices/alerts: the heads-up list for the paired phone's owner, so
 * the Android app can show a notification before money leaves:
 *  - a debit due in the next 3 days (from a bank pre-debit notice or the payment cycle)
 *  - a higher price announced but not charged yet (price-change, pre-debit or renewal notice)
 * Only a signed phone may ask, with the same checks as an SMS (lib/ingestion/device-auth.ts).
 * The body is any small JSON (for example {"since":"2026-11-22"}); it is signed, never trusted for who you are.
 */
import { deviceById } from "@/db/neo4j/devices";
import { readGraphWarnings } from "@/db/neo4j/warnings";
import { identifySmsSender } from "@/lib/ingestion/device-auth";
import { GRAPH_WARNING_LIMITS } from "@/lib/payments/rules";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const byAddress = takeHit("device-alerts", clientKey(request), LIMITS.graph);
  if (!byAddress.ok) return tooMany(byAddress.retryAfter);
  const sender = await identifySmsSender(request, deviceById);
  if (!sender.ok) return Response.json({ ok: false, error: sender.error }, { status: sender.status, headers });
  // The old shared pairing code has no owner: alerts are personal, so only a signed phone gets them.
  if (!sender.deviceId || !sender.profile) return Response.json({ ok: false, error: "Pair this phone again to get alerts" }, { status: 401, headers });
  try {
    const warnings = await readGraphWarnings(sender.profile, undefined, Math.max(GRAPH_WARNING_LIMITS.upcomingWindowDays, GRAPH_WARNING_LIMITS.headsUpDays));
    return Response.json({ ok: true, asOf: warnings.asOf, alerts: warnings.headsUp }, { headers });
  } catch {
    return Response.json({ ok: false, error: "Alerts unavailable; retry later" }, { status: 503, headers });
  }
}
