/**
 * The iPhone token (plan card U4) against a real Neo4j: it names one account,
 * only its hash is kept, and a new token or a disconnect stops the old one.
 */
import "../../scripts/load-env-local";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../../db/neo4j/client";
import { accountForSession, createSession, profileForIosToken, removeIosToken, setIosToken } from "../../db/neo4j/accounts";
import { newIosToken } from "../../lib/ingestion/ios-token";
import { profileFor } from "../../lib/accounts/security";

test("an iPhone token reaches only its own account, and stops after disconnect or a new token",{skip:!hasNeo4jConfig()},async()=>{
  Object.assign(process.env,{GOOGLE_WEB_CLIENT_ID:"test-client",GOOGLE_WEB_CLIENT_SECRET:"test-secret",PAYTRACE_APP_URL:"http://localhost:3000",PAYTRACE_AUTH_KEY:"ab".repeat(32)});
  const a=`test-${randomUUID()}`,b=`test-${randomUUID()}`;
  const driver=getNeo4jDriver(),session=driver.session({database:neo4jDatabase});
  try {
    const sa=await createSession({sub:a,email:"a@example.com",name:"A"});
    await createSession({sub:b,email:"b@example.com",name:"B"});
    assert.equal((await accountForSession(sa))?.iphone,false);
    const first=newIosToken(),second=newIosToken(),forB=newIosToken();
    await setIosToken(a,first);await setIosToken(b,forB);
    assert.equal(await profileForIosToken(first),profileFor(a));
    assert.equal(await profileForIosToken(forB),profileFor(b));
    assert.equal((await accountForSession(sa))?.iphone,true);
    const stored=await session.run("MATCH (u:PaytraceUser {sub:$sub}) RETURN u.iosTokenHash AS h",{sub:a});
    assert.notEqual(stored.records[0]?.get("h"),first,"only the hash is stored");
    await setIosToken(a,second);
    assert.equal(await profileForIosToken(first),null,"an old token stops working");
    assert.equal(await profileForIosToken(second),profileFor(a));
    await removeIosToken(a);
    assert.equal(await profileForIosToken(second),null);
    assert.equal((await accountForSession(sa))?.iphone,false);
    assert.equal(await profileForIosToken(newIosToken()),null);
  } finally {
    for (const sub of [a,b]) await session.run(`MATCH (u:PaytraceUser {sub:$sub}) OPTIONAL MATCH (u)-[:HAS_SESSION]->(s:PaytraceSession) DETACH DELETE s,u`,{sub});
    await session.close();await driver.close();
  }
});
