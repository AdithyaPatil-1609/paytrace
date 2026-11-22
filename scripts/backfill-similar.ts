/**
 * One-off backfill of SIMILAR merchant candidates for records made before
 * merchant matching existed. Dry run by default; --write to store. Refuses a
 * database that is not on this machine unless --allow-remote is also given, so
 * it never runs against production Aura by accident.
 *   node --import tsx scripts/backfill-similar.ts [--write] [--allow-remote]
 */
import "./load-env-local";
import neo4j from "neo4j-driver";
import { getNeo4jDriver, neo4jDatabase } from "../neo4j/client";
import { planSimilarLinks, refreshSimilarLinksFor, SIMILAR_MERCHANTS_QUERY } from "../neo4j/merchant-links";
import { MERCHANT_MATCH } from "../server/payments/rules";

const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const host = (() => { try { return new URL(process.env.NEO4J_URI ?? "").hostname; } catch { return ""; } })();
const local = ["localhost", "127.0.0.1", "[::1]"].includes(host);
if (!local && !args.has("--allow-remote")) {
  console.error(`Refusing: ${host || "the configured database"} is not on this machine. Add --allow-remote only after the team agrees.`);
  process.exit(1);
}

async function main() {
  const driver = getNeo4jDriver();
  const session = driver.session({ database: neo4jDatabase, defaultAccessMode: "READ" });
  try {
    const profiles = (await session.run("MATCH (p:LiveProfile) RETURN p.id AS id ORDER BY id")).records.map(r => String(r.get("id")));
    let total = 0;
    for (const profile of profiles) {
      const merchants = (await session.run(SIMILAR_MERCHANTS_QUERY, { profile, limit: neo4j.int(MERCHANT_MATCH.maxProfileMerchants) })).records.map(r => ({ id: String(r.get("id")), name: String(r.get("name") ?? "") }));
      const links = write ? (await refreshSimilarLinksFor(profile)).links : planSimilarLinks(merchants).pairs.length;
      total += links;
    }
    // Counts only: never merchant names or profile ids.
    console.log(`${write ? "Wrote" : "Would write"} ${total} SIMILAR candidates across ${profiles.length} profiles on ${host}.`);
  } finally {
    await session.close();
    await driver.close();
  }
}

void main();
