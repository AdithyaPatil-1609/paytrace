/**
 * Family View (Tasks 7-8) on a real, throwaway Neo4j with made-up people:
 * consent through a one-time link, read-only access checked on every request,
 * immediate revocation, expiry, single use, and clean-up on account deletion.
 */
import "../../scripts/load-env-local";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../../neo4j/client";
import { createSession } from "../../neo4j/accounts";
import { deleteAllUserData } from "../../neo4j/delete-user";
import { ingestLiveEvent } from "../../neo4j/live";
import { recordSubscriptionFact } from "../../neo4j/warnings";
import { acceptFamilyInvite, cancelFamilyInvite, createFamilyInvite, familyAccess, leaveFamilyGrant, peekFamilyInvite, readFamily, revokeFamilyGrant } from "../../neo4j/family";
import { profileFor, SESSION } from "../../server/accounts/security";
import { FAMILY_LIMITS } from "../../server/payments/rules";

const skip = !hasNeo4jConfig();
const ORIGIN = "http://localhost:3000";
const subs: string[] = [];
const env = () => Object.assign(process.env, { GOOGLE_WEB_CLIENT_ID: "test-client", GOOGLE_WEB_CLIENT_SECRET: "test-secret", PAYTRACE_APP_URL: ORIGIN, PAYTRACE_AUTH_KEY: "ab".repeat(32) });
async function person(name: string) {
  env();
  const sub = `test-family-${randomUUID()}`;
  subs.push(sub);
  const cookie = `${SESSION}=${await createSession({ sub, email: `${name.toLowerCase()}@example.test`, name: `${name} Testperson` })}`;
  return { sub, cookie, profile: profileFor(sub) };
}
async function run(query: string, params: Record<string, unknown> = {}) {
  const s = getNeo4jDriver().session({ database: neo4jDatabase });
  try { return (await s.run(query, params)).records.map(r => r.toObject()); } finally { await s.close(); }
}
async function invited(ownerSub: string) {
  const made = await createFamilyInvite(ownerSub);
  assert.ok(made.ok);
  return made.token;
}
const call = async (path: string, cookie: string, body: unknown) => {
  const { POST } = await import(`../../web/app/api/family/${path}/route`);
  return POST(new NextRequest(`${ORIGIN}/api/family/${path}`, { method: "POST", headers: { cookie, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) })) as Promise<Response>;
};

after(async () => {
  if (skip) return;
  for (const sub of subs) await deleteAllUserData(sub, profileFor(sub)).catch(() => undefined);
  await getNeo4jDriver().close();
});

