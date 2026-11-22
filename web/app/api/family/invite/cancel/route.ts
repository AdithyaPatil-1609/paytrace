/** POST /api/family/invite/cancel { id }: the owner cancels an unused invite link. */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { cancelFamilyInvite } from "@/neo4j/family";
import { familyRequest, json } from "@/server/accounts/family-route";

export async function POST(request: NextRequest) {
  const req = await familyRequest(request, "cancel", z.object({ id: z.uuid() }).strict());
  if (!req.ok) return req.response;
  try { return (await cancelFamilyInvite(req.user.sub, req.data.id)) ? json({ ok: true }) : json({ ok: false, error: "Not found" }, 404); }
  catch { return json({ ok: false, error: "Could not cancel; retry" }, 503); }
}
