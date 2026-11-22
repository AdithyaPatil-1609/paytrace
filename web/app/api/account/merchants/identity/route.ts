import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/accounts/require-user";
import { readJsonBody } from "@/server/security/body";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";
import { decideMerchantIdentity } from "@/neo4j/merchant-identities";

const Body = z.object({ id: z.string().regex(/^[0-9a-f]{64}$/), decision: z.enum(["confirmed", "rejected"]) }).strict();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const hit = takeHit("merchant-identity", clientKey(request), LIMITS.graph);
  if (!hit.ok) return tooMany(hit.retryAfter);
  const signedIn = await requireUser(request);
  if (!signedIn.ok) return signedIn.response;
  const read = await readJsonBody(request, 1024);
  if (!read.ok) return json({ error: read.error }, read.status);
  const parsed = Body.safeParse(read.value);
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  try {
    const saved = await decideMerchantIdentity(signedIn.user.profile, parsed.data.id, parsed.data.decision);
    return saved ? json({ ok: true }) : json({ error: "Suggestion not found" }, 404);
  } catch { return json({ error: "Could not save; retry" }, 503); }
}
