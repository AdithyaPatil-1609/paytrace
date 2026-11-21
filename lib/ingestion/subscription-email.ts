import { digest, isDate, validateEvent, type PaymentEvent, type RenewalFrequency } from "./event";

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
