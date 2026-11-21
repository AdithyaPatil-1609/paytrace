import { Landing } from "../components/landing";
import { gmailDateFilter, gmailHistoryDays } from "../lib/accounts/gmail-history";
import { noticeIsError, noticeText } from "../lib/accounts/notices";
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { accountConfig, GMAIL_SCOPE, open, profileFor, readFlow, seal, sameOrigin, hash } from "../lib/accounts/security";
import { authorizationUrl, createFlow, GoogleTokenError, googleAuthorizationCode } from "../lib/accounts/google";
import { emailText, parseGmailReceipt, syncFailureCode, gmailResponseError } from "../lib/accounts/sync";
import { AccountError, accountErrorMessage } from "../lib/accounts/errors";
import { GET as completeAuth } from "../app/api/auth/google/callback/route";
import { POST as syncGmail } from "../app/api/account/gmail/sync/route";
import { GET as getSummary } from "../app/api/account/summary/route";
import { POST as startAuth } from "../app/api/auth/google/start/route";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountDashboard } from "../components/account-dashboard";
import { Dashboard } from "../components/dashboard";
import { AccountLogin } from "../components/account-login";
import { SubscriptionWatchlist, renewalNotice } from "../components/subscription-watchlist";
import { parseFinancialEmail } from "../lib/ingestion/email";
import { loadDemo } from "../lib/data/load-demo";
import { detectCommitments } from "../lib/payments/engine";
import type { Dataset } from "../lib/payments/types";

Object.assign(process.env,{GOOGLE_WEB_CLIENT_ID:"test-client",GOOGLE_WEB_CLIENT_SECRET:"test-secret",PAYTRACE_AUTH_KEY:"ab".repeat(32),PAYTRACE_APP_URL:"http://localhost:3000"});

test("Google login is separate from read-only Gmail consent",()=>{
  const login=new URL(authorizationUrl(createFlow("login")));
  assert.equal(login.searchParams.get("scope"),"openid email profile");
  assert.equal(login.searchParams.get("redirect_uri"),accountConfig().redirect);
  const flow=createFlow("link",{sub:"user-a",session:"session-a"});
  const link=new URL(authorizationUrl(flow,"example@gmail.com"));
  assert.ok(link.searchParams.get("scope")?.includes(GMAIL_SCOPE));
  assert.equal(link.searchParams.get("access_type"),"offline");
  assert.equal(link.searchParams.get("prompt"),"consent");
  assert.equal(link.searchParams.get("code_challenge_method"),"S256");
  assert.equal(flow.sessionHash,hash("session-a"));
  assert.equal(flow.sub,"user-a");
  assert.notEqual(profileFor("user-a"),profileFor("user-b"));
  assert.throws(()=>createFlow("link"));
});

test("OAuth state and token encryption are authenticated and account-bound",()=>{
  const flow=createFlow("login");
  const encrypted=seal(JSON.stringify(flow),"oauth-flow");
  assert.deepEqual(readFlow(encrypted,flow.state),flow);
  assert.throws(()=>readFlow(encrypted,"wrong-state"));
  assert.throws(()=>readFlow(seal(JSON.stringify({...flow,expires:0}),"oauth-flow"),flow.state));
  const token=seal("refresh-token","gmail:user-a");
  assert.equal(open(token,"gmail:user-a"),"refresh-token");
  assert.throws(()=>open(token,"gmail:user-b"));
  const [iv,tag,data]=token.split(".");
  assert.throws(()=>open(`${iv}.${tag}.${data[0]==="A"?"B":"A"}${data.slice(1)}`,"gmail:user-a"));
});

test("account endpoints reject anonymous reads and cross-origin authorization",async()=>{
  assert.equal((await getSummary(new NextRequest("http://localhost:3000/api/account/summary?profile=someone-else"))).status,401);
  assert.equal(sameOrigin(new Request("http://localhost:3000",{headers:{origin:"https://other.example"}})),false);
  const response=await startAuth(new NextRequest("http://localhost:3000/api/auth/google/start",{method:"POST",headers:{origin:"https://other.example","content-type":"application/x-www-form-urlencoded"},body:"mode=login"}));
  assert.equal(response.status,403);
});

