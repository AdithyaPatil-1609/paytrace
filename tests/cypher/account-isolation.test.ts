import "../../scripts/load-env-local";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../../db/neo4j/client";
import { accountForSession, claimSync, createSession, endSession, removeGmailGrant, storeGmailGrant } from "../../db/neo4j/accounts";
import { ingestLiveEvent, readLiveSummary } from "../../db/neo4j/live";
import { profileFor } from "../../lib/accounts/security";
import type { PaymentEvent } from "../../lib/ingestion/event";

test("separate Google accounts and disconnected grants cannot share or write private payments",{skip:!hasNeo4jConfig()},async()=>{
  Object.assign(process.env,{GOOGLE_WEB_CLIENT_ID:"test-client",GOOGLE_WEB_CLIENT_SECRET:"test-secret",PAYTRACE_APP_URL:"http://localhost:3000",PAYTRACE_AUTH_KEY:"ab".repeat(32)});
  const a=`test-${randomUUID()}`,b=`test-${randomUUID()}`;
  const driver=getNeo4jDriver(),session=driver.session({database:neo4jDatabase});
  const event:PaymentEvent={source:"email",kind:"debit_posted",merchant:"TEST STREAMING",amountPaise:19900,date:"2026-01-01",reference:"REF123",sourceId:"mail1"};
  try {
    const sa=await createSession({sub:a,email:"a@example.com",name:"A"});
    const sb=await createSession({sub:b,email:"b@example.com",name:"B"});
    assert.equal((await accountForSession(sa))?.profile,profileFor(a));
    assert.equal((await accountForSession(sb))?.profile,profileFor(b));
    await storeGmailGrant(a,"test-token");
    const grant=await claimSync(a);assert.ok(grant);
    assert.equal(await claimSync(a),null);
    await assert.rejects(ingestLiveEvent(profileFor(b),event,grant));
    assert.equal((await ingestLiveEvent(profileFor(a),event,grant)).status,"created");
    assert.equal((await readLiveSummary(profileFor(a))).counts.payments,1);
    assert.equal((await readLiveSummary(profileFor(b))).counts.payments,0);
    assert.equal(await removeGmailGrant(a),"test-token");
    await assert.rejects(ingestLiveEvent(profileFor(a),{...event,sourceId:"mail2"},grant));
    assert.equal((await accountForSession(sa))?.linked,false);
    await endSession(sa);assert.equal(await accountForSession(sa),null);
    assert.equal((await accountForSession(sb))?.sub,b);
  } finally {
    for (const sub of [a,b]) {
      await session.run(`MATCH (u:PaytraceUser {sub:$sub}) OPTIONAL MATCH (u)-[:HAS_SESSION]->(s:PaytraceSession) DETACH DELETE s,u`,{sub});
      await session.run(`MATCH (u:LiveProfile {id:$profile})-[:RECEIVED|HAS_PAYMENT]->(n) OPTIONAL MATCH (n)-[:ABOUT|PAID_TO]->(m:LiveMerchant) WITH collect(DISTINCT n)+collect(DISTINCT m)+collect(DISTINCT u) AS nodes UNWIND nodes AS node DETACH DELETE node`,{profile:profileFor(sub)});
    }
    await session.close();await driver.close();
  }
});
