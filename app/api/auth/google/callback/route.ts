import { NextRequest, NextResponse } from "next/server";
import { accountForSession, createSession, endSession, storeGmailGrant } from "@/db/neo4j/accounts";
import { identify } from "@/lib/accounts/google";
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
  try {
    const flow=readFlow(request.cookies.get(FLOW)?.value??"",request.nextUrl.searchParams.get("state")??"");
    const raw=request.cookies.get(SESSION)?.value;
    if (flow.mode==="link") {
      if (!raw || hash(raw)!==flow.sessionHash || (await accountForSession(raw))?.sub!==flow.sub) return finish("wrong-account");
    }
    const code=request.nextUrl.searchParams.get("code");
    if (request.nextUrl.searchParams.has("error") || !code) return finish("declined");
    const user=await identify(flow,code);
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
  } catch { return finish("authorization-error"); }
}
