import assert from "node:assert/strict";
import test from "node:test";
import { eventKey, matchPayment, validateEvent } from "../lib/ingestion/event";
import { parseFinancialEmail } from "../lib/ingestion/email";
import { gmailPaymentQuery, isAllowedSender, parseAllowedDomains } from "../lib/ingestion/gmail-filter";
import { GET } from "../app/api/live/summary/route";

const sms = validateEvent({source:"sms",kind:"debit_posted",merchant:"Netflix",amountPaise:19900,date:"2026-11-15",reference:"ABC123"});
const candidate = {id:"p1",reference:"ABC123",merchantKey:"NETFLIX",amountPaise:19900,date:"2026-11-15",sources:["sms"]};
test("strict validation prevents leaking raw messages and invalid dates",()=>{
  assert.throws(()=>validateEvent({...sms,rawText:"raw message"}));
  assert.throws(()=>validateEvent({...sms,date:"2026-02-31"}));
  assert.throws(()=>validateEvent({...sms,amountPaise:-1}));
  assert.throws(()=>validateEvent({...sms,merchant:"OTP"}));
});
test("idempotency is profile and channel scoped",()=>{
  assert.equal(eventKey("one",sms),eventKey("one",sms));
  assert.notEqual(eventKey("one",sms),eventKey("two",sms));
  assert.notEqual(eventKey("one",sms),eventKey("one",{...sms,source:"email"}));
});
test("shared reference links email and SMS, ambiguous match is review only",()=>{
  assert.equal(matchPayment({...sms,source:"email"},[candidate]).status,"matched");
  assert.equal(matchPayment({...sms,source:"email",reference:"XYZ456"},[candidate]).status,"review");
  assert.equal(matchPayment({...sms,reference:"XYZ456"},[candidate]).status,"created");
  assert.equal(matchPayment({...sms,source:"email",amountPaise:29900},[candidate]).status,"created");
});
test("email parser accepts approved explicit receipt and rejects sensitive or unknown senders",()=>{
  const mail={id:"msg123",from:"Receipts <receipt@example.com>",subject:"Payment receipt",body:"Merchant: Netflix\nAmount paid: INR 199.00\nReference: ABC123\nDate: 2026-11-15",date:"2026-11-15"};
  assert.deepEqual(parseFinancialEmail(mail,["example.com"]),{...sms,source:"email",sourceId:"msg123"});
  assert.equal(parseFinancialEmail(mail,["other.com"]),null);
  assert.equal(parseFinancialEmail({...mail,body:mail.body+"\nYour OTP is 123456"},["example.com"]),null);
});
test("Gmail domain suffixes include subdomains and preserve exact allowlists",()=>{
  const rules=parseAllowedDomains(" .COM, .in, example.org, .com ");
  assert.deepEqual(rules,[".com",".in","example.org"]);
  for (const sender of ["Receipts <noreply@tm.openai.com>","bank@alerts.bank.co.in","billing@EXAMPLE.IN","receipt@example.org"]) assert.equal(isAllowedSender(sender,rules),true,sender);
  for (const sender of ["receipt@com","receipt@fake.com.evil.org","receipt@domain.in.net","receipt@sub.example.org","receipt@bad..com","receipt@evil.org"]) assert.equal(isAllowedSender(sender,rules),false,sender);
  assert.equal(isAllowedSender("receipt@sub.example.com",["example.com"]),false);
  assert.throws(()=>parseAllowedDomains("com,in"));
  assert.throws(()=>parseAllowedDomains(".com,*"));
  assert.throws(()=>parseAllowedDomains(""));
});
test("Gmail searches message contents for suffix rules, not unsupported From wildcards",()=>{
  const query=gmailPaymentQuery("newer_than:90d",[".com",".in"]);
  assert.match(query,/^newer_than:90d /);
  assert.match(query,/\breceipt\b/);
  assert.match(query,/\bsubscription\b/);
  assert.doesNotMatch(query,/from:|subject:/);
  assert.equal(gmailPaymentQuery("after:123",["bank.in","example.com"],"receipt"),"after:123 {from:bank.in from:example.com} receipt");
});
test("subjectless .com and .in receipts import, but orders and OTPs do not",()=>{
  const mail={id:"msg456",from:"Billing <receipt@tm.example.com>",subject:"",body:"Your payment was successful\nBilled by: Example Service\nTotal paid ₹199.00",date:"2026-11-15"};
  const rules=[".com",".in"];
  assert.equal(parseFinancialEmail(mail,rules)?.amountPaise,19900);
  assert.equal(parseFinancialEmail({...mail,from:"receipt@alerts.bank.co.in"},rules)?.merchant,"EXAMPLE SERVICE");
  assert.equal(parseFinancialEmail({...mail,body:mail.body.replace("Your payment was successful","Order placed")},rules),null);
  assert.equal(parseFinancialEmail({...mail,body:mail.body+"\nYour OTP is 123456"},rules),null);
  assert.equal(parseFinancialEmail({...mail,from:"receipt@tm.example.com.evil.org"},rules),null);
  assert.equal(parseFinancialEmail({...mail,body:mail.body.replace("₹199.00","USD 199.00")},rules),null);
});
test("live summary is never public",async()=>{
  process.env.PAYTRACE_READ_CODE="secret-test-code";
  assert.equal((await GET(new Request("http://localhost/api/live/summary"))).status,401);
  delete process.env.PAYTRACE_LIVE_ENABLED;
  assert.equal((await GET(new Request("http://localhost/api/live/summary",{headers:{"x-paytrace-read":"secret-test-code"}}))).status,503);
});
