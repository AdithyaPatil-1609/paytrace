import { claimSync, finishSync, renewSyncLease } from "@/db/neo4j/accounts";
import { ingestLiveEvent } from "@/db/neo4j/live";
import { normalizeReceiptText, parseFinancialEmail } from "@/lib/ingestion/email";
import { gmailPaymentQuery, isAllowedSender, parseAllowedDomains } from "@/lib/ingestion/gmail-filter";
import { hasNonzeroReportedTotal, hasZeroReportedTotal } from "@/lib/ingestion/subscription-email";
import { isSensitive, type PaymentEvent } from "@/lib/ingestion/event";
import { exchangeToken, GoogleTokenError } from "./google";
import { AccountError, type AccountErrorCode } from "./errors";

type Part = { mimeType?:string; filename?:string; headers?:{name:string;value:string}[]; body?:{data?:string}; parts?:Part[] };
function htmlReceiptText(html:string) {
  // Text extraction only, never execute/render mail HTML or load external images.
  return html.replace(/<!--[^]*?-->/g,"").replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi,"")
    .replace(/<\/?(?:br|p|div|tr|li|h[1-6])\b[^>]*>/gi,"\n")
    .replace(/<\/?(?:td|th)\b[^>]*>/gi," ").replace(/<[^>]*>/g,"")
    .replace(/&(?:nbsp|thinsp|ensp|emsp);/gi," ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,code:string)=>{
      const value=code[0].toLowerCase()==="x"?parseInt(code.slice(1),16):Number(code);
      return Number.isInteger(value)&&value>=0&&value<=0x10ffff?String.fromCodePoint(value):" ";
    }).replace(/&amp;/gi,"&").trim();
}
export function emailTextVariants(part: Part): string[] {
  const find=(item:Part,mime:string):string[] => item.filename?[]:[ ...(item.mimeType===mime && item.body?.data?[Buffer.from(item.body.data,"base64url").toString("utf8")]:[]),...(item.parts??[]).flatMap(p=>find(p,mime)) ];
  const plain=find(part,"text/plain").join("\n");
  const html=htmlReceiptText(find(part,"text/html").join("\n"));
  return [...new Set([plain,html].map(text=>text.slice(0,20000)).filter(text=>text.trim()))];
}
export function emailText(part:Part):string { return emailTextVariants(part)[0]??""; }

/** Each MIME alternative is parsed independently; do not double count it. */
export function parseGmailReceipt(input:{id:string;from:string;subject:string;date:string;payload:Part},domains:string[]):{event:PaymentEvent|null;reason:"sender"|"sensitive"|"unsupported"|"subscription"|"parsed"} {
  if(!isAllowedSender(input.from,domains))return {event:null,reason:"sender"};
  const texts=emailTextVariants(input.payload);
  const messageText=texts.map(text=>normalizeReceiptText(`${input.subject}\n${text}`));
  if(messageText.some(isSensitive))return {event:null,reason:"sensitive"};
  const events=texts.map(body=>parseFinancialEmail({id:input.id,from:input.from,subject:input.subject,date:input.date,body},domains)).filter((event):event is PaymentEvent=>event!==null);
  // A zero-total receipt in either MIME part must never become a posted debit.
  const hasZero=messageText.some(hasZeroReportedTotal);
  const safe=events.filter(event=>!hasZero||event.kind!=="debit_posted");
  const registration=safe.find(event=>event.kind==="subscription_registered");
  if(registration&&messageText.some(hasNonzeroReportedTotal))return {event:null,reason:"unsupported"};
  const event=registration??safe[0]??null;
  // Conflicting parsed representations are ambiguous, not two payments.
  if(event&&safe.some(other=>other.kind!==event.kind||other.amountPaise!==event.amountPaise||other.merchant!==event.merchant||(event.kind==="subscription_renewal"&&(other.renewalDate!==event.renewalDate||other.renewalFrequency!==event.renewalFrequency))))return {event:null,reason:"unsupported"};
  return {event,reason:event?"parsed":messageText.some(text=>/\b(?:subscription|free trial|your new plan)\b/i.test(text))?"subscription":"unsupported"};
}

export function syncFailureCode(error: unknown, stage: "google"|"neo4j"): AccountErrorCode {
  if (error instanceof AccountError) return error.code;
  if (error instanceof GoogleTokenError) {
    if (["invalid_client","unauthorized_client","redirect_uri_mismatch"].includes(error.reason)) return "oauth-config";
    if (["invalid_grant","insufficientPermissions","insufficient_scope","ACCESS_TOKEN_SCOPE_INSUFFICIENT"].includes(error.reason) || error.status===401) return "gmail-reconnect";
    if (["rateLimitExceeded","userRateLimitExceeded","quotaExceeded","RESOURCE_EXHAUSTED"].includes(error.reason) || error.status===429) return "gmail-rate-limit";
    if (error.status===403) return "gmail-api-disabled";
    if (error.status===400) return "gmail-query";
    return "gmail-unavailable";
  }
  return stage==="neo4j"?"neo4j-unavailable":"gmail-unavailable";
}

