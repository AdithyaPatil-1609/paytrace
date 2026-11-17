import { getNeo4jDriver, neo4jDatabase } from "./client";
import { hash, open, profileFor, randomToken, seal, SESSION_SECONDS } from "@/lib/accounts/security";

export type Account = { sub: string; email: string; name: string; profile: string; linked: boolean; lastSync: string | null; syncStatus: string | null };
const ACCOUNT_SCHEMA = [
  "CREATE CONSTRAINT paytrace_user_sub IF NOT EXISTS FOR (u:PaytraceUser) REQUIRE u.sub IS UNIQUE",
  "CREATE CONSTRAINT paytrace_session_hash IF NOT EXISTS FOR (s:PaytraceSession) REQUIRE s.hash IS UNIQUE"
];
let initialized: Promise<void> | undefined;
async function schema() {
  if (!initialized) initialized = (async () => { const s = getNeo4jDriver().session({ database:neo4jDatabase }); try { for (const q of ACCOUNT_SCHEMA) await s.run(q); } finally { await s.close(); } })().catch(e => { initialized = undefined; throw e; });
  await initialized;
}
const projection = `u.sub AS sub, u.email AS email, u.name AS name, u.profile AS profile, u.grantId IS NOT NULL AS linked, u.lastSync AS lastSync, u.syncStatus AS syncStatus`;
function toAccount(r: import("neo4j-driver").Record): Account { return { sub:r.get("sub"),email:r.get("email"),name:r.get("name"),profile:r.get("profile"),linked:r.get("linked"),lastSync:r.get("lastSync")??null,syncStatus:r.get("syncStatus")??null }; }

export async function createSession(identity: { sub: string; email: string; name: string }) {
  await schema();
  const raw = randomToken();
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { await s.run(`MERGE (u:PaytraceUser {sub:$sub}) SET u.email=$email,u.name=$name,u.profile=$profile
    CREATE (session:PaytraceSession {hash:$hash,expires:datetime($expires)}) MERGE (u)-[:HAS_SESSION]->(session)`,{...identity,profile:profileFor(identity.sub),hash:hash(raw),expires:new Date(Date.now()+SESSION_SECONDS*1000).toISOString()}); return raw; }
  finally { await s.close(); }
}
export async function accountForSession(raw?: string): Promise<Account | null> {
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { const r = await s.run(`MATCH (u:PaytraceUser)-[:HAS_SESSION]->(sess:PaytraceSession {hash:$hash}) WHERE sess.expires > datetime() RETURN ${projection}`,{hash:hash(raw)}); return r.records.length ? toAccount(r.records[0]) : null; } finally { await s.close(); }
}
export async function endSession(raw?: string) {
  if (!raw) return;
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { await s.run("MATCH (sess:PaytraceSession {hash:$hash}) DETACH DELETE sess",{hash:hash(raw)}); } finally { await s.close(); }
}

export async function storeGmailGrant(sub: string, refreshToken: string) {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { const r = await s.run(`MATCH (u:PaytraceUser {sub:$sub}) SET u.grantId=$grantId,u.gmailToken=$encrypted,u.lastSync=null,u.syncStatus='ready',u.syncLease=null,u.syncLeaseUntil=null RETURN u.sub AS sub`,{sub,grantId:randomToken(),encrypted:seal(refreshToken,`gmail:${sub}`)}); if (!r.records.length) throw new Error("Account not found"); } finally { await s.close(); }
}
export async function removeGmailGrant(sub: string) {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { const r = await s.executeWrite(async tx => { const old = await tx.run("MATCH (u:PaytraceUser {sub:$sub}) SET u.syncLock=coalesce(u.syncLock,0)+1 RETURN u.gmailToken AS token",{sub}); await tx.run("MATCH (u:PaytraceUser {sub:$sub}) REMOVE u.grantId,u.gmailToken,u.syncLease,u.syncLeaseUntil SET u.syncStatus='disconnected'",{sub}); return old.records[0]?.get("token"); }); return r ? open(r,`gmail:${sub}`) : null; } finally { await s.close(); }
}
export async function linkedAccounts() {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { const r = await s.run("MATCH (u:PaytraceUser) WHERE u.grantId IS NOT NULL AND coalesce(u.syncStatus,'ready') <> 'reauthorize' RETURN u.sub AS sub"); return r.records.map(r=>r.get("sub") as string); } finally { await s.close(); }
}
export async function claimSync(sub: string) {
  const lease = randomToken();
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try {
    const r = await s.run(`MATCH (u:PaytraceUser {sub:$sub}) SET u.syncLock=coalesce(u.syncLock,0)+1
      WITH u WHERE u.grantId IS NOT NULL AND (u.syncLeaseUntil IS NULL OR u.syncLeaseUntil < datetime())
      SET u.syncLease=$lease,u.syncLeaseUntil=datetime()+duration({minutes:10}),u.syncStatus='syncing'
      RETURN u.grantId AS grantId,u.gmailToken AS encrypted,u.profile AS profile,u.lastSync AS lastSync`,{sub,lease});
    const row = r.records[0]; if (!row) return null;
    return { sub,lease,grantId:row.get("grantId") as string,profile:row.get("profile") as string,lastSync:row.get("lastSync") as string|null,refreshToken:open(row.get("encrypted"),`gmail:${sub}`) };
  } finally { await s.close(); }
}
export async function finishSync(sub: string, lease: string, status: "ready" | "error" | "reauthorize") {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { await s.run(`MATCH (u:PaytraceUser {sub:$sub,syncLease:$lease}) SET u.syncStatus=$status, u.lastSync=CASE WHEN $status='ready' THEN $now ELSE u.lastSync END REMOVE u.syncLease,u.syncLeaseUntil`,{sub,lease,status,now:new Date().toISOString()}); } finally { await s.close(); }
}
