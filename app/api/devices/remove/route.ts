/**
 * POST /api/devices/remove: unpairs every phone on the signed-in account.
 * Their signatures stop working at once on this server.
 */
import { NextResponse, type NextRequest } from "next/server";
import { removeDevices } from "@/db/neo4j/devices";
import { requireUser } from "@/lib/accounts/require-user";
import { accountConfig } from "@/lib/accounts/security";
import { forgetDevices } from "@/lib/ingestion/device-auth";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const hit = takeHit("devices-remove", clientKey(request), LIMITS.signIn);
  if (!hit.ok) return tooMany(hit.retryAfter);
  const signedIn = await requireUser(request);
  if (!signedIn.ok) return signedIn.response;
  try {
    forgetDevices(await removeDevices(signedIn.user.sub));
  } catch {
    return new Response("Could not remove phones; retry", { status: 503 });
  }
  return NextResponse.redirect(`${accountConfig().origin}/account?notice=phones-removed`, 303);
}