test("an owner's link, accepted by a signed-in viewer, creates one read-only CAN_VIEW", { skip }, async () => {
  const owner = await person("Asha"), viewer = await person("Ravi");
  await ingestLiveEvent(owner.profile, { source: "email", kind: "debit_posted", merchant: "FAMILYFLIX", amountPaise: 49900, date: "2026-09-05", reference: "UPI1234567", sourceId: "fam-1" });
  await ingestLiveEvent(owner.profile, { source: "email", kind: "debit_posted", merchant: "FAMILYFLIX", amountPaise: 49900, date: "2026-10-05", reference: "UPI1234568", sourceId: "fam-2" });
  const token = await invited(owner.sub);
  assert.equal((await run("MATCH (i:FamilyInvite) WHERE i.hash = $raw RETURN count(i) AS n", { raw: token }))[0].n.toNumber(), 0, "the raw token is never stored");

  const seen = await peekFamilyInvite(viewer.sub, token);
  assert.deepEqual(seen, { ok: true, owner: "Asha", scope: "recurring_summary", grantDays: FAMILY_LIMITS.grantDays });
  assert.equal((await run("MATCH (:PaytraceUser {sub:$v})-[g:CAN_VIEW]->() RETURN count(g) AS n", { v: viewer.sub }))[0].n.toNumber(), 0, "looking at an invite grants nothing");

  const consentMissing = await call("accept", viewer.cookie, { token });
  assert.equal(consentMissing.status, 400, "acceptance needs explicit consent");
  const accepted = await call("accept", viewer.cookie, { token, consent: true });
  assert.equal(accepted.status, 200);
  const { grantId, owner: ownerName } = await accepted.json();
  assert.equal(ownerName, "Asha");
  const grant = await run("MATCH (:PaytraceUser {sub:$v})-[g:CAN_VIEW]->(:PaytraceUser {sub:$o}) RETURN g.id AS id, g.scope AS scope, g.createdAt IS NOT NULL AS created, g.expiresAt > datetime() AS live", { v: viewer.sub, o: owner.sub });
  assert.deepEqual(grant.map(g => [g.id, g.scope, g.created, g.live]), [[grantId, "recurring_summary", true, true]]);

  const view = await call("summary", viewer.cookie, { grantId });
  assert.equal(view.status, 200);
  const summary = await view.json();
  assert.equal(summary.owner, "Asha");
  assert.equal(summary.payments[0].merchant, "FAMILYFLIX");
  assert.deepEqual(Object.keys(summary.payments[0]).sort(), ["amount", "annualCost", "cadence", "merchant", "nextCharge", "product", "spendGroup"]);
  const text = JSON.stringify(summary);
  for (const secret of ["UPI1234567", owner.profile, owner.sub, "asha@example.test", "fam-1"]) assert.ok(!text.includes(secret), `no ${secret}`);

  const overview = await readFamily(owner.sub);
  assert.deepEqual(overview.viewers.map(v => [v.name, v.email]), [["Ravi", "ravi@example.test"]]);
  assert.deepEqual((await readFamily(viewer.sub)).sharedWithMe.map(g => g.owner), ["Asha"]);
});

test("the viewer sees the owner's warnings, read-only and without evidence or references", { skip }, async () => {
  const owner = await person("Rhea"), viewer = await person("Om");
  const events = [
    { source: "email", kind: "debit_posted", merchant: "QUIETFLIX", amountPaise: 49900, date: "2026-08-05", reference: "UPIQUIET1", sourceId: "fam-q1" },
    { source: "email", kind: "debit_posted", merchant: "QUIETFLIX", amountPaise: 64900, date: "2026-09-05", reference: "UPIQUIET2", sourceId: "fam-q2" },
    { source: "email", kind: "debit_posted", merchant: "MANDFLIX", amountPaise: 9900, date: "2026-08-05", reference: "MNDTSECRET9", sourceId: "fam-m1" },
    { source: "email", kind: "mandate_cancelled", merchant: "MANDFLIX", amountPaise: null, date: "2026-08-20", reference: "MNDTSECRET9", sourceId: "fam-m2" },
    { source: "email", kind: "debit_posted", merchant: "MANDFLIX", amountPaise: 9900, date: "2026-09-05", reference: "MNDTSECRET9", sourceId: "fam-m3" }
  ] as const;
  for (const e of events) await ingestLiveEvent(owner.profile, { ...e });
  const accepted = await acceptFamilyInvite(viewer.sub, await invited(owner.sub));
  assert.ok(accepted.ok);
  const view = await call("summary", viewer.cookie, { grantId: accepted.grantId });
  assert.equal(view.status, 200);
  const summary = await view.json();
  assert.equal(summary.alertsIncomplete, false);
  const kinds = summary.alerts.map((a: { kind: string; merchant: string }) => `${a.kind}:${a.merchant}`);
  assert.ok(kinds.includes("silent_rise:QUIETFLIX"), kinds.join());
  assert.ok(kinds.includes("charged_after_cancel:MANDFLIX"), kinds.join());
  for (const a of summary.alerts) assert.deepEqual(Object.keys(a).sort(), ["date", "detail", "kind", "level", "merchant", "title"]);
  const text = JSON.stringify(summary);
  for (const secret of ["UPIQUIET1", "MNDTSECRET9", "fam-q1", "fam-m2", owner.profile, owner.sub, "rhea@example.test"]) assert.ok(!text.includes(secret), `no ${secret}`);

  // Facts the owner records later reach the viewer on the next check.
  const s = getNeo4jDriver().session({ database: neo4jDatabase });
  const sub = await s.run("MATCH (:LiveProfile {id:$p})-[:HAS_SUBSCRIPTION]->(x {merchantKey:'QUIETFLIX'}) RETURN x.id AS id", { p: owner.profile }).finally(() => s.close());
  await recordSubscriptionFact(owner.profile, String(sub.records[0].get("id")), { usedOn: "2026-05-01" });
  const again = await (await call("summary", viewer.cookie, { grantId: accepted.grantId })).json();
  assert.ok(again.alerts.some((a: { kind: string; merchant: string }) => a.kind === "unused" && a.merchant === "QUIETFLIX"));

  assert.equal(await revokeFamilyGrant(owner.sub, accepted.grantId), true);
  assert.equal((await call("summary", viewer.cookie, { grantId: accepted.grantId })).status, 404, "no warnings after access ends");
});

