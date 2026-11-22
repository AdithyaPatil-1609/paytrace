import { gmailDateFilter, type GmailHistoryDays } from "./gmail-history";
import { claimSync, finishSync, recordSyncProgress, renewSyncLease } from "@/neo4j/accounts";
import { ingestLiveEvent, ignoreSubscriptionCandidates } from "@/neo4j/live";
import { isSensitiveFinancialEmail, normalizeReceiptText, parseFinancialEmail } from "@/server/ingestion/email";
import { gmailPaymentQuery, isAllowedSender, parseAllowedDomains } from "@/server/ingestion/gmail-filter";
import { hasNonzeroReportedTotal, hasZeroReportedTotal, hasSubscriptionConfirmationSubject, isMarketingSubject } from "@/server/ingestion/subscription-email";
import { merchantKey, type PaymentEvent } from "@/server/ingestion/event";
import { semanticEmailCandidate } from "@/server/ingestion/semantic-email";
import { exchangeToken, GoogleTokenError } from "./google";
import { AccountError, type AccountErrorCode } from "./errors";
import { GMAIL_SYNC_LIMITS } from "@/server/payments/rules";
import { senderAuthentication } from "@/server/ingestion/dkim";
import { emailProvenance } from "@/server/ingestion/trust";

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
export function parseGmailReceipt(input:{id:string;from:string;subject:string;date:string;payload:Part;labelIds?:string[]},domains:string[]):{event:PaymentEvent|null;reason:"sender"|"sensitive"|"marketing"|"unsupported"|"subscription"|"parsed"} {
  if(!isAllowedSender(input.from,domains))return {event:null,reason:"sender"};
  if(isMarketingSubject(input.subject))return {event:null,reason:"marketing"};
  const texts=emailTextVariants(input.payload);
  if(!texts.length)texts.push("");
  const messageText=texts.map(text=>normalizeReceiptText(`${input.subject}\n${text}`));
  if(messageText.some(text=>isSensitiveFinancialEmail(input.subject,text)))return {event:null,reason:"sensitive"};
  const events=texts.map(body=>parseFinancialEmail({id:input.id,from:input.from,subject:input.subject,date:input.date,body},domains)).filter((event):event is PaymentEvent=>event!==null);
  // A zero-total receipt in either MIME part must never become a posted debit.
  const hasZero=messageText.some(hasZeroReportedTotal);
  if(hasZero&&messageText.some(hasNonzeroReportedTotal))return {event:null,reason:"unsupported"};
  const eligible=events.filter(event=>!hasZero||event.kind!=="debit_posted");
  const precise=eligible.filter(event=>event.kind!=="subscription_candidate");
  const safe=precise.length?precise:eligible;
  const registration=safe.find(event=>event.kind==="subscription_registered");
  if(registration&&messageText.some(hasNonzeroReportedTotal))return {event:null,reason:"unsupported"};
  const event=registration??safe[0]??null;
  if(input.labelIds?.includes("CATEGORY_PROMOTIONS")&&(!event||event.kind==="subscription_candidate"&&!hasSubscriptionConfirmationSubject(input.subject)))return {event:null,reason:"marketing"};
  // Conflicting parsed representations are ambiguous, not two payments.
  if(event&&safe.some(other=>other.kind!==event.kind||other.amountPaise!==event.amountPaise||other.merchant!==event.merchant||(["subscription_renewal","debit_scheduled"].includes(event.kind)&&(other.renewalDate!==event.renewalDate||other.renewalFrequency!==event.renewalFrequency))))return {event:null,reason:"unsupported"};
  if(event?.kind==="subscription_candidate") {
    // Missing fields in one MIME alternative must not erase explicit terms in another.
    const prices=safe.filter(e=>e.planPricePaise!==undefined);
    const frequencies=safe.filter(e=>e.renewalFrequency!==undefined);
    const dates=safe.filter(e=>e.renewalDate!==undefined);
    const {planPricePaise,renewalFrequency,renewalDate,...base}=event;
    void planPricePaise;void renewalFrequency;void renewalDate;
    return {event:{...base,...(prices.length&&prices.every(e=>e.planPricePaise===prices[0].planPricePaise)?{planPricePaise:prices[0].planPricePaise}:{}),...(frequencies.length&&frequencies.every(e=>e.renewalFrequency===frequencies[0].renewalFrequency)?{renewalFrequency:frequencies[0].renewalFrequency}:{}),...(dates.length&&dates.every(e=>e.renewalDate===dates[0].renewalDate)?{renewalDate:dates[0].renewalDate}:{})},reason:"parsed"};
  }
  return {event,reason:event?"parsed":messageText.some(text=>/\b(?:subscriptions?|memberships?|free trial|your new plan|renewal|recurring billing)\b/i.test(text))?"subscription":"unsupported"};
}

