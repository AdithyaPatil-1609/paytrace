/**
 * POST /api/family/summary { grantId }: the read-only Family View. Access is
 * checked against CAN_VIEW on every call (revoked or expired: 404), and only
 * the allowlisted fields in server/accounts/family.ts leave the server. There is
 * no write route for a viewer: no sync, no devices, no cancellation, no export.
 * The owner's warnings come along, cut down by familyAlerts; if they cannot be
 * read, the payments still show and alertsIncomplete says some may be missing.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { familyAccess } from "@/neo4j/family";
import { readLiveDashboard } from "@/neo4j/live";
import { readGraphWarnings } from "@/neo4j/warnings";
import { familyAlerts, familyPayments, familyTotals, type FamilySummary } from "@/server/accounts/family";
import { GRAPH_WARNING_LIMITS } from "@/server/payments/rules";
import { familyRequest, json } from "@/server/accounts/family-route";

export async function POST(request: NextRequest) {
  const req = await familyRequest(request, "summary", z.object({ grantId: z.uuid() }).strict());
  if (!req.ok) return req.response;
  try {
    const access = await familyAccess(req.user.sub, req.data.grantId);
    if (!access) return json({ ok: false, error: "You no longer have access to these payments." }, 404);
    const [{ summary }, warnings] = await Promise.all([
      readLiveDashboard(access.ownerProfile),
      readGraphWarnings(access.ownerProfile, undefined, Math.max(GRAPH_WARNING_LIMITS.upcomingWindowDays, GRAPH_WARNING_LIMITS.headsUpDays)).catch(() => null)
    ]);
    const payments = familyPayments(summary.commitments);
    const body: FamilySummary = {
      owner: access.owner, expiresAt: access.expiresAt, payments, totals: familyTotals(payments),
      alerts: warnings ? familyAlerts(warnings) : [], alertsIncomplete: !warnings || warnings.incomplete
    };
    return json(body);
  } catch { return json({ ok: false, error: "Family View unavailable; retry" }, 503); }
}
