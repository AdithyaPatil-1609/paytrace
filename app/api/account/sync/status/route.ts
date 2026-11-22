/**
 * GET /api/account/sync/status
 * The signed-in person's Gmail sync state and live progress, for the
 * progress bar. Reading it does not count as using the session.
 */
import type { NextRequest } from "next/server";
import { accountForSession, syncProgressFor } from "@/db/neo4j/accounts";
import { SESSION } from "@/lib/accounts/security";

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const user = await accountForSession(request.cookies.get(SESSION)?.value, false);
    if (!user) return Response.json({ error: "Sign in first" }, { status: 401, headers });
    return Response.json({ status: user.syncStatus, error: user.syncError, lastSync: user.lastSync, linked: user.linked, gmailEmail: user.gmailEmail, progress: await syncProgressFor(user.sub) }, { headers });
  } catch {
    return Response.json({ error: "Account storage unavailable; retry" }, { status: 503, headers });
  }
}
