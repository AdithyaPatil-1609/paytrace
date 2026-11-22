/** POST /api/family/leave { grantId }: the viewer stops viewing someone's payments. */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { leaveFamilyGrant } from "@/neo4j/family";
import { familyRequest, json } from "@/server/accounts/family-route";

export async function POST(request: NextRequest) {
  const req = await familyRequest(request, "leave", z.object({ grantId: z.uuid() }).strict());
  if (!req.ok) return req.response;
  try { return (await leaveFamilyGrant(req.user.sub, req.data.grantId)) ? json({ ok: true }) : json({ ok: false, error: "Not found" }, 404); }
  catch { return json({ ok: false, error: "Could not update; retry" }, 503); }
}
