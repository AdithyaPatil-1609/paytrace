import { claimSync, finishSync } from "@/db/neo4j/accounts";
import { ingestLiveEvent } from "@/db/neo4j/live";
import { parseFinancialEmail } from "@/lib/ingestion/email";
import { gmailPaymentQuery, parseAllowedDomains } from "@/lib/ingestion/gmail-filter";
import { exchangeToken, GoogleTokenError } from "./google";

type Part = { mimeType?:string; headers?:{name:string;value:string}[]; body?:{data?:string}; parts?:Part[] };
export function emailText(part: Part): string {
  const find=(item:Part,mime:string):string[] => [ ...(item.mimeType===mime && item.body?.data?[Buffer.from(item.body.data,"base64url").toString("utf8")]:[]),...(item.parts??[]).flatMap(p=>find(p,mime)) ];
  const plain=find(part,"text/plain").join("\n");
  if (plain) return plain.slice(0,20000);
  // Text extraction only, never execute/render mail HTML or load external images.
  return find(part,"text/html").join("\n").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,"").replace(/<\/?(?:br|p|div|tr|li)\b[^>]*>/gi,"\n").replace(/<\/?td\b[^>]*>/gi," ").replace(/<[^>]*>/g,"").replace(/&(?:nbsp|#160);/gi," ").replace(/&(?:#8377|#x20b9);/gi,"₹").replace(/&amp;/gi,"&").trim().slice(0,20000);
}

export async function syncAccount(sub: string) {
  const domains=parseAllowedDomains(process.env.GMAIL_ALLOWED_DOMAINS);
  const grant=await claimSync(sub);
  if (!grant) return {status:"busy-or-disconnected",accepted:0,skipped:0};
  let state:"ready"|"error"|"reauthorize"="error";
  try {
    const access=(await exchangeToken({grant_type:"refresh_token",refresh_token:grant.refreshToken})).access_token;
    if (!access) throw new Error("Missing access token");
    const after=grant.lastSync?`after:${Math.floor((Date.parse(grant.lastSync)-2*86400000)/1000)}`:"newer_than:90d";
    const query=gmailPaymentQuery(after,domains,process.env.GMAIL_ACCOUNT_QUERY);
    async function get(path:string) {
      const r=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{headers:{Authorization:`Bearer ${access}`},signal:AbortSignal.timeout(15000)});
      if (!r.ok) throw new GoogleTokenError(r.status,r.status===401?"invalid_grant":"gmail_error");
      return await r.json();
    }
    let accepted=0,skipped=0,page:string|undefined;
    do {
      const params=new URLSearchParams({q:query,maxResults:"100",...(page?{pageToken:page}:{})});
      const list=await get(`messages?${params}`) as {messages?:{id:string}[];nextPageToken?:string};
      for (const {id} of list.messages??[]) {
        const mail=await get(`messages/${encodeURIComponent(id)}?format=full`) as {payload:Part;internalDate:string};
        const header=(name:string)=>mail.payload.headers?.find(h=>h.name.toLowerCase()===name)?.value??"";
        const event=parseFinancialEmail({id,from:header("from"),subject:header("subject"),body:emailText(mail.payload),date:new Date(Number(mail.internalDate)).toISOString().slice(0,10)},domains);
        if (!event) { skipped++; continue; }
        const result=await ingestLiveEvent(grant.profile,event,{sub:grant.sub,grantId:grant.grantId,lease:grant.lease});
        if (result.status!=="duplicate") accepted++;
      }
      page=list.nextPageToken;
    } while (page);
    state="ready";
    return {status:"ready",accepted,skipped};
  } catch (error) {
    if (error instanceof GoogleTokenError && error.reason==="invalid_grant") state="reauthorize";
    throw new Error(state==="reauthorize"?"Reconnect Gmail to continue":"Sync failed; retry later");
  } finally { await finishSync(sub,grant.lease,state); }
}
