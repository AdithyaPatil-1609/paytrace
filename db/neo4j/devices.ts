/**
 * Paired phones (plan cards S5 and M2). A signed-in person asks for a short
 * one-time pairing code; their phone sends it once with its public key.
 * Only the public key is stored. Every query starts from the person's own
 * account node, and values are always passed as parameters.
 */
import { randomInt } from "node:crypto";
import { getNeo4jDriver, neo4jDatabase } from "./client";
import { hash, randomToken } from "@/lib/accounts/security";
import { DEVICE_LIMITS } from "@/lib/payments/rules";

const DEVICE_SCHEMA = [
  "CREATE CONSTRAINT paytrace_device_id IF NOT EXISTS FOR (d:PaytraceDevice) REQUIRE d.id IS UNIQUE",
  "CREATE CONSTRAINT paytrace_pairing_hash IF NOT EXISTS FOR (p:PaytracePairing) REQUIRE p.hash IS UNIQUE"
];
let initialized: Promise<void> | undefined;
async function schema() {
  if (!initialized) initialized = (async () => {
    const s = getNeo4jDriver().session({ database: neo4jDatabase });
    try { for (const q of DEVICE_SCHEMA) await s.run(q); } finally { await s.close(); }
  })().catch(e => { initialized = undefined; throw e; });
  await initialized;
}

/** No 0/O, 1/I/L: easy to read aloud and type on a phone. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function newPairingCode() {
  let code = "";
  for (let i = 0; i < DEVICE_LIMITS.pairingCodeLength; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}
export function normalizePairingCode(input: unknown) {
  if (typeof input !== "string") return null;
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return code.length === DEVICE_LIMITS.pairingCodeLength && [...code].every(c => ALPHABET.includes(c)) ? code : null;
}

/** Makes a new code for this person; any older unused code stops working. */
export async function createPairingCode(sub: string) {
  await schema();
  const code = newPairingCode();
  const expires = new Date(Date.now() + DEVICE_LIMITS.pairingCodeMs).toISOString();
  const s = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    await s.executeWrite(async tx => {
      await tx.run("MATCH (:PaytraceUser {sub:$sub})-[:HAS_PAIRING]->(old:PaytracePairing) DETACH DELETE old", { sub });
      const r = await tx.run("MATCH (u:PaytraceUser {sub:$sub}) CREATE (u)-[:HAS_PAIRING]->(:PaytracePairing {hash:$hash, expires:datetime($expires)}) RETURN u.sub AS sub", { sub, hash: hash(code), expires });
      if (!r.records.length) throw new Error("Account not found");
    });
    return { code, expiresAt: expires };
  } finally { await s.close(); }
}

export type PairResult = { ok: true; deviceId: string } | { ok: false; reason: "invalid-code" | "too-many-devices" };

/** Uses a pairing code once, and stores the phone's public key for that person. */
export async function pairDevice(code: string, publicKey: string, label: string): Promise<PairResult> {
  await schema();
  const deviceId = randomToken();
  const s = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    return await s.executeWrite(async tx => {
      const found = await tx.run(`MATCH (u:PaytraceUser)-[:HAS_PAIRING]->(p:PaytracePairing {hash:$hash})
        WITH u, p, p.expires > datetime() AS fresh
        DETACH DELETE p
        WITH u, fresh WHERE fresh
        OPTIONAL MATCH (u)-[:HAS_DEVICE]->(d:PaytraceDevice)
        RETURN u.sub AS sub, count(d) AS devices`, { hash: hash(code) });
      const row = found.records[0];
      if (!row) return { ok: false, reason: "invalid-code" } as const;
      if (Number(row.get("devices")) >= DEVICE_LIMITS.maxDevicesPerUser) return { ok: false, reason: "too-many-devices" } as const;
      await tx.run(`MATCH (u:PaytraceUser {sub:$sub})
        CREATE (u)-[:HAS_DEVICE]->(:PaytraceDevice {id:$deviceId, publicKey:$publicKey, label:$label, created:datetime(), lastSeen:null})`,
        { sub: row.get("sub"), deviceId, publicKey, label });
      return { ok: true, deviceId } as const;
    });
  } finally { await s.close(); }
}

export type DeviceOwner = { deviceId: string; sub: string; profile: string; publicKey: string };

/** The owner and public key of a paired phone, or null. */
export async function deviceById(deviceId: string): Promise<DeviceOwner | null> {
  await schema();
  const s = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const r = await s.run("MATCH (u:PaytraceUser)-[:HAS_DEVICE]->(d:PaytraceDevice {id:$deviceId}) RETURN u.sub AS sub, u.profile AS profile, d.publicKey AS publicKey", { deviceId });
    const row = r.records[0];
    return row ? { deviceId, sub: row.get("sub"), profile: row.get("profile"), publicKey: row.get("publicKey") } : null;
  } finally { await s.close(); }
}

export async function markDeviceSeen(deviceId: string) {
  const s = getNeo4jDriver().session({ database: neo4jDatabase });
  try { await s.run("MATCH (d:PaytraceDevice {id:$deviceId}) SET d.lastSeen=datetime()", { deviceId }); } finally { await s.close(); }
}

export async function devicesFor(sub: string) {
  await schema();
  const s = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const r = await s.run("MATCH (:PaytraceUser {sub:$sub})-[:HAS_DEVICE]->(d:PaytraceDevice) RETURN d.label AS label, toString(d.created) AS created, toString(d.lastSeen) AS lastSeen ORDER BY d.created", { sub });
    return r.records.map(x => ({ label: x.get("label") as string, created: x.get("created") as string, lastSeen: x.get("lastSeen") as string | null }));
  } finally { await s.close(); }
}

/** Unpairs every phone of this person and returns the removed device ids. */
export async function removeDevices(sub: string) {
  const s = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const r = await s.run("MATCH (:PaytraceUser {sub:$sub})-[:HAS_DEVICE]->(d:PaytraceDevice) WITH d, d.id AS id DETACH DELETE d RETURN id", { sub });
    return r.records.map(x => x.get("id") as string);
  } finally { await s.close(); }
}
