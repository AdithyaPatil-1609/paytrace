/**
 * Family View in the personal graph:
 *   (:PaytraceUser owner)-[:CREATED_INVITE]->(:FamilyInvite {hash, expiresAt, usedAt})
 *   (:PaytraceUser viewer)-[:CAN_VIEW {id, scope, createdAt, expiresAt}]->(:PaytraceUser owner)
 * The owner makes a one-time link and shares it themselves, so nobody can look
 * up who has an account. CAN_VIEW exists only after the viewer, signed in,
 * accepts. Every family request re-checks CAN_VIEW here; nothing is cached.
 */
import { randomUUID } from "node:crypto";
import { getNeo4jDriver, neo4jDatabase } from "./client";
import { hash, randomToken } from "@/server/accounts/security";
import { FAMILY_SCOPE, firstName } from "@/server/accounts/family";
import { FAMILY_LIMITS as F } from "@/server/payments/rules";

export const FAMILY_SCHEMA = [
  "CREATE CONSTRAINT family_invite_hash IF NOT EXISTS FOR (i:FamilyInvite) REQUIRE i.hash IS UNIQUE",
  "CREATE CONSTRAINT family_invite_id IF NOT EXISTS FOR (i:FamilyInvite) REQUIRE i.id IS UNIQUE",
  "CREATE INDEX family_grant_id IF NOT EXISTS FOR ()-[g:CAN_VIEW]-() ON (g.id)"
];
let ready: Promise<void> | undefined;
async function ensureFamilySchema() {
  if (!ready) ready = (async () => {
    const s = getNeo4jDriver().session({ database: neo4jDatabase });
    try { for (const q of FAMILY_SCHEMA) await s.run(q); } finally { await s.close(); }
  })().catch(e => { ready = undefined; throw e; });
  return ready;
}

const session = (mode: "READ" | "WRITE" = "WRITE") => getNeo4jDriver().session({ database: neo4jDatabase, defaultAccessMode: mode });

export type FamilyFailure = "invalid" | "own_invite" | "too_many";

/** A new one-time invite. The raw token is returned once and only its hash is stored. */
export async function createFamilyInvite(ownerSub: string): Promise<{ ok: true; id: string; token: string; expiresAt: string } | { ok: false; reason: "too_many" | "invalid" }> {
  await ensureFamilySchema();
  const token = randomToken(), id = randomUUID();
  const s = session();
  try {
    return await s.executeWrite(async tx => {
      const owner = await tx.run(`MATCH (o:PaytraceUser {sub:$sub}) SET o.familyLock = coalesce(o.familyLock, 0) + 1
        RETURN COUNT { (o)-[:CREATED_INVITE]->(i:FamilyInvite) WHERE i.usedAt IS NULL AND i.expiresAt > datetime() } AS pending`, { sub: ownerSub });
      if (!owner.records.length) return { ok: false as const, reason: "invalid" as const };
      if (Number(owner.records[0].get("pending")) >= F.maxPendingInvites) return { ok: false as const, reason: "too_many" as const };
      const made = await tx.run(`MATCH (o:PaytraceUser {sub:$sub})
        CREATE (o)-[:CREATED_INVITE]->(i:FamilyInvite {id:$id, hash:$hash, scope:$scope, createdAt:datetime(), expiresAt:datetime() + duration({hours:$hours})})
        RETURN toString(i.expiresAt) AS expiresAt`, { sub: ownerSub, id, hash: hash(token), scope: FAMILY_SCOPE, hours: F.inviteHours });
      return { ok: true as const, id, token, expiresAt: String(made.records[0].get("expiresAt")) };
    });
  } finally { await s.close(); }
}

/** What the signed-in viewer is about to accept. Every failure looks the same. */
export async function peekFamilyInvite(viewerSub: string, token: string): Promise<{ ok: true; owner: string; scope: string; grantDays: number } | { ok: false; reason: FamilyFailure }> {
  await ensureFamilySchema();
  const s = session("READ");
  try {
    const r = await s.executeRead(tx => tx.run(`MATCH (o:PaytraceUser)-[:CREATED_INVITE]->(i:FamilyInvite {hash:$hash})
      WHERE i.usedAt IS NULL AND i.expiresAt > datetime()
      RETURN o.name AS name, o.sub = $viewer AS own, i.scope AS scope`, { hash: hash(token), viewer: viewerSub }));
    const row = r.records[0];
    if (!row) return { ok: false, reason: "invalid" };
    if (row.get("own")) return { ok: false, reason: "own_invite" };
    return { ok: true, owner: firstName(row.get("name")), scope: String(row.get("scope")), grantDays: F.grantDays };
  } finally { await s.close(); }
}

