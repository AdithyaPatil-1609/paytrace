/**
 * On a real Neo4j (CI's cypher job, or the laptop's Docker Neo4j):
 * pairing codes work once, phones belong to one person, sign out everywhere
 * ends every session, and "Delete my data" leaves nothing of that person while
 * another person's data stays. Made-up people and payments only.
 */
import "../../scripts/load-env-local";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../../db/neo4j/client";
import { accountForSession, createSession, endAllSessions } from "../../db/neo4j/accounts";
import { createPairingCode, deviceById, pairDevice, removeDevices } from "../../db/neo4j/devices";
import { deleteAllUserData } from "../../db/neo4j/delete-user";
import { ingestLiveEvent, readLiveSummary } from "../../db/neo4j/live";
import { profileFor } from "../../lib/accounts/security";
import type { PaymentEvent } from "../../lib/ingestion/event";

const env = () => Object.assign(process.env, { GOOGLE_WEB_CLIENT_ID: "test-client", GOOGLE_WEB_CLIENT_SECRET: "test-secret", PAYTRACE_APP_URL: "http://localhost:3000", PAYTRACE_AUTH_KEY: "ab".repeat(32) });
// A throwaway P-256 public key, made fresh for each run (never a fixed string in the code).
const devicePublicKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey.export({ format: "der", type: "spki" }).toString("base64");

// The shared driver keeps a connection pool open; close it so the test process can exit.
after(async () => { if (hasNeo4jConfig()) await getNeo4jDriver().close(); });

test("pairing codes work once and phones belong to one person", { skip: !hasNeo4jConfig() }, async () => {
  env();
  const a = `test-${randomUUID()}`;
  await createSession({ sub: a, email: "a@example.com", name: "A" });
  try {
    const { code } = await createPairingCode(a);
    const first = await pairDevice(code, devicePublicKey, "Test phone");
    assert.equal(first.ok, true);
    assert.deepEqual(await pairDevice(code, devicePublicKey, "Second try"), { ok: false, reason: "invalid-code" });
    if (first.ok) {
      const owner = await deviceById(first.deviceId);
      assert.equal(owner?.sub, a);
      assert.equal(owner?.profile, profileFor(a));
      assert.deepEqual(await removeDevices(a), [first.deviceId]);
      assert.equal(await deviceById(first.deviceId), null);
    }
  } finally { await deleteAllUserData(a, profileFor(a)); }
});

test("sign out everywhere ends every session; delete my data removes only that person", { skip: !hasNeo4jConfig() }, async () => {
  env();
  const a = `test-${randomUUID()}`, b = `test-${randomUUID()}`;
  const event: PaymentEvent = { source: "sms", kind: "debit_posted", merchant: "TEST MUSIC", amountPaise: 11900, date: "2026-01-02", reference: "REF9", sourceId: `sms-${randomUUID()}` };
  const a1 = await createSession({ sub: a, email: "a@example.com", name: "A" });
  const a2 = await createSession({ sub: a, email: "a@example.com", name: "A" });
  await createSession({ sub: b, email: "b@example.com", name: "B" });
  try {
    await endAllSessions(a);
    assert.equal(await accountForSession(a1), null);
    assert.equal(await accountForSession(a2), null);

    await ingestLiveEvent(profileFor(a), event);
    await ingestLiveEvent(profileFor(b), { ...event, sourceId: `sms-${randomUUID()}` });
    const { code } = await createPairingCode(a);
    await pairDevice(code, devicePublicKey, "Phone A");

    assert.equal((await deleteAllUserData(a, profileFor(a))).found, true);
    const s = getNeo4jDriver().session({ database: neo4jDatabase });
    try {
      const left = await s.run(`OPTIONAL MATCH (u:PaytraceUser {sub:$a}) WITH count(u) AS users
        OPTIONAL MATCH (p:LiveProfile {id:$profile}) WITH users, count(p) AS profiles
        OPTIONAL MATCH (x) WHERE (x:LivePayment AND x.profile = $profile) OR (x:LiveSubscription AND x.id STARTS WITH $profile + '|')
        RETURN users, profiles, count(x) AS leftovers`, { a, profile: profileFor(a) });
      assert.equal(Number(left.records[0].get("users")), 0);
      assert.equal(Number(left.records[0].get("profiles")), 0);
      assert.equal(Number(left.records[0].get("leftovers")), 0, "no payments or subscriptions keyed to the person remain");
    } finally { await s.close(); }
    assert.equal((await readLiveSummary(profileFor(a))).counts.payments, 0);
    assert.equal((await readLiveSummary(profileFor(b))).counts.payments, 1, "the other person's data stays");
  } finally {
    await deleteAllUserData(a, profileFor(a));
    await deleteAllUserData(b, profileFor(b));
  }
});
