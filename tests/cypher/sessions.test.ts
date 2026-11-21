/**
 * Sessions on a real Neo4j (CI's cypher job): a session unused for 30 minutes ends,
 * an old one is rotated to a fresh token with the same absolute expiry, and the
 * old token works for one more minute only. Made-up accounts only.
 */
import "../../scripts/load-env-local";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../../db/neo4j/client";
import { accountForSession, createSession, rotateSession } from "../../db/neo4j/accounts";
import { deleteAllUserData } from "../../db/neo4j/delete-user";
import { hash, profileFor } from "../../lib/accounts/security";

after(async () => { if (hasNeo4jConfig()) await getNeo4jDriver().close(); });
const age = async (raw: string, set: string) => {
  const s = getNeo4jDriver().session({ database: neo4jDatabase });
  try { await s.run(`MATCH (sess:PaytraceSession {hash:$hash}) SET ${set}`, { hash: hash(raw) }); } finally { await s.close(); }
};

test("idle sessions end; old sessions rotate with a one-minute grace", { skip: !hasNeo4jConfig() }, async () => {
  Object.assign(process.env, { GOOGLE_WEB_CLIENT_ID: "test-client", GOOGLE_WEB_CLIENT_SECRET: "test-secret", PAYTRACE_APP_URL: "http://localhost:3000", PAYTRACE_AUTH_KEY: "ab".repeat(32) });
  const sub = `test-${randomUUID()}`;
  try {
    const raw = await createSession({ sub, email: "a@example.com", name: "A" });
    assert.equal((await accountForSession(raw))?.sub, sub);
    assert.equal(await rotateSession(raw), null, "a new session is not rotated");

    await age(raw, "sess.created = datetime() - duration({hours:3})");
    const rotated = await rotateSession(raw);
    assert.ok(rotated, "a 3-hour-old session is rotated");
    assert.equal((await accountForSession(rotated!.raw))?.sub, sub, "the new token works");
    assert.equal((await accountForSession(raw))?.sub, sub, "the old token still works for a minute");
    assert.equal(await rotateSession(raw), null, "the old token cannot be rotated again");
    await age(raw, "sess.expires = datetime() - duration({seconds:1})");
    assert.equal(await accountForSession(raw), null, "then the old token stops");

    await age(rotated!.raw, "sess.lastSeen = datetime() - duration({minutes:20})");
    assert.equal((await accountForSession(rotated!.raw, false))?.sub, sub, "a background read still sees the session");
    await age(rotated!.raw, "sess.lastSeen = datetime() - duration({minutes:31})");
    assert.equal(await accountForSession(rotated!.raw, false), null, "background reads did not keep it alive");
    assert.equal(await accountForSession(rotated!.raw), null, "a session unused for 30 minutes ends");
  } finally { await deleteAllUserData(sub, profileFor(sub)); }
});