export function syncFailureCode(error: unknown, stage: "google"|"neo4j"): AccountErrorCode {
  if (error instanceof AccountError) return error.code;
  if (error instanceof GoogleTokenError) {
    const reason=error.reason.replace(/[^a-z0-9]/gi,"").toLowerCase();
    if (["invalidclient","unauthorizedclient","redirecturimismatch"].includes(reason)) return "oauth-config";
    if (["invalidgrant","insufficientpermissions","insufficientscope","accesstokenscopeinsufficient","autherror"].includes(reason) || error.status===401) return "gmail-reconnect";
    if (["dailylimitexceeded","dailyquotaexceeded"].includes(reason))return "gmail-daily-quota";
    if (["domainpolicy","orgpolicyviolation"].includes(reason))return "gmail-domain-policy";
    if (["ratelimitexceeded","userratelimitexceeded","quotaexceeded","resourceexhausted","concurrentlimitexceeded"].includes(reason) || error.status===429) return "gmail-rate-limit";
    if (["servicedisabled","accessnotconfigured","apidisabled","servicenotactivated"].includes(reason))return "gmail-api-disabled";
    if (error.status===403) return "gmail-forbidden";
    if (error.status===400) return "gmail-query";
    return "gmail-unavailable";
  }
  return stage==="neo4j"?"neo4j-unavailable":"gmail-unavailable";
}

/** Prefer specific provider reasons over broad RPC status codes. No error bodies enter logs. */
export function gmailResponseError(status:number,body:unknown) {
  const error=(body as {error?:{details?:{reason?:unknown}[];errors?:{reason?:unknown}[];status?:unknown}}|null)?.error;
  const reasons=[...(Array.isArray(error?.details)?error.details:[]),...(Array.isArray(error?.errors)?error.errors:[])].map(item=>item?.reason).filter((reason):reason is string=>typeof reason==="string");
  // A quota's specific legacy reason (for example dailyLimitExceeded) is more useful than a generic quota detail.
  const prioritized=["gmail-daily-quota","gmail-domain-policy","gmail-reconnect","gmail-api-disabled","gmail-rate-limit","oauth-config"];
  for(const code of prioritized){const reason=reasons.find(value=>syncFailureCode(new GoogleTokenError(status,value),"google")===code);if(reason)return new GoogleTokenError(status,reason);}
  return new GoogleTokenError(status,reasons[0]??(typeof error?.status==="string"?error.status:"gmail_error"));
}

/**
 * How long to wait before retrying a Gmail request that was limited. Gmail
 * says how long in a Retry-After header or in the error text ("Retry after
 * <time>"); without either, back off 2, 4, 8, 16, 32 seconds with jitter.
 * Returns null when Gmail asks for longer than one sync should wait.
 */
export function gmailRetryDelayMs(attempt:number,retryAfterHeader:string|null,body:unknown,now=Date.now(),jitter=Math.random()):number|null {
  let asked:number|undefined;
  if(retryAfterHeader!==null){asked=/^\d+$/.test(retryAfterHeader.trim())?Number(retryAfterHeader)*1000:Date.parse(retryAfterHeader)-now;}
  const message=(body as {error?:{message?:unknown}}|null)?.error?.message;
  const stated=typeof message==="string"?message.match(/retry after\s+(\S+)/i)?.[1]:undefined;
  if(stated&&Number.isFinite(Date.parse(stated)))asked=Math.max(asked??0,Date.parse(stated)-now);
  const backoff=2000*2**attempt*(0.75+jitter*0.5);
  const wait=Math.max(Number.isFinite(asked)?asked!:0,backoff);
  return wait>GMAIL_SYNC_LIMITS.maxWaitMs?null:Math.ceil(wait);
}

async function gmailGet(access:string,path:string) {
  for (let attempt=0;;attempt++) {
    const r=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{headers:{Authorization:`Bearer ${access}`},signal:AbortSignal.timeout(15000)});
    if (r.ok) return await r.json();
    const body=await r.json().catch(()=>({}));
    const error=gmailResponseError(r.status,body);
    if (attempt<GMAIL_SYNC_LIMITS.maxAttempts-1 && (syncFailureCode(error,"google")==="gmail-rate-limit" || r.status>=500)) {
      const wait=gmailRetryDelayMs(attempt,r.headers.get("retry-after"),body);
      if(wait===null)throw error;
      await new Promise(resolve=>setTimeout(resolve,wait));
      continue;
    }
    throw error;
  }
}

