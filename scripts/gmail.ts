/** Local desktop OAuth + Gmail polling. Never logs email contents or tokens. */
import "./load-env-local";
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { liveProfile } from "../lib/ingestion/auth";
import { parseFinancialEmail } from "../lib/ingestion/email";

const TOKEN_FILE = ".paytrace-gmail-token.json";
const redirect = "http://127.0.0.1:53682";
const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
const scope = "https://www.googleapis.com/auth/gmail.readonly";

async function token(fields: Record<string,string>) {
  if (!clientId || !clientSecret) throw new Error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET first");
  const res = await fetch("https://oauth2.googleapis.com/token", { method:"POST", body:new URLSearchParams({ client_id:clientId, client_secret:clientSecret, ...fields }) });
  if (!res.ok) throw new Error(`Google token request failed (${res.status})`);
  return await res.json() as { access_token:string; refresh_token?:string };
}

async function authorize() {
  if (!clientId || !clientSecret) throw new Error("Set desktop OAuth client credentials in .env.local");
  const verifier = randomBytes(48).toString("base64url");
  const state = randomBytes(24).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({ client_id:clientId, redirect_uri:redirect, response_type:"code", scope, state, code_challenge:challenge, code_challenge_method:"S256", access_type:"offline", prompt:"consent" });
  const code = await new Promise<string>((resolve,reject) => {
    const server = createServer((req,res) => {
      const url = new URL(req.url ?? "/", redirect);
      if (url.pathname !== "/" || url.searchParams.get("state") !== state) { res.writeHead(400).end("Invalid state"); return; }
      const code = url.searchParams.get("code");
      res.writeHead(code ? 200 : 400, { "Content-Type":"text/plain" }).end(code ? "Paytrace authorization received. Return to the terminal." : "Authorization declined.");
      clearTimeout(timeout); server.close();
      if (code) resolve(code); else reject(new Error("Authorization declined"));
    });
    const timeout = setTimeout(() => { server.close(); reject(new Error("Authorization expired")); }, 300_000);
    server.on("error", error => { clearTimeout(timeout); reject(error); });
    server.listen(53682,"127.0.0.1", () => console.log(`Open this URL on your laptop to authorize Gmail:\nhttps://accounts.google.com/o/oauth2/v2/auth?${params}`));
  });
  const result = await token({ grant_type:"authorization_code", code, redirect_uri:redirect, code_verifier:verifier });
  if (!result.refresh_token) throw new Error("Google did not return a refresh token; revoke consent and retry");
  await writeFile(TOKEN_FILE, JSON.stringify({ refresh_token:result.refresh_token }), { mode:0o600 });
  await chmod(TOKEN_FILE,0o600);
  console.log("Gmail connected. Refresh token saved locally; do not share it.");
}

type Part = { mimeType?:string; headers?:{name:string;value:string}[]; body?: {data?:string}; parts?:Part[] };
function plain(part:Part):string {
  if (part.mimeType==="text/plain" && part.body?.data) return Buffer.from(part.body.data,"base64url").toString("utf8").slice(0,20000);
  return (part.parts ?? []).map(plain).join("\n").slice(0,20000);
}

async function sync() {
  const profile = liveProfile();
  if (!profile) throw new Error("Enable live storage and configure PAYTRACE_LIVE_PROFILE first");
  const domains = (process.env.GMAIL_ALLOWED_DOMAINS ?? "").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  if (!domains.length) throw new Error("Set GMAIL_ALLOWED_DOMAINS to approved sender domains");
  const query = process.env.GMAIL_QUERY || "newer_than:7d {subject:payment subject:receipt subject:mandate subject:subscription}";
  const saved = JSON.parse(await readFile(TOKEN_FILE,"utf8")) as {refresh_token:string};
  const access = (await token({grant_type:"refresh_token",refresh_token:saved.refresh_token})).access_token;
  const { ingestLiveEvent } = await import("../db/neo4j/live");
  async function gmail(path:string) {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers:{ Authorization:`Bearer ${access}` } });
    if (!res.ok) throw new Error(`Gmail request failed (${res.status})`);
    return await res.json();
  }
  let accepted=0, skipped=0, page:string|undefined;
  do {
    const params = new URLSearchParams({ q:query, maxResults:"100", ...(page ? {pageToken:page} : {}) });
    const result = await gmail(`messages?${params}`) as {messages?:{id:string}[];nextPageToken?:string};
    for (const {id} of result.messages ?? []) {
      const mail = await gmail(`messages/${encodeURIComponent(id)}?format=full`) as {payload:Part;internalDate:string};
      const header = (name:string) => mail.payload.headers?.find(h=>h.name.toLowerCase()===name)?.value ?? "";
      const event = parseFinancialEmail({ id, from:header("from"), subject:header("subject"), body:plain(mail.payload), date:new Date(Number(mail.internalDate)).toISOString().slice(0,10) },domains);
      if (event) { const result = await ingestLiveEvent(profile,event); if (result.status!=="duplicate") accepted++; } else skipped++;
    }
    page=result.nextPageToken;
  } while (page);
  console.log(`Gmail sync: ${accepted} new events; ${skipped} unsupported/skipped.`);
}

async function main() {
  if (process.argv.includes("--authorize")) return authorize();
  do { await sync(); if (process.argv.includes("--watch")) await delay(45_000); } while (process.argv.includes("--watch"));
  const { getNeo4jDriver } = await import("../db/neo4j/client");
  await getNeo4jDriver().close();
}
main().catch(error=>{ console.error(error instanceof Error ? error.message : "Gmail operation failed"); process.exit(1); });
