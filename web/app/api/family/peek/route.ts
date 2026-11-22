/** POST /api/family/peek { token }: what the signed-in viewer is being asked to accept. Read-only. */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { FAMILY_FAILURE_TEXT, peekFamilyInvite } from "@/neo4j/family";
import { familyRequest, json, Token } from "@/server/accounts/family-route";

export async function POST(request: NextRequest) {
  const req = await familyRequest(request, "peek", z.object({ token: Token }).strict());
  if (!req.ok) return req.response;
  try {
    const seen = await peekFamilyInvite(req.user.sub, req.data.token);
    return seen.ok ? json(seen) : json({ ok: false, error: FAMILY_FAILURE_TEXT[seen.reason] }, 404);
  } catch { return json({ ok: false, error: "Could not check the invite; retry" }, 503); }
}
