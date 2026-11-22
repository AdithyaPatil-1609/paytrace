import assert from "node:assert/strict";
import test from "node:test";
import { parseFinancialEmail } from "../lib/ingestion/email";
import { parseGmailReceipt } from "../lib/accounts/sync";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SubscriptionWatchlist } from "../components/insights/subscription-watchlist";
import { semanticEmailCandidate } from "../lib/ingestion/semantic-email";

test("generic recurring obligations extract labeled amounts and dates without recording payment",()=>{
  const base={id:"obligation123",from:"Provider <notices@example.com>",date:"2026-10-13"};
  const fixtures=[
    {subject:"Debit alert for your installment of Systematic Investment Plan (SIP)",body:"Your installment amount towards your SIP will be debited from your bank account shortly.\nInstallment Date : 17-OCT-2026\nSIP registered under : Example Flexi Cap Fund - Regular Plan - Growth\nInstallment Amount (Rs.) :9500",merchant:"EXAMPLE FLEXI CAP FUND - REGULAR PLAN - GROWTH",amount:950000,date:"2026-10-17"},
    {subject:"Your EMI payment is scheduled",body:"Loan name: Example Housing Loan\nEMI amount: INR 12,345.50\nEMI date: 20/10/2026",merchant:"EXAMPLE HOUSING LOAN",amount:1234550,date:"2026-10-20"},
    {subject:"Your annual insurance premium is due",body:"Policy name: Example Insurance\nPremium amount (INR): 2000\nDue date: 1 November 2026",merchant:"EXAMPLE INSURANCE",amount:200000,date:"2026-11-01"},
    {subject:"Your monthly bill is due",body:"Biller: Example Utilities\nAmount due: ₹450.00\nDue date: 2026-10-25",merchant:"EXAMPLE UTILITIES",amount:45000,date:"2026-10-25"},
  ];
  for(const f of fixtures){
    const e=parseFinancialEmail({...base,...f,date:base.date},[".com"]);
    assert.equal(e?.kind,"debit_scheduled",f.subject);
    assert.equal(e?.merchant,f.merchant);
    assert.equal(e?.amountPaise,f.amount);
    assert.equal(e?.renewalDate,f.date);
    assert.equal(e?.reference,null);
    assert.equal(e?.accountHint,undefined);
  }
  assert.equal(parseFinancialEmail({...base,subject:"Easy EMI offer - apply now",body:"EMI amount: INR 1000\nEMI date: 2026-10-20"},[".com"]),null);
  assert.equal(parseFinancialEmail({...base,subject:"Monthly newsletter",body:"Shop now and save ₹1000"},[".com"]),null);
  assert.equal(parseFinancialEmail({...base,subject:"Payment notice",body:"Bill amount: ₹450\nDue date: 2026-10-25"},[".com"]),null);
});

test("membership prices are extracted from unfamiliar layouts without fabricating charges",()=>{
  const base={id:"memberprice123",from:"Service <billing@example.com>",subject:"Your Example Video membership is good to go!",date:"2026-10-11"};
  for(const body of ["Membership fee: ₹89.00","Plan price (Rs.): 89","Example Video Student\n₹89.00","Amount payable: 89 INR"]){
    const e=parseFinancialEmail({...base,body},[".com"]);
    assert.equal(e?.planPricePaise,8900,body);
    assert.equal(e?.amountPaise,null);
  }
  assert.equal(parseFinancialEmail({...base,body:"₹89.00 and ₹199.00"},[".com"])?.planPricePaise,undefined);
  assert.equal(parseFinancialEmail({...base,body:"Order number: 123456"},[".com"])?.planPricePaise,undefined);
});

test("HTML tables and scheduled watchlist preserve rupee amounts",()=>{
  const body="<p>Your SIP will be debited shortly.</p><table><tr><td>Installment Date</td><td>: 17-OCT-2026</td></tr><tr><td>Fund name</td><td>: Example Fund</td></tr><tr><td>Installment Amount (Rs.)</td><td>:9500</td></tr></table>";
  const event=parseGmailReceipt({id:"htmlsip123",from:"Provider <mail@example.com>",subject:"SIP debit alert",date:"2026-10-13",payload:{mimeType:"text/html",body:{data:Buffer.from(body).toString("base64url")}}},[".com"]).event;
  assert.equal(event?.amountPaise,950000);
  assert.equal(event?.renewalDate,"2026-10-17");
  const html=renderToStaticMarkup(createElement(SubscriptionWatchlist,{asOf:"2026-11-21",registrations:[],scheduled:[{noticeId:"sip",sentOn:"2026-10-13",channel:"email",sender:"email",eventType:"debit_scheduled",brand:"EXAMPLE FUND",amount:9500,renewalDate:"2026-10-17",text:"Scheduled"}]}));
  assert.match(html,/₹9,500\.00 scheduled/);
  assert.match(html,/Not confirmed paid/);
});

test("local semantic fallback preserves only evidence-grounded provisional fields",async()=>{
  const mail={id:"semantic123",date:"2026-10-13",subject:"Standing instruction",text:"Your recurring payment for Example Service remains active.\nAmount: ₹123.50\nDue date: 2026-10-20\nFolio Number: 12345678"};
  const response={recurring:true,merchant:"Example Service",commitmentQuote:"Your recurring payment for Example Service remains active.",amountQuote:"Amount: ₹123.50",dueDateQuote:"Due date: 2026-10-20"};
  const event=await semanticEmailCandidate(mail,async(messages)=>{
    assert.doesNotMatch(messages[1].content,/12345678/);
    return JSON.stringify(response);
  });
  assert.equal(event?.kind,"subscription_candidate");
  assert.equal(event?.amountPaise,null);
  assert.equal(event?.planPricePaise,12350);
  assert.equal(event?.renewalDate,"2026-10-20");
  assert.equal(await semanticEmailCandidate(mail,async()=>JSON.stringify({...response,merchant:"Invented Service"})),null);
  assert.equal((await semanticEmailCandidate(mail,async()=>JSON.stringify({...response,amountQuote:"₹999"})))?.planPricePaise,undefined);
  assert.equal(await semanticEmailCandidate({...mail,subject:"Black Friday Special Offer"},async()=>{throw new Error("must not call model");}),null);
});