test("OAuth callback reports interrupted and denied consent without exposing provider details",async()=>{
  const expired=await completeAuth(new NextRequest("http://localhost:3000/api/auth/google/callback?state=invalid"));
  assert.match(expired.headers.get("location")??"",/notice=oauth-expired$/);
  const flow=createFlow("login");
  const cookie=seal(JSON.stringify(flow),"oauth-flow");
  const denied=await completeAuth(new NextRequest(`http://localhost:3000/api/auth/google/callback?state=${flow.state}&error=access_denied`,{headers:{cookie:`paytrace_oauth_flow=${cookie}`}}));
  assert.match(denied.headers.get("location")??"",/notice=declined$/);
  assert.equal(googleAuthorizationCode(new GoogleTokenError(400,"invalid_grant")),"oauth-expired");
  assert.equal(googleAuthorizationCode(new GoogleTokenError(401,"invalid_client")),"oauth-config");
  assert.equal(googleAuthorizationCode(new AccountError("permission-required")),"permission-required");
});

test("Gmail sync diagnostics distinguish permissions, API, quota, query and storage errors",async()=>{
  assert.equal(syncFailureCode(new GoogleTokenError(400,"invalid_grant"),"google"),"gmail-reconnect");
  assert.equal(syncFailureCode(new GoogleTokenError(403,"insufficientPermissions"),"google"),"gmail-reconnect");
  assert.equal(syncFailureCode(new GoogleTokenError(403,"SERVICE_DISABLED"),"google"),"gmail-api-disabled");
  assert.equal(syncFailureCode(new GoogleTokenError(403,"userRateLimitExceeded"),"google"),"gmail-rate-limit");
  assert.equal(syncFailureCode(new GoogleTokenError(403,"USER_RATE_LIMIT_EXCEEDED"),"google"),"gmail-rate-limit");
  assert.equal(syncFailureCode(new GoogleTokenError(403,"dailyLimitExceeded"),"google"),"gmail-daily-quota");
  assert.equal(syncFailureCode(new GoogleTokenError(403,"domainPolicy"),"google"),"gmail-domain-policy");
  assert.equal(syncFailureCode(new GoogleTokenError(403,"PERMISSION_DENIED"),"google"),"gmail-forbidden");
  assert.equal(syncFailureCode(gmailResponseError(403,{error:{details:[{reason:"RATE_LIMIT_EXCEEDED"}],errors:[{reason:"dailyLimitExceeded"}],status:"PERMISSION_DENIED"}}),"google"),"gmail-daily-quota");
  assert.equal(syncFailureCode(gmailResponseError(403,{error:{details:[{reason:"UNKNOWN"}],errors:[{reason:"userRateLimitExceeded"}]}}),"google"),"gmail-rate-limit");
  assert.equal(syncFailureCode(new GoogleTokenError(400,"badRequest"),"google"),"gmail-query");
  assert.equal(syncFailureCode(new Error("private database error"),"neo4j"),"neo4j-unavailable");
  assert.equal(syncFailureCode(new Error("private network error"),"google"),"gmail-unavailable");
  assert.equal(accountErrorMessage("untrusted provider message"),undefined);
  assert.equal(accountErrorMessage("constructor"),undefined);
  const response=await syncGmail(new NextRequest("http://localhost:3000/api/account/gmail/sync",{method:"POST",headers:{origin:"http://127.0.0.1:3000"}}));
  assert.equal(response.status,403);
  assert.equal((await response.json()).code,"origin-mismatch");
});