test("an invite works once, never for its owner, and not after it expires or is cancelled", { skip }, async () => {
  const owner = await person("Meera"), viewer = await person("Kiran"), other = await person("Dev");
  const token = await invited(owner.sub);
  assert.deepEqual(await acceptFamilyInvite(owner.sub, token), { ok: false, reason: "own_invite" });
  assert.equal((await acceptFamilyInvite(viewer.sub, token)).ok, true);
  assert.deepEqual(await acceptFamilyInvite(other.sub, token), { ok: false, reason: "invalid" }, "a used link cannot be reused by anyone");
  assert.deepEqual(await peekFamilyInvite(other.sub, token), { ok: false, reason: "invalid" });

  const late = await invited(owner.sub);
  await run("MATCH (:PaytraceUser {sub:$o})-[:CREATED_INVITE]->(i:FamilyInvite) WHERE i.usedAt IS NULL SET i.expiresAt = datetime() - duration({minutes:1})", { o: owner.sub });
  assert.deepEqual(await acceptFamilyInvite(other.sub, late), { ok: false, reason: "invalid" }, "an expired link fails");

  const made = await createFamilyInvite(owner.sub);
  assert.ok(made.ok);
  assert.equal(await cancelFamilyInvite(viewer.sub, made.id), false, "only the owner can cancel");
  assert.equal(await cancelFamilyInvite(owner.sub, made.id), true);
  assert.deepEqual(await acceptFamilyInvite(other.sub, made.token), { ok: false, reason: "invalid" });
  // A made-up token looks exactly like a used or expired one: nothing to learn by guessing.
  assert.deepEqual(await peekFamilyInvite(other.sub, "A".repeat(43)), { ok: false, reason: "invalid" });
});

