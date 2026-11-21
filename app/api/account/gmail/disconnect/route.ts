import { NextRequest, NextResponse } from "next/server";
import { accountForSession, removeGmailGrant } from "@/db/neo4j/accounts";
import { revokeToken } from "@/lib/accounts/google";
import { accountConfig, sameOrigin, SESSION } from "@/lib/accounts/security";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const hit=takeHit("gmail-disconnect",clientKey(request),LIMITS.signIn);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!sameOrigin(request)) return new Response("Forbidden",{status:403});
  try {
    const user=await accountForSession(request.cookies.get(SESSION)?.value);
    if (!user) return new Response("Unauthorized",{status:401});
    const token=await removeGmailGrant(user.sub);
    let revoked=true;
    if (token) { try { revoked=await revokeToken(token); } catch { revoked=false; } }
    return NextResponse.redirect(`${accountConfig().origin}/account?notice=${revoked?"disconnected":"disconnected-local"}`,303);
  } catch { return new Response("Disconnect unavailable; retry",{status:503}); }
}
