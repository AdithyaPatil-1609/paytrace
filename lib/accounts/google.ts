import { OAuth2Client } from "google-auth-library";
import { accountConfig, GMAIL_SCOPE, type Flow, equals, hash, randomToken } from "./security";

export function createFlow(mode: Flow["mode"], identity?: {sub: string; session: string}) {
  const flow: Flow = {mode,state:randomToken(),nonce:randomToken(),verifier:randomToken(),expires:Date.now()+5*60_000};
  if (mode === "link") { if (!identity) throw new Error("Sign in first"); flow.sub=identity.sub; flow.sessionHash=hash(identity.session); }
  return flow;
}
export function authorizationUrl(flow: Flow, email?: string) {
  const {clientId,redirect} = accountConfig();
  const params = new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:"code",scope:flow.mode==="link"?`openid email ${GMAIL_SCOPE}`:"openid email profile",state:flow.state,nonce:flow.nonce,code_challenge:Buffer.from(hash(flow.verifier),"hex").toString("base64url"),code_challenge_method:"S256",prompt:flow.mode==="link"?"consent":"select_account"});
  if (flow.mode==="link") { params.set("access_type","offline"); if (email) params.set("login_hint",email); }
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
export class GoogleTokenError extends Error { constructor(public readonly status: number, public readonly reason: string) { super("Google authorization failed"); } }
export async function exchangeToken(fields: Record<string,string>) {
  const {clientId,clientSecret}=accountConfig();
  const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,...fields}),signal:AbortSignal.timeout(15000)});
  const data=await res.json();
  if (!res.ok) throw new GoogleTokenError(res.status, typeof data.error==="string" ? data.error : "unknown");
  return data as {access_token:string;refresh_token?:string;id_token?:string;scope?:string};
}
export async function identify(flow: Flow, code: string) {
  const {clientId,redirect}=accountConfig();
  const token=await exchangeToken({code,grant_type:"authorization_code",redirect_uri:redirect,code_verifier:flow.verifier});
  if (!token.id_token) throw new Error("Identity missing");
  const payload=(await new OAuth2Client(clientId).verifyIdToken({idToken:token.id_token,audience:clientId})).getPayload();
  if (!payload?.sub || !payload.email || !payload.email_verified || !payload.nonce || !equals(payload.nonce,flow.nonce)) throw new Error("Unverified identity");
  if (flow.mode==="link" && (payload.sub!==flow.sub || !token.scope?.split(/\s+/).includes(GMAIL_SCOPE) || !token.refresh_token)) throw new Error("Wrong account or missing Gmail permission");
  return {sub:payload.sub,email:payload.email,name:payload.name??payload.email,refreshToken:flow.mode==="link"?token.refresh_token:undefined};
}
export async function revokeToken(token: string) {
  const result=await fetch("https://oauth2.googleapis.com/revoke",{method:"POST",body:new URLSearchParams({token}),signal:AbortSignal.timeout(10000)});
  return result.ok;
}