/**
 * The viewer accepts: the invite is used up and CAN_VIEW is created, in one
 * transaction. The invite node is locked first, so two accepts of one link
 * cannot both succeed.
 */
export async function acceptFamilyInvite(viewerSub: string, token: string): Promise<{ ok: true; grantId: string; owner: string; expiresAt: string } | { ok: false; reason: FamilyFailure }> {
  await ensureFamilySchema();
  const s = session();
  try {
    return await s.executeWrite(async tx => {
      const locked = await tx.run("MATCH (i:FamilyInvite {hash:$hash}) SET i.lock = coalesce(i.lock, 0) + 1 RETURN i.id AS id", { hash: hash(token) });
      if (!locked.records.length) return { ok: false as const, reason: "invalid" as const };
      const check = await tx.run(`MATCH (o:PaytraceUser)-[:CREATED_INVITE]->(i:FamilyInvite {hash:$hash})
        MATCH (v:PaytraceUser {sub:$viewer})
        WHERE i.usedAt IS NULL AND i.expiresAt > datetime()
        RETURN o.sub = v.sub AS own, o.name AS name,
          COUNT { (:PaytraceUser)-[g:CAN_VIEW]->(o) WHERE g.expiresAt > datetime() } AS viewers,
          EXISTS { (v)-[g:CAN_VIEW]->(o) WHERE g.expiresAt > datetime() } AS already`, { hash: hash(token), viewer: viewerSub });
      const row = check.records[0];
      if (!row) return { ok: false as const, reason: "invalid" as const };
      if (row.get("own")) return { ok: false as const, reason: "own_invite" as const };
      if (!row.get("already") && Number(row.get("viewers")) >= F.maxViewers) return { ok: false as const, reason: "too_many" as const };
      const grant = await tx.run(`MATCH (o:PaytraceUser)-[:CREATED_INVITE]->(i:FamilyInvite {hash:$hash})
        MATCH (v:PaytraceUser {sub:$viewer})
        SET i.usedAt = datetime()
        MERGE (v)-[g:CAN_VIEW]->(o)
          ON CREATE SET g.id = $grantId, g.createdAt = datetime()
        SET g.scope = i.scope, g.expiresAt = datetime() + duration({days:$days})
        RETURN g.id AS grantId, toString(g.expiresAt) AS expiresAt`, { hash: hash(token), viewer: viewerSub, grantId: randomUUID(), days: F.grantDays });
      const g = grant.records[0];
      return { ok: true as const, grantId: String(g.get("grantId")), owner: firstName(row.get("name")), expiresAt: String(g.get("expiresAt")) };
    });
  } finally { await s.close(); }
}

export type FamilyOverview = {
  viewers: { grantId: string; name: string; email: string; since: string; until: string }[];
  invites: { id: string; createdAt: string; expiresAt: string }[];
  sharedWithMe: { grantId: string; owner: string; until: string }[];
};

