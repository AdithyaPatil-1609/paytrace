import { NextRequest, NextResponse } from "next/server";
import { accountForSession, recordGmailConsent } from "@/neo4j/accounts";
import { GMAIL_CONSENT_VERSION, hasGmailConsent } from "@/server/accounts/consent";
import { authorizationUrl, createFlow } from "@/server/accounts/google";
import { accountConfig, cleanFullName, cookieOptions, FLOW, sameOrigin, seal, SESSION } from "@/server/accounts/security";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";

export async function POST(request: NextRequest) {
  const hit = takeHit("sign-in", clientKey(request), LIMITS.signIn);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!sameOrigin(request)) return new Response("Forbidden",{status:403});
  try {
    const form=await request.formData();
    const mode=form.get("mode");
    if (mode!=="login" && mode!=="link") return new Response("Invalid request",{status:400});
    const raw=request.cookies.get(SESSION)?.value;
    const user=mode==="link"?await accountForSession(raw):null;
    // Sign-up returns to /signup; it may carry the typed full name (login) or ask for a different Gmail (link).
    const signup=form.get("next")==="signup";
    const other=mode==="link" && form.get("other")==="yes";
    let fullName:string|undefined;
    if (mode==="login" && signup) {
      const typed=cleanFullName(form.get("fullName"));
      if (!typed) return NextResponse.redirect(`${accountConfig().origin}/signup?notice=bad-name`,303);
      fullName=typed;
    }
    if (mode==="link" && (!raw || !user)) return NextResponse.redirect(`${accountConfig().origin}/${signup?"signup":"account"}`,303);
    // Gmail is read only after the person agreed to the consent screen, never straight from a button.
    if (mode==="link" && !hasGmailConsent(form)) return NextResponse.redirect(`${accountConfig().origin}/${signup?"signup?notice=gmail-consent-needed":"consent/gmail"}`,303);
    if (mode==="link" && user) await recordGmailConsent(user.sub,GMAIL_CONSENT_VERSION);
    const flow=createFlow(mode,user && raw?{sub:user.sub,session:raw}:undefined,{signup,fullName,other});
    const response=NextResponse.redirect(authorizationUrl(flow,user?.email),303);
    response.cookies.set(FLOW,seal(JSON.stringify(flow),"oauth-flow"),cookieOptions(300));
    response.headers.set("Cache-Control","no-store");
    return response;
  } catch { return new Response("Google sign-in not configured or temporarily unavailable",{status:503}); }
}
