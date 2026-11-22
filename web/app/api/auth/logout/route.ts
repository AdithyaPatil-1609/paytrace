/**
 * POST /api/auth/logout: ends this session, or with scope=all every session
 * of the person on every device. The cookie is cleared either way.
 */
import { NextRequest, NextResponse } from "next/server";
import { accountForSession, endAllSessions, endSession } from "@/neo4j/accounts";
import { accountConfig, cookieOptions, sameOrigin, SESSION } from "@/server/accounts/security";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";

export async function POST(request: NextRequest) {
  const hit = takeHit("logout", clientKey(request), LIMITS.signIn);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!sameOrigin(request)) return new Response("Forbidden",{status:403});
  const raw = request.cookies.get(SESSION)?.value;
  let everywhere = false;
  try { everywhere = (await request.formData()).get("scope") === "all"; } catch { everywhere = false; }
  try {
    if (everywhere) {
      const user = await accountForSession(raw);
      if (user) await endAllSessions(user.sub);
    }
    await endSession(raw);
  } catch { return new Response("Sign-out unavailable; retry",{status:503}); }
  const response=NextResponse.redirect(`${accountConfig().origin}${everywhere?"/signin?notice=signed-out-everywhere":"/"}`,303);
  response.cookies.set(SESSION,"",cookieOptions(0)); return response;
}
