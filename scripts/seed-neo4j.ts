/**
 * Loads the synthetic fixture into Neo4j as an evidence graph.
 *
 * Run with: npm run seed
 *
 * This writes through the Bolt driver rather than LOAD CSV, so it works on
 * Neo4j Aura, where file:/// imports are not permitted. The graph it builds
 * is the same shape as db/neo4j/load-from-csv.cypher, with one correction:
 * the dictionary row's wording lives on the Pattern node, not the Merchant.
 * Merchant is keyed by brand, and the dictionary holds two rows each for
 * Spotify and Netflix, so putting the copy on Merchant lets the later row
 * overwrite the earlier one.
 */
import "./load-env-local";

import {
  AS_OF,
  readDictionary,
  readMandates,
  readNotifications,
  readStatement,
  readUsage
} from "../lib/fixtures";

async function main() {
  const { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } = await import("../db/neo4j/client");
  const writers = await import("../db/neo4j/write");

  if (!hasNeo4jConfig()) {
    console.error(
      "No Neo4j connection found. Copy .env.example to .env.local and fill in NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD."
    );
    process.exit(1);
  }

  const driver = getNeo4jDriver();
  const session = driver.session({ database: neo4jDatabase });

  try {
    console.log("Clearing anything this seed wrote before...");
    await session.run(
      "MATCH (n) WHERE n:Person OR n:Account OR n:Payment OR n:Message OR n:Mandate OR n:Merchant OR n:Pattern OR n:Commitment DETACH DELETE n"
    );

    console.log("Applying constraints...");
    for (const statement of writers.CONSTRAINTS) await session.run(statement);

    await session.run("MERGE (p:Person {persona: $persona}) SET p.name = $name, p.as_of = date($asOf)", {
      persona: "priya",
      name: "Priya Demo",
      asOf: AS_OF
    });

    const statement = readStatement();
    console.log(`Writing ${statement.length} payments...`);
    await writers.writePayments(session, statement);

    const notifications = readNotifications();
    console.log(`Writing ${notifications.length} messages...`);
    await writers.writeMessages(session, notifications);

    const mandates = readMandates();
    console.log(`Writing ${mandates.length} mandates...`);
    await writers.writeMandates(session, mandates);

    const dictionary = readDictionary();
    console.log(`Writing ${dictionary.length} dictionary patterns...`);
    await writers.writePatterns(session, dictionary);

    const usage = readUsage();
    console.log(`Writing usage for ${usage.length} merchants...`);
    await writers.writeUsage(session, usage);

    console.log("Linking payments to merchants and mandates...");
    await writers.linkEvidence(session);

    // The graph derives commitments too, so its own count can be compared
    // with what the TypeScript engine finds from the same rows.
    console.log("Deriving commitments inside the graph...");
    await writers.deriveCommitmentNodes(session);

    const counts = await session.run(`
      MATCH (p:Payment) WITH count(p) AS payments
      MATCH (m:Message) WITH payments, count(m) AS messages
      MATCH (md:Mandate) WITH payments, messages, count(md) AS mandates
      MATCH (pat:Pattern) WITH payments, messages, mandates, count(pat) AS patterns
      MATCH (c:Commitment) RETURN payments, messages, mandates, patterns, count(c) AS commitments
    `);
    const row = counts.records[0];
    console.log("\nSeeded:");
    for (const key of ["payments", "messages", "mandates", "patterns", "commitments"]) {
      console.log(`  ${key.padEnd(12)} ${row.get(key).toNumber?.() ?? row.get(key)}`);
    }
    console.log("\nStart the app with npm run dev. It will read from Neo4j.");
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((error) => {
  console.error("Seeding failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
