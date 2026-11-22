import { getNeo4jDriver, neo4jDatabase } from "./client";
import { hash, open, profileFor, randomToken, seal, SESSION_IDLE_SECONDS, SESSION_ROTATE_SECONDS, SESSION_SECONDS } from "@/server/accounts/security";
import { AccountError, type AccountErrorCode } from "@/server/accounts/errors";

export type Account = { sub: string; email: string; name: string; profile: string; linked: boolean; lastSync: string | null; syncStatus: string | null; syncError: string | null; iphone: boolean;
  /** Sign-up: the connected Gmail address (may differ from the sign-in email), the last 4 digits of a verified phone, and the steps done. */
  gmailEmail: string | null; phoneLast4: string | null; phoneStep: "verified" | "skipped" | null; smsConsent: "yes" | "no" | null; signupDone: boolean };
export type SyncProgress = { scanned: number; accepted: number; estimate: number; at: string };
const ACCOUNT_SCHEMA = [
  "CREATE CONSTRAINT paytrace_user_sub IF NOT EXISTS FOR (u:PaytraceUser) REQUIRE u.sub IS UNIQUE",
  "CREATE CONSTRAINT paytrace_session_hash IF NOT EXISTS FOR (s:PaytraceSession) REQUIRE s.hash IS UNIQUE",
  // iPhone Shortcut requests look the account up by token hash. The unique constraint brings its own index;
  // a separate CREATE INDEX with the same name made this constraint fail on every fresh database.
  "CREATE CONSTRAINT paytrace_user_ios_token IF NOT EXISTS FOR (u:PaytraceUser) REQUIRE u.iosTokenHash IS UNIQUE"
];
let initialized: Promise<void> | undefined;
async function schema() {
  if (!initialized) initialized = (async () => { const s = getNeo4jDriver().session({ database:neo4jDatabase }); try { for (const q of ACCOUNT_SCHEMA) await s.run(q); } finally { await s.close(); } })().catch(e => { initialized = undefined; throw e; });
  await initialized;
}
const projection = `u.sub AS sub, u.email AS email, coalesce(u.fullName, u.name) AS name, u.profile AS profile, u.grantId IS NOT NULL AS linked, u.lastSync AS lastSync, u.syncStatus AS syncStatus, u.syncError AS syncError, u.iosTokenHash IS NOT NULL AS iphone,
  CASE WHEN u.grantId IS NULL THEN null ELSE coalesce(u.gmailEmail, u.email) END AS gmailEmail, u.phoneLast4 AS phoneLast4, u.phoneStep AS phoneStep, u.smsConsent AS smsConsent, coalesce(u.signupDone, false) AS signupDone`;
function toAccount(r: import("neo4j-driver").Record): Account { return { sub:r.get("sub"),email:r.get("email"),name:r.get("name"),profile:r.get("profile"),linked:r.get("linked"),lastSync:r.get("lastSync")??null,syncStatus:r.get("syncStatus")??null,syncError:r.get("syncError")??null,iphone:r.get("iphone")===true,
  gmailEmail:r.get("gmailEmail")??null,phoneLast4:r.get("phoneLast4")??null,phoneStep:r.get("phoneStep")??null,smsConsent:r.get("smsConsent")??null,signupDone:r.get("signupDone")===true }; }

export async function createSession(identity: { sub: string; email: string; name: string }) {
  await schema();
  const raw = randomToken();
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { await s.run(`MERGE (u:PaytraceUser {sub:$sub}) SET u.email=$email,u.name=$name,u.profile=$profile
    CREATE (session:PaytraceSession {hash:$hash,expires:datetime($expires),created:datetime(),lastSeen:datetime()}) MERGE (u)-[:HAS_SESSION]->(session)`,{...identity,profile:profileFor(identity.sub),hash:hash(raw),expires:new Date(Date.now()+SESSION_SECONDS*1000).toISOString()}); return raw; }
  finally { await s.close(); }
}
/** touch=false is for background refreshes: they read the session without counting as use. */
export async function accountForSession(raw?: string, touch = true): Promise<Account | null> {
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  // Valid only before its absolute expiry (12 hours) and while used in the last 30 minutes.
  // lastSeen is written at most every 2 minutes, so reads stay cheap.
  try { const r = await s.run(`MATCH (u:PaytraceUser)-[:HAS_SESSION]->(sess:PaytraceSession {hash:$hash})
      WHERE sess.expires > datetime()
        // Sessions made before this rule (7-day cookies) are also held to 12 hours from sign-in.
        AND coalesce(sess.created, sess.expires - duration({days:7})) > datetime() - duration({seconds:$absolute})
        AND coalesce(sess.lastSeen, sess.created, sess.expires - duration({days:7})) > datetime() - duration({seconds:$idle})
      FOREACH (due IN CASE WHEN $touch AND coalesce(sess.lastSeen, datetime('1970-01-01T00:00:00Z')) < datetime() - duration({minutes:2}) THEN [1] ELSE [] END | SET sess.lastSeen = datetime())
      RETURN ${projection}`,{hash:hash(raw),idle:SESSION_IDLE_SECONDS,absolute:SESSION_SECONDS,touch}); return r.records.length ? toAccount(r.records[0]) : null; } finally { await s.close(); }
}
export async function endSession(raw?: string) {
  if (!raw) return;
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { await s.run("MATCH (sess:PaytraceSession {hash:$hash}) DETACH DELETE sess",{hash:hash(raw)}); } finally { await s.close(); }
}

