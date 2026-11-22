import { NextRequest, NextResponse } from "next/server";
import { accountForSession, createSession, endSession, setFullName, storeGmailGrant } from "@/neo4j/accounts";
import { identify, googleAuthorizationCode } from "@/server/accounts/google";
import { accountConfig, cookieOptions, FLOW, hash, readFlow, SESSION, SESSION_SECONDS } from "@/server/accounts/security";

export async function GET(request: NextRequest) {
  let origin: string;
  try { origin=accountConfig().origin; } catch { return new Response("Google sign-in is not configured",{status:503}); }
  let page="account";
  function finish(notice: string, session?: string) {
    const response=NextResponse.redirect(`${origin}/${page}?notice=${notice}`,303);
    response.cookies.set(FLOW,"",cookieOptions(0));
    if (session) response.cookies.set(SESSION,session,cookieOptions(SESSION_SECONDS));
    response.headers.set("Cache-Control","no-store"); return response;
  }
  let flow;
  try { flow=readFlow(request.cookies.get(FLOW)?.value??"",request.nextUrl.searchParams.get("state")??""); }
  catch { return finish("oauth-expired"); }
  if (flow.signup) page="signup";
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
      if (flow.fullName) await setFullName(user.sub,flow.fullName);
      if (raw) await endSession(raw);
      return finish("signed-in",session);
    }
    if (!user.refreshToken) return finish("permission-required");
    // Re-check the current session after the identity exchange. For "add another Gmail"
    // the mailbox belongs to a different Google account, so the session must match the flow's owner.
    const owner=flow.other?flow.sub:user.sub;
    if (!owner || (await accountForSession(raw))?.sub!==owner) return finish("wrong-account");
    await storeGmailGrant(owner,user.refreshToken,flow.other?user.email:null);
    return finish("linked");
  } catch { return finish("neo4j-unavailable"); }
}
