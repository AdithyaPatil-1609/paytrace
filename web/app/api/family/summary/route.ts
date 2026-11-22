/**
 * POST /api/family/summary { grantId }: the read-only Family View. Access is
 * checked against CAN_VIEW on every call (revoked or expired: 404), and only
 * the allowlisted fields in server/accounts/family.ts leave the server. There is
 * no write route for a viewer: no sync, no devices, no cancellation, no export.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { familyAccess } from "@/neo4j/family";
import { readLiveDashboard } from "@/neo4j/live";
import { familyPayments, familyTotals, type FamilySummary } from "@/server/accounts/family";
import { familyRequest, json } from "@/server/accounts/family-route";

export async function POST(request: NextRequest) {
  const req = await familyRequest(request, "summary", z.object({ grantId: z.uuid() }).strict());
  if (!req.ok) return req.response;
  try {
    const access = await familyAccess(req.user.sub, req.data.grantId);
    if (!access) return json({ ok: false, error: "You no longer have access to these payments." }, 404);
    const { summary } = await readLiveDashboard(access.ownerProfile);
    const payments = familyPayments(summary.commitments);
    const body: FamilySummary = { owner: access.owner, expiresAt: access.expiresAt, payments, totals: familyTotals(payments) };
    return json(body);
  } catch { return json({ ok: false, error: "Family View unavailable; retry" }, 503); }
}