test("signed-in dashboard retains a specific Gmail authorization error and stable status strip",()=>{
  const html=renderToStaticMarkup(createElement(AccountDashboard,{name:"User",email:"user@example.com",linked:false,lastSync:null,asOf:"2026-11-19",notice:accountErrorMessage("permission-required"),noticeIsError:true}));
  assert.ok(html.includes("Google did not grant Gmail read access"));
  assert.ok(html.includes('role="alert"'));
  const connected=renderToStaticMarkup(createElement(AccountDashboard,{name:"User",email:"user@example.com",linked:true,lastSync:"2026-11-19",asOf:"2026-11-19"}));
  assert.ok(connected.includes('class="personal-status"'));
});

test("mail bodies are extracted as bounded text and never rendered",()=>{
  const part=(mimeType:string,body:string)=>({mimeType,body:{data:Buffer.from(body).toString("base64url")}});
  assert.equal(emailText({parts:[part("text/html","<p>HTML</p>"),part("text/plain","Payment successful")]}),"Payment successful");
  const text=emailText(part("text/html","<script>evil()</script><p>Amount: &#8377;199</p>"));
  assert.equal(text,"Amount: ₹199");
  assert.equal(emailText(part("text/plain","x".repeat(21000))).length,20000);
});

test("HTML subscription table is imported without a subject, preserving the real total",()=>{
  const html="<p>Order number: sub_test456</p><p>Order date: Oct 22, 2026</p><table><tr><th>Plan</th><th>Amount</th></tr><tr><td>ChatGPT Plus Subscription</td><td>&#8377;1694.07</td></tr><tr><td>Discount:</td><td>-&#8377;1694.07</td></tr><tr><td>Total:</td><td>&#8377;0.00</td></tr></table>";
  const body=emailText({mimeType:"text/html",body:{data:Buffer.from(html).toString("base64url")}});
  const event=parseFinancialEmail({id:"html123",from:"noreply@tm.example.com",subject:"",date:"2026-10-22",body},[".com"]);
  assert.equal(event?.kind,"subscription_registered");
  assert.equal(event?.planPricePaise,169407);
  assert.equal(event?.amountPaise,0);
});

test("Gmail uses the detailed HTML alternative when the plain receipt is incomplete",()=>{
  const part=(mimeType:string,body:string)=>({mimeType,body:{data:Buffer.from(body).toString("base64url")}});
  const html="<p><b>Order number:</b> sub_test789</p><p>Order date: Oct 22, 2026</p><table><tr><th>Plan</th><th>Amount</th></tr><tr><td><div>ChatGPT Plus Subscription</div></td><td><div>&#x20b9;&thinsp;1694.07</div></td></tr><tr><td>Discount:</td><td>-&#8377;1694.07</td></tr><tr><td><b>Total:</b></td><td><span>&#8377;0.00</span></td></tr></table>";
  const input={id:"mail789",from:"noreply@tm.openai.com",subject:"ChatGPT - Your new plan",date:"2026-10-22",payload:{mimeType:"multipart/alternative",parts:[part("text/plain","Manage your subscription"),part("text/html",html)]}};
  const result=parseGmailReceipt(input,[".com",".in"]);
  assert.equal(result.event?.kind,"subscription_registered");
  assert.equal(result.event?.merchant,"CHATGPT PLUS");
  assert.equal(result.event?.planPricePaise,169407);
  assert.equal(result.event?.amountPaise,0);
  assert.equal(parseGmailReceipt(input,["gmail.com"]).reason,"sender");
  assert.equal(parseGmailReceipt({...input,payload:{parts:[part("text/plain","Your OTP is 123456"),part("text/html",html)]}},[".com"]).reason,"sensitive");
  assert.equal(parseGmailReceipt({...input,payload:{parts:[part("text/plain","Total: INR 199"),part("text/html",html)]}},[".com"]).event,null);
  assert.equal(parseGmailReceipt({...input,payload:{parts:[part("text/plain","Manage your subscription")]}},[".com"]).reason,"subscription");
  assert.equal(parseGmailReceipt({...input,payload:{parts:[part("text/plain","Manage your subscription"),{...part("text/html",html),filename:"attached.html"}]}},[".com"]).event,null);
});

