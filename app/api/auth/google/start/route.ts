import { NextRequest, NextResponse } from "next/server";
import { accountForSession, recordGmailConsent } from "@/db/neo4j/accounts";
import { GMAIL_CONSENT_VERSION, hasGmailConsent } from "@/lib/accounts/consent";
import { authorizationUrl, createFlow } from "@/lib/accounts/google";
import { accountConfig, cookieOptions, FLOW, sameOrigin, seal, SESSION } from "@/lib/accounts/security";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

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
    if (mode==="link" && (!raw || !user)) return NextResponse.redirect(`${accountConfig().origin}/account`,303);
    // Gmail is read only after the person agreed to the consent screen, never straight from a button.
    if (mode==="link" && !hasGmailConsent(form)) return NextResponse.redirect(`${accountConfig().origin}/consent/gmail`,303);
    if (mode==="link" && user) await recordGmailConsent(user.sub,GMAIL_CONSENT_VERSION);
    const flow=createFlow(mode,user && raw?{sub:user.sub,session:raw}:undefined);
    const response=NextResponse.redirect(authorizationUrl(flow,user?.email),303);
    response.cookies.set(FLOW,seal(JSON.stringify(flow),"oauth-flow"),cookieOptions(300));
    response.headers.set("Cache-Control","no-store");
    return response;
  } catch { return new Response("Google sign-in not configured or temporarily unavailable",{status:503}); }
}
