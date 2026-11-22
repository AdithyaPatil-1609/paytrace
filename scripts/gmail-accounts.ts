/** One worker synchronizes all consenting signed-in accounts, never the desktop demo token. */
import "./load-env-local";
import { setTimeout as delay } from "node:timers/promises";

async function main() {
  const { accountConfig }=await import("../server/accounts/security");
  const { linkedAccounts }=await import("../neo4j/accounts");
  const { syncAccount }=await import("../server/accounts/sync");
  const { AccountError }=await import("../server/accounts/errors");
  const { getNeo4jDriver }=await import("../neo4j/client");
  accountConfig();
  try {
    do {
      const accounts=await linkedAccounts(); let accepted=0, failures=0;
      for (const sub of accounts) { try { accepted+=(await syncAccount(sub)).accepted; } catch(error) { failures++; console.warn(`Gmail sync failed [${error instanceof AccountError?error.code:"sync-unavailable"}]`); } }
      console.log(`Account Gmail sync: ${accounts.length} linked accounts, ${accepted} new events, ${failures} sync failures.`);
      if (process.argv.includes("--watch")) await delay(45_000);
    } while (process.argv.includes("--watch"));
  } finally { await getNeo4jDriver().close(); }
}
main().catch(()=>{console.error("Account sync unavailable. Check configuration and Neo4j.");process.exitCode=1;});