test("receipt text accepts markdown formatting and narrow spaces",()=>{
  const body="**Order number:** sub_demo789\n**Order date:** Oct 22, 2026\n| Plan | Amount |\n| ChatGPT Plus Subscription | ₹\u202f1694.07 |\n**Total:** ₹\u00a00.00";
  const event=parseFinancialEmail({id:"md123",from:"noreply@example.com",subject:"Your new plan",date:"2026-10-22",body},[".com"]);
  assert.equal(event?.kind,"subscription_registered");
  assert.equal(event?.planPricePaise,169407);
});

test("subscription watchlist shows actual zero cost and never invents a renewal date",()=>{
  const html=renderToStaticMarkup(createElement(SubscriptionWatchlist,{asOf:"2026-11-19",registrations:[{noticeId:"test",sentOn:"2026-10-22",channel:"email",sender:"email",eventType:"subscription_registered",brand:"CHATGPT PLUS",amount:0,planPrice:1694.07,text:"Registration"}]}));
  assert.ok(html.includes("Subscription watchlist"));
  assert.ok(html.includes("1 email"));
  assert.ok(html.includes("₹1,694.07"));
  assert.ok(html.includes("₹0.00 paid"));
  assert.ok(html.includes("Next renewal not confirmed"));
  assert.match(renewalNotice("2026-11-22","2026-11-19"),/Upcoming renewal.*in 3 days/);
  assert.match(renewalNotice("2026-10-22","2026-11-19"),/has passed/);
  assert.doesNotMatch(renewalNotice("2027-01-22","2026-11-19"),/Upcoming/);
});

test("HTML renewal notices are visible as scheduled cost, never paid",()=>{
  const html="<div>iCloud+</div><div>iCloud+ with 2 TB of storage (1 month)</div><div>&#8377;749.00/month</div><p>Starting from 20 November 2026, your subscription automatically renews for &#8377;749.00/month.</p>";
  const event=parseGmailReceipt({id:"icloud123",from:"Apple <billing@example.com>",subject:"Your Subscription Renewal",date:"2026-11-19",payload:{mimeType:"text/html",body:{data:Buffer.from(html).toString("base64url")}}},[".com"]).event;
  assert.equal(event?.kind,"subscription_renewal");
  assert.equal(event?.merchant,"ICLOUD+");
  const view=renderToStaticMarkup(createElement(SubscriptionWatchlist,{asOf:"2026-11-21",registrations:[],renewals:[{noticeId:"renewal",sentOn:"2026-11-19",channel:"email",sender:"email",eventType:"subscription_renewal",brand:"ICLOUD+",amount:749,renewalDate:"2026-11-20",renewalFrequency:"monthly",text:"Renewal"}]}));
  assert.ok(view.includes("₹749.00 scheduled"));
  assert.ok(view.includes("₹8,988.00"));
  assert.ok(view.includes("has passed"));
  assert.ok(!view.includes("₹749.00 paid"));
});

test("two-year Gmail history is explicit; normal sync never silently expands",()=>{
  assert.equal(gmailDateFilter(true,gmailHistoryDays("730")),"newer_than:730d");
  assert.equal(gmailDateFilter(false,730),"newer_than:90d");
  assert.match(gmailDateFilter(false,730,"2026-11-22"),/^after:/);
  assert.equal(gmailHistoryDays("9999"),365);
  assert.equal(gmailHistoryDays("90"),90);
});

test("YouTube Music student welcome records only the explicitly stated monthly schedule",()=>{
  const body="Welcome to your Music Premium student membership! Your payment method will be charged monthly starting on <b>Nov 5, 2025</b>. You can explore, manage, and cancel your membership any time by visiting YouTube account settings.";
  const mail={id:"sampleyoutube123",from:"YouTube <noreply-purchases@youtube.com>",subject:"Your Music Premium student membership is good to go!",date:"2025-10-05",payload:{mimeType:"text/html",body:{data:Buffer.from(body).toString("base64url")}}};
  const {event}=parseGmailReceipt(mail,[".com"]);
  assert.equal(event?.merchant,"YOUTUBE MUSIC PREMIUM STUDENT");
  assert.equal(event.kind,"subscription_candidate");
  assert.equal(event.renewalFrequency,"monthly");
  assert.equal(event.renewalDate,"2025-11-05");
  assert.equal(event.amountPaise,null);
  assert.equal(event.planPricePaise,undefined);
  assert.notEqual(parseGmailReceipt({...mail,from:"YouTube <billing@example.com>"},[".com"]).event?.merchant,event.merchant);
});