async function gmailGet(access:string,path:string) {
  for (let attempt=0;;attempt++) {
    const r=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{headers:{Authorization:`Bearer ${access}`},signal:AbortSignal.timeout(15000)});
    if (r.ok) return await r.json();
    const body=await r.json().catch(()=>({}));
    const reason=body?.error?.details?.find?.((d:{reason?:unknown})=>typeof d.reason==="string")?.reason ?? body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? "gmail_error";
    const error=new GoogleTokenError(r.status,typeof reason==="string"?reason:"gmail_error");
    if (attempt<2 && (syncFailureCode(error,"google")==="gmail-rate-limit" || r.status>=500)) {
      await new Promise(resolve=>setTimeout(resolve,500*2**attempt));
      continue;
    }
    throw error;
  }
}

export async function syncAccount(sub: string, history=false) {
  let domains:string[];
  try { domains=parseAllowedDomains(process.env.GMAIL_ALLOWED_DOMAINS); }
  catch { throw new AccountError("domain-config"); }
  let grant;
  try { grant=await claimSync(sub); }
  catch(error) { throw new AccountError(syncFailureCode(error,"neo4j")); }
  if (!grant) return {status:"busy-or-disconnected",accepted:0,skipped:0};
  let state:"ready"|"error"|"reauthorize"="error";
  let stage:"google"|"neo4j"="google";
  let errorCode:AccountErrorCode|undefined;
  try {
    const access=(await exchangeToken({grant_type:"refresh_token",refresh_token:grant.refreshToken})).access_token;
    if (!access) throw new Error("Missing access token");
    const after=grant.lastSync&&!history?`after:${Math.floor((Date.parse(grant.lastSync)-2*86400000)/1000)}`:"newer_than:90d";
    const query=gmailPaymentQuery(after,domains,process.env.GMAIL_ACCOUNT_QUERY);
    let accepted=0,skipped=0,scanned=0,duplicates=0,registrations=0,renewals=0,subscriptionSkipped=0,senderSkipped=0,page:string|undefined;
    do {
      stage="neo4j"; await renewSyncLease(grant.sub,grant.lease); stage="google";
      const params=new URLSearchParams({q:query,maxResults:"100",...(page?{pageToken:page}:{})});
      const list=await gmailGet(access,`messages?${params}`) as {messages?:{id:string}[];nextPageToken?:string};
      for (const {id} of list.messages??[]) {
        scanned++;
        stage="google";
        let mail:{payload?:Part;internalDate?:string};
        try { mail=await gmailGet(access,`messages/${encodeURIComponent(id)}?format=full`); }
        catch(error) { if(error instanceof GoogleTokenError && error.status===404){skipped++;continue;} throw error; }
        const timestamp=new Date(Number(mail.internalDate));
        if(!mail.payload || !mail.internalDate || !Number.isFinite(timestamp.valueOf())){skipped++;continue;}
        const payload=mail.payload;
        const header=(name:string)=>payload.headers?.find(h=>h.name.toLowerCase()===name)?.value??"";
        const {event,reason}=parseGmailReceipt({id,from:header("from"),subject:header("subject"),payload,date:timestamp.toISOString().slice(0,10)},domains);
        if (!event) { skipped++; if(reason==="subscription")subscriptionSkipped++; if(reason==="sender")senderSkipped++; continue; }
        if(event.kind==="subscription_registered")registrations++;
        if(event.kind==="subscription_renewal")renewals++;
        stage="neo4j";
        const result=await ingestLiveEvent(grant.profile,event,{sub:grant.sub,grantId:grant.grantId,lease:grant.lease});
        if (result.status!=="duplicate") accepted++; else duplicates++;
      }
      page=list.nextPageToken;
    } while (page);
    state="ready";
    return {status:"ready",accepted,skipped,scanned,duplicates,registrations,renewals,subscriptionSkipped,senderSkipped};
  } catch (error) {
    errorCode=syncFailureCode(error,stage);
    if (errorCode==="gmail-reconnect") state="reauthorize";
    throw new AccountError(errorCode);
  } finally {
    try { await finishSync(sub,grant.lease,state,errorCode); }
    catch { if (!errorCode) throw new AccountError("neo4j-unavailable"); }
  }
}