test("two people racing to accept one link: exactly one gets access", { skip }, async () => {
  const owner = await person("Nila"), a = await person("Arun"), b = await person("Bala");
  const token = await invited(owner.sub);
  const results = await Promise.all([acceptFamilyInvite(a.sub, token), acceptFamilyInvite(b.sub, token)]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal((await run("MATCH (:PaytraceUser)-[g:CAN_VIEW]->(:PaytraceUser {sub:$o}) RETURN count(g) AS n", { o: owner.sub }))[0].n.toNumber(), 1);
});

test("only the owner can revoke, revocation is immediate, and expired access is refused", { skip }, async () => {
  const owner = await person("Tara"), viewer = await person("Sam"), stranger = await person("Lee");
  const accepted = await acceptFamilyInvite(viewer.sub, await invited(owner.sub));
  assert.ok(accepted.ok);
  const { grantId } = accepted;

  assert.equal(await familyAccess(stranger.sub, grantId), null, "a grant id is useless to anyone else");
  assert.equal((await call("summary", stranger.cookie, { grantId })).status, 404);
  assert.equal(await revokeFamilyGrant(viewer.sub, grantId), false, "the viewer cannot revoke as if they were the owner");
  assert.equal(await revokeFamilyGrant(stranger.sub, grantId), false);
  assert.equal((await call("revoke", stranger.cookie, { grantId })).status, 404);
  assert.equal((await call("summary", viewer.cookie, { grantId })).status, 200, "still allowed before the owner acts");

  const revoked = await call("revoke", owner.cookie, { grantId });
  assert.equal(revoked.status, 200);
  assert.equal(await familyAccess(viewer.sub, grantId), null);
  assert.equal((await call("summary", viewer.cookie, { grantId })).status, 404, "the very next request is refused");
  assert.equal((await readFamily(owner.sub)).viewers.length, 0);

  const again = await acceptFamilyInvite(viewer.sub, await invited(owner.sub));
  assert.ok(again.ok);
  await run("MATCH (:PaytraceUser {sub:$v})-[g:CAN_VIEW]->() SET g.expiresAt = datetime() - duration({seconds:1})", { v: viewer.sub });
  assert.equal(await familyAccess(viewer.sub, again.grantId), null, "expired access is refused");
  assert.equal((await readFamily(viewer.sub)).sharedWithMe.length, 0, "and cleared from the list");

  const third = await acceptFamilyInvite(viewer.sub, await invited(owner.sub));
  assert.ok(third.ok);
  assert.equal(await leaveFamilyGrant(viewer.sub, third.grantId), true, "the viewer can stop viewing");
  assert.equal(await familyAccess(viewer.sub, third.grantId), null);
});

test("requests need a session, the same site and valid input", { skip }, async () => {
  const owner = await person("Uma");
  const { POST } = await import("../../web/app/api/family/invite/route");
  const crossSite = await POST(new NextRequest(`${ORIGIN}/api/family/invite`, { method: "POST", headers: { cookie: owner.cookie, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }));
  assert.equal(crossSite.status, 403);
  const noSession = await POST(new NextRequest(`${ORIGIN}/api/family/invite`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: "{}" }));
  assert.equal(noSession.status, 401);
  const madeUp = await call("invite", owner.cookie, { email: "someone@example.test" });
  assert.equal(madeUp.status, 400, "no email lookup: the route accepts no fields");
  const ok = await call("invite", owner.cookie, {});
  assert.equal(ok.status, 200);
  const { link } = await ok.json();
  assert.match(link, /^http:\/\/localhost:3000\/family\/accept#invite=[A-Za-z0-9_-]{43}$/, "the token sits after # so it never reaches server logs");
  for (let i = 1; i < FAMILY_LIMITS.maxPendingInvites; i++) assert.ok((await createFamilyInvite(owner.sub)).ok);
  assert.deepEqual(await createFamilyInvite(owner.sub), { ok: false, reason: "too_many" });
});

test("deleting an account removes its invites and family access both ways", { skip }, async () => {
  const owner = await person("Ira"), viewer = await person("Joy");
  const accepted = await acceptFamilyInvite(viewer.sub, await invited(owner.sub));
  assert.ok(accepted.ok);
  await createFamilyInvite(owner.sub);
  await deleteAllUserData(owner.sub, owner.profile);
  assert.equal(await familyAccess(viewer.sub, accepted.grantId), null);
  assert.equal((await run("MATCH (:PaytraceUser {sub:$v})-[g:CAN_VIEW]->() RETURN count(g) AS n", { v: viewer.sub }))[0].n.toNumber(), 0);
  assert.equal((await run("MATCH (i:FamilyInvite) WHERE NOT EXISTS { (:PaytraceUser)-[:CREATED_INVITE]->(i) } RETURN count(i) AS n"))[0].n.toNumber(), 0, "no orphaned invites");

  const owner2 = await person("Kai"), viewer2 = await person("Lin");
  const second = await acceptFamilyInvite(viewer2.sub, await invited(owner2.sub));
  assert.ok(second.ok);
  await deleteAllUserData(viewer2.sub, viewer2.profile);
  assert.equal((await readFamily(owner2.sub)).viewers.length, 0, "a deleted viewer's access is gone");
});