test("membership confirmation survives missing fields and MIME alternatives",()=>{
  const part=(mimeType:string,body:string)=>({mimeType,body:{data:Buffer.from(body).toString("base64url")}});
  const input={id:"youtube123",from:"YouTube <noreply-purchases@youtube.com>",subject:"Your YouTube Premium student membership is good to go!",date:"2026-10-11",payload:{parts:[part("text/plain","Thanks for joining"),part("text/html","<p>Membership active</p><p>₹89/month</p>")]}};
  const event=parseGmailReceipt(input,[".com"]).event;
  assert.equal(event?.kind,"subscription_candidate");
  assert.equal(event?.planPricePaise,8900);
  assert.equal(event?.amountPaise,null);
  assert.equal(parseGmailReceipt({...input,payload:{}},[".com"]).event?.kind,"subscription_candidate");
  const view=renderToStaticMarkup(createElement(SubscriptionWatchlist,{asOf:"2026-11-21",registrations:[],candidates:[{noticeId:"youtube",sentOn:"2026-10-11",channel:"email",sender:"email",eventType:"subscription_candidate",brand:"YOUTUBE PREMIUM STUDENT",text:"Membership confirmed"}]}));
  assert.ok(view.includes("YOUTUBE PREMIUM STUDENT"));
  assert.ok(view.includes("Price unknown"));
  assert.ok(view.includes("Not confirmed paid"));
});

test("promotions and newsletter footers are rejected, but genuine membership confirmations survive boilerplate",()=>{
  const part=(body:string)=>({mimeType:"text/plain",body:{data:Buffer.from(body).toString("base64url")}});
  const ad={id:"promotion123",from:"Adidas <news@comm.adidas.in>",subject:"Black Friday Favourites Come with Bigger Savings!",date:"2026-11-21",payload:part("Welcome to our store. Shop now. Manage your subscription and order number. Thanks for subscribing.")};
  assert.equal(parseGmailReceipt(ad,[".com",".in"]).reason,"marketing");
  assert.equal(parseGmailReceipt({...ad,subject:"Originals Sport. Made to move.",payload:part("Welcome to adidas. Thank you for subscribing. Manage your email subscription.")},[".in"]).event,null);
  assert.equal(parseGmailReceipt({...ad,subject:"Our new collection",labelIds:["CATEGORY_PROMOTIONS"],payload:part("Plan: Example\nSubscription renewal ₹500/month")},[".in"]).event,null);
  const confirmed={id:"youtube123",from:"YouTube <noreply-purchases@youtube.com>",subject:"Your YouTube Premium student membership is good to go!",date:"2026-10-11",payload:part("Welcome! If your membership is cancelled, refund eligibility may vary. Keep your account password safe."),labelIds:["CATEGORY_PROMOTIONS"]};
  const result=parseGmailReceipt(confirmed,[".com"]).event;
  assert.equal(result?.kind,"subscription_candidate");
  assert.equal(result?.merchant,"YOUTUBE PREMIUM STUDENT");
  assert.equal(result?.amountPaise,null);
  assert.equal(parseGmailReceipt({...confirmed,payload:part("Your OTP is 123456")},[".com"]).reason,"sensitive");
  assert.equal(parseGmailReceipt({...confirmed,payload:part("Your subscription has been cancelled")},[".com"]).event,null);
});

