/**
 * POST /api/account/delete  (form field confirm=DELETE)
 * Deletes all of the signed-in person's data, revokes Gmail access at Google,
 * forgets their phones and clears the session cookie.
 */
import { NextResponse, type NextRequest } from "next/server";
import { deleteAgentMirror, deleteAllUserData } from "@/neo4j/delete-user";
import { requireUser } from "@/server/accounts/require-user";
import { revokeToken } from "@/server/accounts/google";
import { accountConfig, cookieOptions, open, SESSION } from "@/server/accounts/security";
import { forgetDevices } from "@/server/ingestion/device-auth";
import { removeDevices } from "@/neo4j/devices";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";

export async function POST(request: NextRequest) {
  const hit = takeHit("account-delete", clientKey(request), LIMITS.signIn);
  if (!hit.ok) return tooMany(hit.retryAfter);
  const signedIn = await requireUser(request);
  if (!signedIn.ok) return signedIn.response;
  let confirmed = false;
  try { confirmed = (await request.formData()).get("confirm") === "DELETE"; } catch { confirmed = false; }
  if (!confirmed) return new Response("Type DELETE to confirm", { status: 400 });

  const { sub, profile } = signedIn.user;
  try {
    // The Aura Agent mirror first, if this person is the one mirrored there: if
    // that database is down, nothing else has been deleted yet and a retry is clean.
    await deleteAgentMirror(profile);
    forgetDevices(await removeDevices(sub));
    const { token } = await deleteAllUserData(sub, profile);
    // Best effort: our copy is already gone; also tell Google to drop the grant.
    if (token) { try { await revokeToken(open(token, `gmail:${sub}`)); } catch { /* user can revoke in their Google account */ } }
  } catch {
    return new Response("Could not delete your data; retry, and the rest will be deleted.", { status: 503 });
  }
  const response = NextResponse.redirect(`${accountConfig().origin}/signin?notice=data-deleted`, 303);
  response.cookies.set(SESSION, "", cookieOptions(0));
  return response;
}
