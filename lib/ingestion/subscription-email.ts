import { digest, isDate, validateEvent, type PaymentEvent, type RenewalFrequency } from "./event";
import { reportedAmount } from "./recurring-email";

const inr = "(?:INR|Rs\\.?|₹)\\s*([\\d,]+(?:\\.\\d{1,2})?)(?![\\d.,])";
const toPaise = (value: string) => Math.round(Number(value.replaceAll(",", "")) * 100);
const readAmount = (text: string, labels: string) => text.match(new RegExp(`^\\s*(?:${labels})\\s*:?\\s*${inr}\\s*$`, "im"))?.[1];
const paidLabels = "Total(?: paid| charged)?|Amount paid|Amount charged|Grand total";
function paidAmounts(text: string) {
  return [...text.matchAll(new RegExp(`^\\s*(?:${paidLabels})\\s*:?\\s*${inr}\\s*$`, "gim"))].map(line => toPaise(line[1]));
}
export function hasZeroReportedTotal(text: string) {
  return paidAmounts(text).includes(0);
}
export function hasNonzeroReportedTotal(text:string) {
  return paidAmounts(text).some(amount=>amount>0);
}

function receiptDate(value?: string): string | undefined {
  if (!value) return;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return isDate(value) ? value : undefined;
  const match = value.match(/^([A-Za-z]+) +(\d{1,2}),? +(\d{4})$/) ?? (()=>{
    const reversed=value.match(/^(\d{1,2}) +([A-Za-z]+) +(\d{4})$/);
    return reversed ? [reversed[0],reversed[2],reversed[1],reversed[3]] : null;
  })();
  if (!match) return;
  const month = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(match[1].slice(0,3).toLowerCase()) + 1;
  if (!month) return;
  const date = `${match[3]}-${String(month).padStart(2,"0")}-${match[2].padStart(2,"0")}`;
  return isDate(date) ? date : undefined;
}

