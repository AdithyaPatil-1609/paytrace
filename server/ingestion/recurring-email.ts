import { isDate, validateEvent, type PaymentEvent, type RenewalFrequency } from "./event";

const currency = "(?:INR|Rs\\.?|₹)";
const number = "([0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?![\\d.,])";
const paise = (n:string) => Math.round(Number(n.replaceAll(",", ""))*100);
const unique = <T>(values:T[]) => values.length && values.every(v=>v===values[0]) ? values[0] : undefined;
const amountLabels = "(?:install(?:l)?ment|EMI|SIP|premium|subscription|membership|plan|bill|rent|recurring payment|payment|debit|renewal|next charge|total|amount due|amount to be debited|amount payable)(?:\\s+(?:amount|price|fee|due|payable|paid|charged))?|amount(?:\\s+(?:due|paid|charged|payable|to be debited))?";

/** Extract explicit rupee values, including table labels containing the currency. */
export function reportedAmount(text:string, allowUnlabelled=false):number|undefined {
  const label = new RegExp(`^\\s*(?:${amountLabels})\\s*(?:\\(\\s*${currency}\\s*\\)\\s*[:=-]?\\s*${number}|[:=-]?\\s*${currency}\\s*${number}|[:=-]?\\s*${number}\\s*${currency})(?=\\s|$|/)`,"gim");
  const labelled=[...text.matchAll(label)].map(m=>paise(m[1]??m[2]??m[3]));
  if(labelled.length)return unique(labelled);
  if(!allowUnlabelled)return;
  // A single currency value in a genuine financial notice is usable as a reported
  // price, but competing totals, discounts and taxes are never guessed.
  if(/\b(?:discount|subtotal|tax|save|cashback|refund|up to|starting at)\b/i.test(text))return;
  return unique([...text.matchAll(new RegExp(`${currency}\\s*${number}|${number}\\s*${currency}(?![a-z])`,"gi"))].map(m=>paise(m[1]??m[2])));
}

export function explicitDate(value:string):string|undefined {
  const raw=value.trim().replace(/[,]/g,"");
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return isDate(raw)?raw:undefined;
  const numeric=raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if(numeric){const result=`${numeric[3]}-${numeric[2].padStart(2,"0")}-${numeric[1].padStart(2,"0")}`;return isDate(result)?result:undefined;}
  const words=raw.match(/^(\d{1,2})[\s/-]+([a-z]+)[\s/-]+(\d{4})$/i)??(()=>{const m=raw.match(/^([a-z]+)\s+(\d{1,2})\s+(\d{4})$/i);return m?[m[0],m[2],m[1],m[3]]:null;})();
  if(!words)return;
  const month=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(words[2].slice(0,3).toLowerCase())+1;
  const result=`${words[3]}-${String(month).padStart(2,"0")}-${words[1].padStart(2,"0")}`;
  return month&&isDate(result)?result:undefined;
}

const recurring=/\b(?:systematic investment plan|SIP|EMI|equated monthly instal(?:l)?ment|instal(?:l)?ments?|auto[- ]?pay|mandates?|recurring|(?:weekly|monthly|quarterly|annual|yearly) (?:bill|payment|rent|premium|fee)|insurance premium|policy premium)\b/i;
const scheduled=/\b(?:will be (?:automatically )?(?:debited|charged|deducted|collected)|will (?:automatically )?(?:debit|charge|deduct|collect)|scheduled (?:debit|payment|for|on)|(?:debit|payment) (?:is )?scheduled|(?:instal(?:l)?ment|EMI|SIP|debit|payment|premium|renewal|billing|charge|due) date|(?:payment|premium|instal(?:l)?ment|bill|EMI|SIP) (?:is )?due|pre[- ]debit|upcoming (?:debit|payment|instal(?:l)?ment|renewal))\b/i;
const negative=/\b(?:payment (?:failed|declined|successful|received|completed)|amount (?:has been |was )?debited|paid successfully|refund (?:issued|processed|completed)|(?:mandate|subscription|membership|SIP|policy|autopay) (?:has been |was |is )?(?:cancelled|canceled|revoked|paused)|will not be (?:debited|charged)|will not renew)\b/i;

/** A provider-independent scheduled-obligation notice, not a posted payment. */
export function parseRecurringDebit(text:string,input:{id:string;date:string;from:string;subject:string}):PaymentEvent|null {
  if(!recurring.test(text)||!scheduled.test(text)||negative.test(text))return null;
  // A bare mention of instalments in an offer is not an existing obligation.
  if(/\b(?:apply now|shop now|buy now|easy EMIs?|no.cost EMI|offer ends|subscribe now|sign up today)\b/i.test(input.subject))return null;
  const name=text.match(/^\s*(?:SIP registered under|scheme(?: name)?|fund(?: name)?|(?:loan|policy|plan|service|merchant|subscription|membership|biller|payee)(?: name)?)\s*[:=-]\s*([^\r\n]{2,80})\s*$/im)?.[1]?.trim();
  const sender=input.from.match(/^\s*"?([^<"\r\n]{2,80})"?\s*</)?.[1]?.trim();
  const domain=input.from.match(/@([\w.-]+)>?\s*$/)?.[1];
  const merchant=name||sender||domain;
  if(!merchant)return null;
  const dates=[...text.matchAll(/\b(?:instal(?:l)?ment date|EMI date|SIP date|debit date|payment date|premium date|due date|due on|scheduled (?:for|on)|next (?:payment|billing|charge|debit) date)\s*[:=-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[-/ ](?:[a-z]+|\d{1,2})[-/ ]\d{4}|[a-z]+ \d{1,2},? \d{4})/gi)].map(m=>explicitDate(m[1]));
  const renewalDate=unique(dates);
  const amount=reportedAmount(text,true);
  const frequencyMatch=text.match(/\b(weekly|monthly|quarterly|annual(?:ly)?|yearly)\s+(?:instal(?:l)?ment|debit|payment|premium|bill|SIP|EMI|rent|subscription)\b|\b(?:every|per)\s+(week|month|quarter|year)\b/i);
  const word=(frequencyMatch?.[1]??frequencyMatch?.[2])?.toLowerCase();
  const frequency:RenewalFrequency|undefined=word?.startsWith("week")?"weekly":word?.startsWith("month")?"monthly":word?.startsWith("quarter")?"quarterly":word?"annual":undefined;
  // Preserve an incomplete notice only if it has a scheduled date or an explicit
  // debit commitment. Never turn a generic bill or promotional rate into evidence.
  if(!renewalDate&&!/\bwill be (?:automatically )?(?:debited|charged|deducted|collected)\b/i.test(text)&&amount===undefined)return null;
  try{return validateEvent({source:"email",kind:amount!==undefined&&amount>0?"debit_scheduled":"subscription_candidate",merchant,amountPaise:amount!==undefined&&amount>0?amount:null,date:input.date,reference:null,sourceId:input.id,...(renewalDate?{renewalDate}:{}),...(frequency?{renewalFrequency:frequency}:{})});}catch{return null;}
}
