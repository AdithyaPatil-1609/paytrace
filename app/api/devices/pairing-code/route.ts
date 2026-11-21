/**
 * POST /api/devices/pairing-code: a signed-in person asks for a one-time code
 * to pair their phone. The code lasts 10 minutes and works once.
 */
import type { NextRequest } from "next/server";
import { createPairingCode } from "@/db/neo4j/devices";
import { requireUser } from "@/lib/accounts/require-user";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const hit = takeHit("pairing-code", clientKey(request), LIMITS.pairing);
  if (!hit.ok) return tooMany(hit.retryAfter);
  const signedIn = await requireUser(request);
  if (!signedIn.ok) return signedIn.response;
  try {
    return Response.json(await createPairingCode(signedIn.user.sub), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not create a pairing code; retry" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
