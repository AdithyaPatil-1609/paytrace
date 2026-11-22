/** POST /api/family/revoke { grantId }: the owner removes someone's access, effective on their next request. */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { revokeFamilyGrant } from "@/db/neo4j/family";
import { familyRequest, json } from "@/lib/accounts/family-route";

export async function POST(request: NextRequest) {
  const req = await familyRequest(request, "revoke", z.object({ grantId: z.uuid() }).strict());
  if (!req.ok) return req.response;
  try { return (await revokeFamilyGrant(req.user.sub, req.data.grantId)) ? json({ ok: true }) : json({ ok: false, error: "Not found" }, 404); }
  catch { return json({ ok: false, error: "Could not revoke; retry" }, 503); }
}