export async function syncAccount(sub: string, history=false,historyDays:GmailHistoryDays=365) {
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
    const after=gmailDateFilter(history,historyDays,grant.lastSync);
    // Explicit history scans always use current broad discovery, even if an old custom query omitted memberships.
    const query=gmailPaymentQuery(after,domains,history?undefined:process.env.GMAIL_ACCOUNT_QUERY);
    let accepted=0,skipped=0,scanned=0,duplicates=0,registrations=0,renewals=0,candidates=0,subscriptionSkipped=0,senderSkipped=0,marketingSkipped=0,ignored=0,page:string|undefined;
    // Explicit local AI opt-in. Bound inference time and never block sync if the model is unavailable.
    let semanticBudget=process.env.PAYTRACE_EMAIL_AI_ENABLED==="true"?12:0;
    const accessGrant={sub:grant.sub,grantId:grant.grantId,lease:grant.lease};
    // Live progress for the sign-up progress bar. Best effort: a failed write never stops the sync.
    let estimate=0,lastReport=0;
    const report=async(force=false)=>{
      if(!force&&Date.now()-lastReport<1200)return;
      lastReport=Date.now();
      try{await recordSyncProgress(grant.sub,grant.lease,{scanned,accepted,estimate:Math.max(estimate,scanned)});}catch{/* progress only */}
    };
    await report(true);
    do {
      stage="neo4j"; await renewSyncLease(grant.sub,grant.lease); stage="google";
      const params=new URLSearchParams({q:query,maxResults:"100",...(page?{pageToken:page}:{})});
      const list=await gmailGet(access,`messages?${params}`) as {messages?:{id:string}[];nextPageToken?:string;resultSizeEstimate?:number};
      if(!page)estimate=Math.max(Number(list.resultSizeEstimate)||0,list.messages?.length??0);
      else estimate=Math.max(estimate,scanned+(list.messages?.length??0));
      await report(true);
      const rejected:string[]=[];
      for (const {id} of list.messages??[]) {
        scanned++;
        await report();
        stage="google";
        let mail:{payload?:Part;internalDate?:string;labelIds?:string[]};
        // Pace reads: the per-user Gmail limit is shared with every other device reading this mailbox.
        if(scanned>1)await new Promise(resolve=>setTimeout(resolve,GMAIL_SYNC_LIMITS.pauseBetweenReadsMs));
        try { mail=await gmailGet(access,`messages/${encodeURIComponent(id)}?format=full`); }
        catch(error) { if(error instanceof GoogleTokenError && error.status===404){skipped++;continue;} throw error; }
        const timestamp=new Date(Number(mail.internalDate));
        if(!mail.payload || !mail.internalDate || !Number.isFinite(timestamp.valueOf())){skipped++;continue;}
        const payload=mail.payload;
        const header=(name:string)=>payload.headers?.find(h=>h.name.toLowerCase()===name)?.value??"";
        // An email Gmail says the From domain did not send (DKIM/DMARC) is never read for payments.
        const senderCheck=senderAuthentication(payload.headers,header("from"));
        if(senderCheck==="fail"){skipped++;senderSkipped++;continue;}
        const date=timestamp.toISOString().slice(0,10),subject=header("subject");
        let {event,reason}=parseGmailReceipt({id,from:header("from"),subject,payload,labelIds:mail.labelIds,date},domains);
        if(semanticBudget>0&&!mail.labelIds?.includes("CATEGORY_PROMOTIONS")&&["subscription","unsupported","parsed"].includes(reason)&&(!event||event.kind==="subscription_candidate"&&event.planPricePaise===undefined)){
          const text=normalizeReceiptText(`${subject}\n${emailTextVariants(payload).sort((a,b)=>b.length-a.length)[0]??""}`);
          try{
            const result=await semanticEmailCandidate({id,date,subject,text},async(messages,format)=>{
              semanticBudget--;
              const {ollamaChat}=await import("@/ai/assistant/models");
              return ollamaChat(messages,format,8000);
            });
            if(result&&(!event||merchantKey(event.merchant)===merchantKey(result.merchant))){event=event?{...event,...(result.planPricePaise===undefined?{}:{planPricePaise:result.planPricePaise}),...(!event.renewalDate&&result.renewalDate?{renewalDate:result.renewalDate}:{})}:result;reason="parsed";}
          }catch{semanticBudget=0;}
        }
        if (!event) {
          skipped++; if(reason==="subscription")subscriptionSkipped++; if(reason==="sender")senderSkipped++; if(reason==="marketing")marketingSkipped++;
          if(history&&reason!=="sender")rejected.push(id);
          continue;
        }
        if(event.kind==="subscription_registered")registrations++;
        if(event.kind==="subscription_renewal")renewals++;
        if(event.kind==="subscription_candidate")candidates++;
        stage="neo4j";
        const result=await ingestLiveEvent(grant.profile,event,accessGrant,emailProvenance(senderCheck));
        if (result.status!=="duplicate") accepted++; else duplicates++;
      }
      if(rejected.length){stage="neo4j";ignored+=await ignoreSubscriptionCandidates(grant.profile,rejected,accessGrant);}
      page=list.nextPageToken;
    } while (page);
    estimate=scanned; await report(true);
    state="ready";
    return {status:"ready",accepted,skipped,scanned,duplicates,registrations,renewals,candidates,subscriptionSkipped,senderSkipped,marketingSkipped,ignored};
  } catch (error) {
    errorCode=syncFailureCode(error,stage);
    if (errorCode==="gmail-reconnect") state="reauthorize";
    throw new AccountError(errorCode);
  } finally {
    try { await finishSync(sub,grant.lease,state,errorCode); }
    catch { if (!errorCode) throw new AccountError("neo4j-unavailable"); }
  }
}
