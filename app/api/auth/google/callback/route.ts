import { NextRequest, NextResponse } from "next/server";
import { accountForSession, createSession, endSession, storeGmailGrant } from "@/db/neo4j/accounts";
import { identify, googleAuthorizationCode } from "@/lib/accounts/google";
import { accountConfig, cookieOptions, FLOW, hash, readFlow, SESSION, SESSION_SECONDS } from "@/lib/accounts/security";

export async function GET(request: NextRequest) {
  let origin: string;
  try { origin=accountConfig().origin; } catch { return new Response("Google sign-in is not configured",{status:503}); }
  function finish(notice: string, session?: string) {
    const response=NextResponse.redirect(`${origin}/account?notice=${notice}`,303);
    response.cookies.set(FLOW,"",cookieOptions(0));
    if (session) response.cookies.set(SESSION,session,cookieOptions(SESSION_SECONDS));
    response.headers.set("Cache-Control","no-store"); return response;
  }
  let flow;
  try { flow=readFlow(request.cookies.get(FLOW)?.value??"",request.nextUrl.searchParams.get("state")??""); }
  catch { return finish("oauth-expired"); }
  try {
    const raw=request.cookies.get(SESSION)?.value;
    if (flow.mode==="link") {
      if (!raw || hash(raw)!==flow.sessionHash || (await accountForSession(raw))?.sub!==flow.sub) return finish("wrong-account");
    }
    const code=request.nextUrl.searchParams.get("code");
    const providerError=request.nextUrl.searchParams.get("error");
    if (providerError) return finish(providerError==="access_denied"?"declined":providerError==="redirect_uri_mismatch"?"oauth-config":"google-denied");
    if (!code) return finish("oauth-expired");
    let user;
    try { user=await identify(flow,code); } catch(error) { return finish(googleAuthorizationCode(error)); }
    if (flow.mode==="login") {
      const session=await createSession({sub:user.sub,email:user.email,name:user.name});
      if (raw) await endSession(raw);
      return finish("signed-in",session);
    }
    if (!user.refreshToken) return finish("permission-required");
    // Re-check the current session after the identity exchange.
    if ((await accountForSession(raw))?.sub!==user.sub) return finish("wrong-account");
    await storeGmailGrant(user.sub,user.refreshToken);
    return finish("linked");
  } catch { return finish("neo4j-unavailable"); }
}
