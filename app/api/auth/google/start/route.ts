import { NextRequest, NextResponse } from "next/server";
import { accountForSession } from "@/db/neo4j/accounts";
import { authorizationUrl, createFlow } from "@/lib/accounts/google";
import { accountConfig, cookieOptions, FLOW, sameOrigin, seal, SESSION } from "@/lib/accounts/security";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new Response("Forbidden",{status:403});
  try {
    const mode=(await request.formData()).get("mode");
    if (mode!=="login" && mode!=="link") return new Response("Invalid request",{status:400});
    const raw=request.cookies.get(SESSION)?.value;
    const user=mode==="link"?await accountForSession(raw):null;
    if (mode==="link" && (!raw || !user)) return NextResponse.redirect(`${accountConfig().origin}/account`,303);
    const flow=createFlow(mode,user && raw?{sub:user.sub,session:raw}:undefined);
    const response=NextResponse.redirect(authorizationUrl(flow,user?.email),303);
    response.cookies.set(FLOW,seal(JSON.stringify(flow),"oauth-flow"),cookieOptions(300));
    response.headers.set("Cache-Control","no-store");
    return response;
  } catch { return new Response("Google sign-in not configured or temporarily unavailable",{status:503}); }
}