/** Explicit renewal terms are evidence of a scheduled charge, not settlement. */
export function parseSubscriptionRenewal(text: string, input: {id:string;date:string}): PaymentEvent | null {
  if (!/\b(?:subscription|membership|plan)\b/i.test(text) || !/\b(?:automatically renews?|automatically be renewed|auto[- ]renews?|will (?:automatically )?renew|renews? (?:on|for|soon)|subscription renewal|next (?:billing|renewal|charge) date)\b/i.test(text)) return null;
  if (/\b(?:subscription (?:has been |is )?cancelled|will not renew|auto[- ]renewal (?:is |has been )?(?:off|disabled|cancelled)|payment (?:failed|declined|successful|received|completed)|amount debited|paid successfully|you (?:have been|were) charged)\b/i.test(text)) return null;
  const datePattern="(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2} +[A-Za-z]+ +\\d{4}|[A-Za-z]+ +\\d{1,2},? +\\d{4})";
  const dateMatches=[...text.matchAll(new RegExp(`\\b(?:starting (?:from|on)|renews? on|renewal date|next (?:billing|renewal|payment|charge) date|next charge on|will renew on)\\s*:?\\s*(${datePattern})`,"gi"))].map(m=>receiptDate(m[1]));
  const dates=[...new Set(dateMatches.filter((d):d is string=>Boolean(d)))];
  if (dates.length!==1 || dateMatches.some(d=>!d)) return null;
  const period="(week|month|quarter|year|annum|weekly|monthly|quarterly|annually)";
  const rate=new RegExp(`${inr}\\s*(?:/\\s*|per\\s+|every\\s+|\\s+)${period}\\b`,"gi");
  const frequencyFor=(p:string):RenewalFrequency=>p.startsWith("week")?"weekly":p.startsWith("month")?"monthly":p.startsWith("quarter")?"quarterly":"annual";
  const terms=[...text.matchAll(rate)].map(m=>({amount:toPaise(m[1]),frequency:frequencyFor(m[2].toLowerCase())}));
  if (!terms.length || terms.some(t=>t.amount!==terms[0].amount||t.frequency!==terms[0].frequency)) return null;
  const namePattern="[A-Za-z0-9][A-Za-z0-9 .&*+_'@/-]{0,79}";
  let merchant=text.match(new RegExp(`^\\s*(?:Subscription|Plan|Service|Merchant(?: name)?)\\s*:\\s*(${namePattern})\\s*$`,"im"))?.[1]?.trim();
  merchant??=text.match(new RegExp(`\\byour (${namePattern}?) (?:subscription|membership) (?:automatically renews|will renew|renews)\\b`,"i"))?.[1]?.trim();
  // Product cards commonly put a service name and description above the rate.
  // Use only a short, plausible heading; do not guess a merchant from arbitrary prose.
  if (!merchant) {
    const lines=text.split(/\n/).map(line=>line.trim()).filter(Boolean);
    const rateLine=lines.findIndex(line=>new RegExp(`^${inr}\\s*(?:/\\s*|per\\s+|every\\s+)${period}\\b`,"i").test(line));
    if (rateLine>0) {
      const description=lines[rateLine-1];
      const withDetail=description.match(new RegExp(`^(${namePattern}?) with .+`,"i"))?.[1];
      const heading=lines[rateLine-2];
      if (withDetail && heading?.toLowerCase()===withDetail.toLowerCase()) merchant=heading;
      else if (withDetail) merchant=withDetail;
      // A plan line such as "Student (1 month)" sits under the product name.
      else if (/^[A-Za-z0-9][A-Za-z0-9 .&+'-]{0,39}\((?:monthly|yearly|annual|weekly|quarterly|\d+ (?:month|year|week)s?)\)$/i.test(description) && heading && new RegExp(`^${namePattern}$`).test(heading.split(":")[0].trim()) && !/\b(?:subscription renewal|renewal|billing|your|dear)\b/i.test(heading)) merchant=heading.split(":")[0].trim();
      else if (/^[A-Za-z0-9][A-Za-z0-9 .&*+_'@/-]{0,49}$/.test(description) && !/\b(?:subscription renewal|billing|amount|total|payment|your|dear|renewal)\b/i.test(description)) merchant=description;
    }
  }
  if (!merchant || /^(?:your|this|the|a|my|subscription|plan|membership)$/i.test(merchant)) return null;
  try {
    return validateEvent({source:"email",kind:"subscription_renewal",merchant,amountPaise:terms[0].amount,date:input.date,reference:null,sourceId:input.id,renewalDate:dates[0],renewalFrequency:terms[0].frequency});
  } catch { return null; }
}

/** A completed registration with an explicit zero total, never a paid debit. */
export function parseZeroCostSubscription(text: string, input: {id:string;date:string}): PaymentEvent | null {
  if (!/\b(?:subscription|free trial)\b/i.test(text)) return null;
  if (/\b(?:subscription cancel(?:led|lation)|payment (?:failed|pending|declined)|order cancel(?:led|lation)|not yet subscribed)\b/i.test(text)) return null;
  const order = text.match(/^\s*Order (?:number|ID)\s*:\s*([\w-]{3,128})\s*$/im)?.[1];
  const orderDateText = text.match(/^\s*Order date\s*:\s*([^\r\n]+)$/im)?.[1]?.trim();
  const confirmed = (order && orderDateText) || /\b(?:subscription (?:confirmed|activated|started|registered|created|successful)|(?:your )?new subscription|your new plan|trial (?:started|activated)|order (?:placed|confirmed))\b/i.test(text);
  if (!confirmed) return null;
  const totals = paidAmounts(text);
  // A conflicting nonzero paid amount prevents classifying this as zero-cost.
  if (!totals.length || totals.some(total => total !== 0)) return null;
  const planRow = text.match(new RegExp(`^\\s*([A-Za-z0-9][A-Za-z0-9 .&*_'@/-]{0,66}\\bsubscription)\\s+${inr}\\s*(?:INR)?\\s*$`, "im"));
  const labeledPlan = text.match(/^\s*(?:Subscription|Plan|Service|Merchant(?: name)?)\s*:\s*([A-Za-z0-9][A-Za-z0-9 .&*_'@/-]{0,79})\s*$/im)?.[1]?.trim();
  const merchant = planRow?.[1]?.replace(/\s+subscription$/i, "").trim() || labeledPlan;
  if (!merchant) return null;
  const listed = planRow?.[2] ?? readAmount(text,"Listed price|Plan price|Subscription price|Original price|Subtotal");
  const date = receiptDate(orderDateText) ?? input.date;
  const renewalText = text.match(/^\s*(?:Next (?:billing|renewal|payment|charge) date|Renews on|Next charge on)\s*:?\s*([^\r\n]+)$/im)?.[1]?.trim();
  const renewalDate = receiptDate(renewalText);
  try {
    return validateEvent({source:"email",kind:"subscription_registered",merchant,amountPaise:0,date,reference:order ? digest("subscription-order",order) : null,sourceId:input.id,...(listed===undefined?{}:{planPricePaise:toPaise(listed)}),...(renewalDate && renewalDate>=date?{renewalDate}:{})});
  } catch { return null; }
}

const confirmationPattern=/\b(?:membership|subscription|plan|trial|autopay|billing agreement) (?:is |has been |was )?(?:now )?(?:good to go|active|activated|confirmed|started|registered|created|renewed|ready|successful|enabled)\b/i;
export function hasSubscriptionConfirmationSubject(subject:string) {
  return confirmationPattern.test(subject) && /\b(?:membership|subscription|trial|autopay|billing agreement|monthly plan|annual plan|premium|good to go)\b/i.test(subject);
}
export function isMarketingSubject(subject:string) {
  return /\b(?:black friday|cyber monday|sale|savings|limited[- ]time|exclusive offer|early access|shop now|shop the|subscribe now|join now|sign up today|upgrade now|newsletter|marketing emails|mailing list|special offer|\d+% off)\b/i.test(subject);
}
export function isSubscriptionCancellation(text:string) {
  return /(?:^|[\n.!?])\s*(?:(?:your )?(?:subscription|membership|trial) (?:has been |is |was )?cancel(?:led|ed)|(?:your )?(?:subscription|membership|trial) will not renew|cancellation confirmed|you are not yet subscribed|auto[- ]renewal (?:is |has been )?(?:off|disabled))\b/i.test(text);
}

/** Preserve useful evidence even when a receipt does not state all billing fields. */
export function parseSubscriptionCandidate(text:string,input:{id:string;date:string;subject:string;from:string}):PaymentEvent|null {
  const subscription=/\b(?:subscriptions?|subscrib(?:ed|ing)|memberships?|free trial|auto[- ]?renew(?:al|s)?|auto[- ]?pay|recurring (?:billing|payment|charge)|next (?:billing|renewal|charge)|(?:paid|monthly|annual|yearly) plan|billing agreement)\b/i;
  if(!subscription.test(text))return null;
  if(hasZeroReportedTotal(text)&&hasNonzeroReportedTotal(text))return null;
  if(isSubscriptionCancellation(text)||/\bpayment (?:failed|declined)\b/i.test(text))return null;
  // Positive account/order evidence, not just the word "subscription" in a newsletter.
  const confirmed=/\b(?:membership|subscription|plan|trial|autopay|billing agreement) (?:is |has been |was )?(?:now )?(?:good to go|active|activated|confirmed|started|registered|created|renewed|ready|successful|enabled)\b|\b(?:you (?:have |have successfully )?(?:subscribed|joined)|you['’]ve (?:subscribed|joined)|thanks? for (?:subscribing|joining|your (?:purchase|subscription|membership))|welcome to|order (?:placed|confirmed|number|id)|payment (?:successful|received|completed)|automatically renews?|will (?:automatically )?renew|renews? on|next (?:billing|renewal|charge) (?:date|on)|subscription renewal|billing confirmation)\b/i;
  if(!confirmed.test(text))return null;
  if(isMarketingSubject(input.subject)||/\bstart your free trial\b/i.test(input.subject))return null;
  if(/\b(?:newsletter|mailing list|marketing emails|email updates)\b/i.test(text)&&!new RegExp(inr,"i").test(text)&&!/\b(?:paid plan|membership|billing|renewal|free trial)\b/i.test(text))return null;
  const name="[A-Za-z0-9][A-Za-z0-9 .&*+_'@/-]{0,79}";
  const named=input.subject.match(new RegExp(`^(?:Your\\s+)?(${name}?)\\s+(?:subscription|membership|plan|trial)\\b`,"i"))?.[1];
  const labeled=text.match(new RegExp(`^\\s*(?:Subscription|Membership|Plan|Service|Merchant(?: name)?)\\s*:\\s*(${name})\\s*$`,"im"))?.[1];
  const product=text.match(new RegExp(`^\\s*(${name}?)\\s+(?:Subscription|Membership)\\s+${inr}`,"im"))?.[1];
  const welcome=input.subject.match(new RegExp(`^Welcome to\\s+(${name})[!.]?$`,"i"))?.[1];
  const domain=input.from.match(/@([\w.-]+)>?\s*$/)?.[1];
  const youtubeMusic=domain?.toLowerCase()==="youtube.com" && /^music premium(?: student| family)?$/i.test(named??"");
  const merchant=[youtubeMusic ? "YouTube "+named : named,labeled,product,welcome,domain].map(x=>x?.trim()).find(x=>x&&!/^(?:your|this|the|a|my|new|paid|monthly|annual|premium|subscription|membership|plan|trial)$/i.test(x));
  if(!merchant)return null;
  const ratePattern=new RegExp(`${inr}\\s*(?:/\\s*|per\\s+|every\\s+|\\s+)(week|month|quarter|year|annum|weekly|monthly|quarterly|annually)\\b`,"gi");
  const rates=[...text.matchAll(ratePattern)].map(m=>({amount:toPaise(m[1]),frequency:(m[2].toLowerCase().startsWith("week")?"weekly":m[2].toLowerCase().startsWith("month")?"monthly":m[2].toLowerCase().startsWith("quarter")?"quarterly":"annual") as RenewalFrequency}));
  // Newsletter footers frequently say "subscription", "welcome" and "order".
  // Require subscription-specific confirmation or actual recurring billing evidence.
  const subjectConfirmed=hasSubscriptionConfirmationSubject(input.subject);
  const lifecycle=confirmationPattern.test(text)||/\b(?:automatically renews?|will (?:automatically )?renew|renews? on|next (?:billing|renewal|charge) (?:date|on)|subscription renewal)\b/i.test(text);
  if(!subjectConfirmed&&!lifecycle&&!product&&!(rates.length&&(labeled||named||welcome||/\b(?:subscribed|subscribing|membership|free trial|recurring billing)\b/i.test(text))))return null;
  if(!subjectConfirmed&&/\b(?:newsletter|mailing list|email preferences|email subscription|marketing emails|unsubscribe from (?:our |these )?emails)\b/i.test(text)&&!rates.length&&!product&&!labeled)return null;
  const rate=rates.length&&rates.every(r=>r.amount===rates[0].amount&&r.frequency===rates[0].frequency)?rates[0]:undefined;
  const datePattern="(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2} +[A-Za-z]+ +\\d{4}|[A-Za-z]+ +\\d{1,2},? +\\d{4})";
  const dates=[...text.matchAll(new RegExp(`\\b(?:starting (?:from|on)|renews? on|renewal date|next (?:billing|renewal|payment|charge) date|next charge on)\\s*:?\\s*(${datePattern})`,"gi"))].map(m=>receiptDate(m[1]));
  const renewalDate=dates.length&&dates[0]&&dates.every(d=>d===dates[0])?dates[0]:undefined;
  const price=rate?.amount??(rates.length?undefined:reportedAmount(text,subjectConfirmed||lifecycle));
  const frequencies = new Set<RenewalFrequency>(rates.map(r=>r.frequency));
  for (const match of text.matchAll(/\byour payment method will be charged\s+(weekly|monthly|quarterly|annually|yearly)\s+starting (?:on|from)\b/gi)) {
    const period = match[1].toLowerCase();
    frequencies.add(period === "annually" || period === "yearly" ? "annual" : period as RenewalFrequency);
  }
  const frequency=frequencies.size===1?[...frequencies][0]:undefined;
  try{return validateEvent({source:"email",kind:"subscription_candidate",merchant,amountPaise:null,date:input.date,reference:null,sourceId:input.id,...(price===undefined?{}:{planPricePaise:price}),...(frequency?{renewalFrequency:frequency}:{}),...(renewalDate?{renewalDate}:{})});}catch{return null;}
}