/** gmailEmail is set when the connected Gmail is not the sign-in account ("add another Gmail"). */
export async function storeGmailGrant(sub: string, refreshToken: string, gmailEmail: string | null = null) {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { const r = await s.run(`MATCH (u:PaytraceUser {sub:$sub}) SET u.grantId=$grantId,u.gmailToken=$encrypted,u.gmailEmail=$gmailEmail,u.lastSync=null,u.syncStatus='ready',u.syncError=null,u.syncLease=null,u.syncLeaseUntil=null,u.syncProgress=null RETURN u.sub AS sub`,{sub,grantId:randomToken(),encrypted:seal(refreshToken,`gmail:${sub}`),gmailEmail}); if (!r.records.length) throw new Error("Account not found"); } finally { await s.close(); }
}
export async function removeGmailGrant(sub: string) {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { const r = await s.executeWrite(async tx => { const old = await tx.run("MATCH (u:PaytraceUser {sub:$sub}) SET u.syncLock=coalesce(u.syncLock,0)+1 RETURN u.gmailToken AS token",{sub}); await tx.run("MATCH (u:PaytraceUser {sub:$sub}) REMOVE u.grantId,u.gmailToken,u.gmailEmail,u.syncProgress,u.syncLease,u.syncLeaseUntil,u.syncError SET u.syncStatus='disconnected'",{sub}); return old.records[0]?.get("token"); }); return r ? open(r,`gmail:${sub}`) : null; } finally { await s.close(); }
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
      SET u.syncLease=$lease,u.syncLeaseUntil=datetime()+duration({minutes:10}),u.syncStatus='syncing',u.syncError=null,u.syncProgress=null
      RETURN u.grantId AS grantId,u.gmailToken AS encrypted,u.profile AS profile,u.lastSync AS lastSync`,{sub,lease});
    const row = r.records[0]; if (!row) return null;
    let refreshToken:string;
    try { refreshToken=open(row.get("encrypted"),`gmail:${sub}`); }
    catch {
      // An old encryption key or invalid grant must not leave the account locked for 10 minutes.
      await s.run(`MATCH (u:PaytraceUser {sub:$sub,syncLease:$lease}) SET u.syncStatus='reauthorize',u.syncError='gmail-reconnect' REMOVE u.syncLease,u.syncLeaseUntil`,{sub,lease});
      throw new AccountError("gmail-reconnect");
    }
    return { sub,lease,grantId:row.get("grantId") as string,profile:row.get("profile") as string,lastSync:row.get("lastSync") as string|null,refreshToken };
  } finally { await s.close(); }
}
export async function renewSyncLease(sub:string,lease:string) {
  const s=getNeo4jDriver().session({database:neo4jDatabase});
  try {
    const r=await s.run(`MATCH (u:PaytraceUser {sub:$sub}) SET u.syncLock=coalesce(u.syncLock,0)+1 WITH u WHERE u.syncLease=$lease AND u.grantId IS NOT NULL AND u.syncLeaseUntil>datetime() SET u.syncLeaseUntil=datetime()+duration({minutes:10}) RETURN u.sub AS sub`,{sub,lease});
    if (!r.records.length) throw new AccountError("gmail-disconnected");
  } finally { await s.close(); }
}
export async function finishSync(sub: string, lease: string, status: "ready" | "error" | "reauthorize", errorCode?:AccountErrorCode) {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { await s.run(`MATCH (u:PaytraceUser {sub:$sub,syncLease:$lease}) SET u.syncStatus=$status,u.syncError=$error, u.lastSync=CASE WHEN $status='ready' THEN $now ELSE u.lastSync END REMOVE u.syncLease,u.syncLeaseUntil`,{sub,lease,status,error:errorCode??null,now:new Date().toISOString()}); } finally { await s.close(); }
}

/** Replaces the account's iPhone token. The caller shows the token once; only its hash is kept. */
export async function setIosToken(sub: string, token: string) {
  await schema();
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { await s.run("MATCH (u:PaytraceUser {sub:$sub}) SET u.iosTokenHash=$hash,u.iosTokenAt=datetime()",{sub,hash:hash(token)}); } finally { await s.close(); }
}
export async function removeIosToken(sub: string) {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { await s.run("MATCH (u:PaytraceUser {sub:$sub}) REMOVE u.iosTokenHash,u.iosTokenAt",{sub}); } finally { await s.close(); }
}
/** The profile an iPhone token belongs to, or null. Never read from the request body. */
export async function profileForIosToken(token: string): Promise<string | null> {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { const r = await s.run("MATCH (u:PaytraceUser {iosTokenHash:$hash}) RETURN u.profile AS profile",{hash:hash(token)}); return (r.records[0]?.get("profile") as string | undefined) ?? null; } finally { await s.close(); }
}
/** Ends every session of this person, on every device (plan card S3, "sign out everywhere"). */
export async function endAllSessions(sub: string) {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { await s.run("MATCH (:PaytraceUser {sub:$sub})-[:HAS_SESSION]->(sess:PaytraceSession) DETACH DELETE sess",{sub}); } finally { await s.close(); }
}
/** Records which consent text the person agreed to, and when (DPDP evidence of consent). */
export async function recordGmailConsent(sub: string, version: string) {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { await s.run("MATCH (u:PaytraceUser {sub:$sub}) SET u.gmailConsentVersion=$version,u.gmailConsentAt=datetime()",{sub,version}); } finally { await s.close(); }
}

/**
 * Session rotation (plan card S3): a session older than 2 hours gets a new
 * random token with the same absolute expiry. The old token keeps working for
 * one more minute, so requests already in flight do not sign the person out.
 * Returns the new token and its expiry, or null when no rotation is due.
 */
export async function rotateSession(raw?: string): Promise<{ raw: string; expires: string } | null> {
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const fresh = randomToken();
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try {
    const r = await s.run(`MATCH (u:PaytraceUser)-[:HAS_SESSION]->(old:PaytraceSession {hash:$hash})
      WHERE old.expires > datetime() + duration({minutes:1}) AND coalesce(old.created, datetime('1970-01-01T00:00:00Z')) < datetime() - duration({seconds:$rotate})
      WITH u, old, old.expires AS keep
      CREATE (u)-[:HAS_SESSION]->(:PaytraceSession {hash:$fresh, expires:keep, created:datetime(), lastSeen:datetime()})
      SET old.expires = datetime() + duration({minutes:1})
      RETURN toString(keep) AS expires`,
      {hash:hash(raw),fresh:hash(fresh),rotate:SESSION_ROTATE_SECONDS});
    const expires = r.records[0]?.get("expires") as string | undefined;
    return expires ? { raw: fresh, expires } : null;
  } finally { await s.close(); }
}

/* ---------- Sign-up (name, phone, SMS consent, progress) ---------- */

async function writeUser(sub: string, cypher: string, params: Record<string, unknown> = {}) {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { const r = await s.run(`MATCH (u:PaytraceUser {sub:$sub}) ${cypher} RETURN u.sub AS sub`,{sub,...params}); if (!r.records.length) throw new Error("Account not found"); }
  finally { await s.close(); }
}
/** The name typed on the sign-up page, shown instead of the Google profile name. */
export async function setFullName(sub: string, fullName: string) {
  await writeUser(sub, "SET u.fullName=$fullName", {fullName});
}
/** A phone number proven by an SMS code. Kept encrypted; only the last 4 digits are readable. */
export async function setVerifiedPhone(sub: string, phoneE164: string) {
  await writeUser(sub, "SET u.phone=$sealed,u.phoneLast4=$last4,u.phoneStep='verified',u.phoneVerifiedAt=datetime()", {sealed:seal(phoneE164,`phone:${sub}`),last4:phoneE164.slice(-4)});
}
/** The person chose not to give a phone number. */
export async function skipPhone(sub: string) {
  await writeUser(sub, "REMOVE u.phone,u.phoneLast4,u.phoneVerifiedAt SET u.phoneStep='skipped'");
}
/** Consent (or refusal) to read bank SMS through the phone app, with the text version shown. */
export async function setSmsConsent(sub: string, answer: "yes" | "no", version: string) {
  await writeUser(sub, "SET u.smsConsent=$answer,u.smsConsentVersion=$version,u.smsConsentAt=datetime()", {answer,version});
}
export async function finishSignup(sub: string) {
  await writeUser(sub, "SET u.signupDone=true,u.signupDoneAt=datetime()");
}
/** Live progress of the running Gmail sync, written only by the sync holding the lease. */
export async function recordSyncProgress(sub: string, lease: string, progress: Omit<SyncProgress,"at">) {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try { await s.run("MATCH (u:PaytraceUser {sub:$sub,syncLease:$lease}) SET u.syncProgress=$json",{sub,lease,json:JSON.stringify({...progress,at:new Date().toISOString()})}); }
  finally { await s.close(); }
}
export async function syncProgressFor(sub: string): Promise<SyncProgress | null> {
  const s = getNeo4jDriver().session({database:neo4jDatabase});
  try {
    const r = await s.run("MATCH (u:PaytraceUser {sub:$sub}) RETURN u.syncProgress AS json",{sub});
    const json = r.records[0]?.get("json");
    if (typeof json !== "string") return null;
    try { return JSON.parse(json) as SyncProgress; } catch { return null; }
  } finally { await s.close(); }
}
