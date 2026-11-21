import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { accountConfig, GMAIL_SCOPE, open, profileFor, readFlow, seal, sameOrigin, hash } from "../lib/accounts/security";
import { authorizationUrl, createFlow } from "../lib/accounts/google";
import { emailText } from "../lib/accounts/sync";
import { GET as getSummary } from "../app/api/account/summary/route";
import { POST as startAuth } from "../app/api/auth/google/start/route";
import { GET as finishAuth } from "../app/api/auth/google/callback/route";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountDashboard } from "../components/account-dashboard";
import { Dashboard } from "../components/dashboard";
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

test("same-origin sign-in starts real Google verification without Gmail permission",async()=>{
  const response=await startAuth(new NextRequest("http://localhost:3000/api/auth/google/start",{method:"POST",headers:{origin:"http://localhost:3000","content-type":"application/x-www-form-urlencoded"},body:"mode=login"}));
  assert.equal(response.status,303);
  const destination=new URL(response.headers.get("location")!);
  assert.equal(destination.origin,"https://accounts.google.com");
  assert.equal(destination.searchParams.get("scope"),"openid email profile");
  assert.equal(destination.searchParams.get("code_challenge_method"),"S256");
  assert.ok(response.headers.get("set-cookie")?.includes("HttpOnly"));
});

test("unverified callbacks never reach the verified welcome screen",async()=>{
  const response=await finishAuth(new NextRequest("http://localhost:3000/api/auth/google/callback?code=fake&state=fake"));
  assert.equal(response.status,303);
  assert.equal(response.headers.get("location"),"http://localhost:3000/account?notice=authorization-error");
  assert.ok(!response.headers.get("set-cookie")?.includes("paytrace_session="));
});

test("mail bodies are extracted as bounded text and never rendered",()=>{
  const part=(mimeType:string,body:string)=>({mimeType,body:{data:Buffer.from(body).toString("base64url")}});
  assert.equal(emailText({parts:[part("text/html","<p>HTML</p>"),part("text/plain","Payment successful")]}),"Payment successful");
  const text=emailText(part("text/html","<script>evil()</script><p>Amount: &#8377;199</p>"));
  assert.equal(text,"Amount: ₹199");
  assert.equal(emailText(part("text/plain","x".repeat(21000))).length,20000);
});

test("signed-in dashboard retains all original tabs without demo payments",()=>{
  const html=renderToStaticMarkup(createElement(AccountDashboard,{name:"Example User",email:"user@example.com",linked:false,lastSync:null,asOf:"2026-11-16"}));
  for(const tab of ["All payments","Issues","Cancel paths","Annual","Evidence graph"]) assert.ok(html.includes(tab),tab);
  assert.ok(html.includes("Connect Gmail"));
  assert.ok(html.includes("Sign out"));
  assert.ok(html.includes("No recurring payments detected yet"));
  assert.ok(!html.includes("Priya"));
  assert.ok(!html.includes("Spotify"));
  assert.ok(!html.includes("Simulate a new Autopay"));
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
