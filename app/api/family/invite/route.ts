/**
 * POST /api/family/invite: the signed-in owner makes a one-time link to share
 * themselves. The token sits after "#" so it never reaches server logs; only
 * its hash is stored. No email is looked up, so this cannot reveal who has an account.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createFamilyInvite } from "@/db/neo4j/family";
import { accountConfig } from "@/lib/accounts/security";
import { familyRequest, json } from "@/lib/accounts/family-route";

export async function POST(request: NextRequest) {
  const req = await familyRequest(request, "invite", z.object({}).strict());
  if (!req.ok) return req.response;
  try {
    const made = await createFamilyInvite(req.user.sub);
    if (!made.ok) return json({ ok: false, error: made.reason === "too_many" ? "You already have the most open invite links allowed. Cancel one first." : "Could not create an invite" }, made.reason === "too_many" ? 409 : 400);
    return json({ ok: true, id: made.id, expiresAt: made.expiresAt, link: `${accountConfig().origin}/family/accept#invite=${made.token}` });
  } catch { return json({ ok: false, error: "Could not create an invite; retry" }, 503); }
}