/** Both sides for one person. Expired grants and old invites are removed first. */
export async function readFamily(sub: string): Promise<FamilyOverview> {
  await ensureFamilySchema();
  const s = session();
  try {
    return await s.executeWrite(async tx => {
      await tx.run(`MATCH (u:PaytraceUser {sub:$sub})
        OPTIONAL MATCH (u)-[g:CAN_VIEW]-(:PaytraceUser) WHERE g.expiresAt <= datetime()
        WITH u, collect(g) AS old FOREACH (x IN old | DELETE x)
        WITH u OPTIONAL MATCH (u)-[:CREATED_INVITE]->(i:FamilyInvite) WHERE i.usedAt IS NOT NULL OR i.expiresAt <= datetime()
        WITH collect(i) AS spent FOREACH (x IN spent | DETACH DELETE x)`, { sub });
      const r = await tx.run(`MATCH (u:PaytraceUser {sub:$sub})
        RETURN [(v:PaytraceUser)-[g:CAN_VIEW]->(u) | {grantId:g.id, name:v.name, email:v.email, since:toString(g.createdAt), until:toString(g.expiresAt)}] AS viewers,
          [(u)-[:CREATED_INVITE]->(i:FamilyInvite) | {id:i.id, createdAt:toString(i.createdAt), expiresAt:toString(i.expiresAt)}] AS invites,
          [(u)-[g:CAN_VIEW]->(o:PaytraceUser) | {grantId:g.id, owner:o.name, until:toString(g.expiresAt)}] AS shared`, { sub });
      const row = r.records[0];
      if (!row) return { viewers: [], invites: [], sharedWithMe: [] };
      return {
        viewers: (row.get("viewers") as Record<string, unknown>[]).map(v => ({ grantId: String(v.grantId), name: firstName(v.name), email: String(v.email ?? ""), since: String(v.since), until: String(v.until) })),
        invites: (row.get("invites") as Record<string, unknown>[]).map(i => ({ id: String(i.id), createdAt: String(i.createdAt), expiresAt: String(i.expiresAt) })),
        sharedWithMe: (row.get("shared") as Record<string, unknown>[]).map(g => ({ grantId: String(g.grantId), owner: firstName(g.owner), until: String(g.until) }))
      };
    });
  } finally { await s.close(); }
}

/**
 * The authorization check for every family request: an unexpired CAN_VIEW from
 * this viewer, with this id, in the read-only scope. Returns the owner's
 * profile for the summary, or null. Never cached.
 */
export async function familyAccess(viewerSub: string, grantId: string): Promise<{ ownerProfile: string; owner: string; expiresAt: string } | null> {
  await ensureFamilySchema();
  const s = session("READ");
  try {
    const r = await s.executeRead(tx => tx.run(`MATCH (v:PaytraceUser {sub:$viewer})-[g:CAN_VIEW {id:$grantId}]->(o:PaytraceUser)
      WHERE g.expiresAt > datetime() AND g.scope = $scope AND o.profile IS NOT NULL AND o.sub <> v.sub
      RETURN o.profile AS profile, o.name AS name, toString(g.expiresAt) AS expiresAt`, { viewer: viewerSub, grantId, scope: FAMILY_SCOPE }));
    const row = r.records[0];
    return row ? { ownerProfile: String(row.get("profile")), owner: firstName(row.get("name")), expiresAt: String(row.get("expiresAt")) } : null;
  } finally { await s.close(); }
}

/** The owner removes one viewer's access. Only the owner's own grants match. */
export async function revokeFamilyGrant(ownerSub: string, grantId: string) {
  const s = session();
  try {
    const r = await s.executeWrite(tx => tx.run("MATCH (:PaytraceUser)-[g:CAN_VIEW {id:$grantId}]->(:PaytraceUser {sub:$owner}) DELETE g RETURN count(*) AS removed", { owner: ownerSub, grantId }));
    return Number(r.records[0]?.get("removed") ?? 0) > 0;
  } finally { await s.close(); }
}

/** The viewer stops viewing someone. */
export async function leaveFamilyGrant(viewerSub: string, grantId: string) {
  const s = session();
  try {
    const r = await s.executeWrite(tx => tx.run("MATCH (:PaytraceUser {sub:$viewer})-[g:CAN_VIEW {id:$grantId}]->(:PaytraceUser) DELETE g RETURN count(*) AS removed", { viewer: viewerSub, grantId }));
    return Number(r.records[0]?.get("removed") ?? 0) > 0;
  } finally { await s.close(); }
}

/** The owner cancels an invite link that has not been used. */
export async function cancelFamilyInvite(ownerSub: string, inviteId: string) {
  const s = session();
  try {
    const r = await s.executeWrite(tx => tx.run("MATCH (:PaytraceUser {sub:$owner})-[:CREATED_INVITE]->(i:FamilyInvite {id:$id}) DETACH DELETE i RETURN count(*) AS removed", { owner: ownerSub, id: inviteId }));
    return Number(r.records[0]?.get("removed") ?? 0) > 0;
  } finally { await s.close(); }
}

export const FAMILY_FAILURE_TEXT: Record<FamilyFailure, string> = {
  invalid: "This invite link is not valid. It may have expired, been used already, or been cancelled. Ask for a new one.",
  own_invite: "This is your own invite link. Send it to the person you want to share with.",
  too_many: "This account has reached the limit for family sharing. Ask the owner to remove someone first."
};