test("signed-in dashboard retains all original tabs without demo payments",()=>{
  const html=renderToStaticMarkup(createElement(AccountDashboard,{name:"Example User",email:"user@example.com",linked:false,lastSync:null,asOf:"2026-11-16"}));
  for(const tab of ["All payments","Issues","Cancel paths","Annual","Evidence graph"]) assert.ok(html.includes(tab),tab);
  assert.ok(html.includes("Connect Gmail"));
  assert.ok(html.includes("Sign out"));
  assert.ok(html.includes("No repeating payments yet"));
  assert.ok(!html.includes("Priya"));
  assert.ok(!html.includes("Spotify"));
  assert.ok(!html.includes("Simulate a new Autopay"));
});

test("login offers a no-account static demo even when Google sign-in is unavailable",async()=>{
  const html=renderToStaticMarkup(createElement(AccountLogin,{configured:true}));
  assert.ok(html.includes("Continue with Google"));
  assert.ok(html.includes("View static demo"));
  assert.ok(html.includes('href="/demo"'));
  const offline=renderToStaticMarkup(createElement(AccountLogin,{configured:false}));
  assert.ok(offline.includes("View static demo"));
  const {dataset,source}=await loadDemo(true);
  assert.equal(source.kind,"fixture");
  assert.ok(dataset.statement.length>0);
  assert.ok(dataset.statement.every(row=>row.persona==="priya"));
});

test("the landing drawer handles sign-in, errors and offline demo access",()=>{
  const landing=renderToStaticMarkup(createElement(Landing));
  assert.ok(landing.includes('href="/signin"'));
  assert.ok(landing.includes('href="/demo"'));
  assert.ok(!landing.includes("Continue with Google"),"the landing page has no sign-in form");
  const signin=renderToStaticMarkup(createElement(Landing,{configured:true,initialOpen:true,initialNotice:"Please retry",initialNoticeIsError:true}));
  assert.ok(signin.includes('role="dialog"'));
  assert.ok(signin.includes('role="alert"'));
  assert.ok(signin.includes('Please retry'));
  assert.ok(signin.includes('action="/api/auth/google/start"'));
  assert.ok(signin.includes("Approved test accounts only"));
  assert.ok(signin.includes('href="/demo"'));
  assert.ok(signin.includes('href="/"'));
  const offline=renderToStaticMarkup(createElement(Landing,{configured:false,initialOpen:true}));
  assert.ok(!offline.includes("Continue with Google"));
  assert.ok(offline.includes('href="/demo"'));
});

test("sign-in notices: known codes get their text, unknown codes are ignored",()=>{
  assert.equal(noticeText("signed-in"),"You're signed in. Gmail linking is optional.");
  assert.equal(noticeText("<script>"),undefined);
  assert.equal(noticeText("toString"),undefined);
  assert.equal(noticeIsError("declined"),true);
  assert.equal(noticeIsError("signed-in"),false);
});

test("original all-payments screen renders personal recurring data, not demo records",()=>{
  const dataset:Dataset={asOf:"2026-11-16",statement:["2026-08-01","2026-09-01","2026-10-01","2026-11-01"].map((date,i)=>({txnId:`private-${i}`,persona:"private",date,accountId:"private-account",accountType:"unknown",narration:"PRIVATE STREAMING",debit:199,reference:`private-ref-${i}`,channel:"email",txnKind:"debit_purchase"})),notifications:[],mandates:[],usage:[],dictionary:[]};
  const commitments=detectCommitments(dataset);
  assert.equal(commitments.length,1);
  const html=renderToStaticMarkup(createElement(Dashboard,{dataset,commitments,source:{kind:"neo4j",personal:true,counts:{payments:4,messages:0,mandates:0,patterns:0,commitments:1}},account:{name:"Example",controls:createElement("span",null,"Example")}}));
  assert.ok(html.includes("PRIVATE STREAMING"));
  assert.ok(!html.includes("Priya"));
  assert.ok(!html.includes("Swiggy"));
  assert.ok(!html.includes("Simulate a new Autopay"));
});
