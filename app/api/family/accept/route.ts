/** POST /api/family/accept { token, consent: true }: the signed-in viewer explicitly accepts. Creates CAN_VIEW. */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { acceptFamilyInvite, FAMILY_FAILURE_TEXT } from "@/db/neo4j/family";
import { familyRequest, json, Token } from "@/lib/accounts/family-route";

export async function POST(request: NextRequest) {
  const req = await familyRequest(request, "accept", z.object({ token: Token, consent: z.literal(true) }).strict());
  if (!req.ok) return req.response;
  try {
    const done = await acceptFamilyInvite(req.user.sub, req.data.token);
    return done.ok ? json(done) : json({ ok: false, error: FAMILY_FAILURE_TEXT[done.reason] }, done.reason === "too_many" ? 409 : 404);
  } catch { return json({ ok: false, error: "Could not accept; retry" }, 503); }
}
