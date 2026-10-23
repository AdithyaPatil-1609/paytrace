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
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Next.js loads .env.local for the app, but this script runs on plain node,
 * so it reads the file itself. No dependency, and no version requirement on
 * node's own --env-file flag.
 */
function loadEnvLocal() {
  try {
    const text = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const split = trimmed.indexOf("=");
      if (split < 1) continue;
      const key = trimmed.slice(0, split).trim();
      let value = trimmed.slice(split + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // No .env.local. hasNeo4jConfig() reports this with a usable message.
  }
}

loadEnvLocal();

import {
  AS_OF,
  readDictionary,
  readMandates,
  readNotifications,
  readStatement,
  readUsage
} from "../lib/fixtures";

const CONSTRAINTS = [
  "CREATE CONSTRAINT pay_person_persona IF NOT EXISTS FOR (n:Person) REQUIRE n.persona IS UNIQUE",
  "CREATE CONSTRAINT pay_account_id IF NOT EXISTS FOR (n:Account) REQUIRE n.account_id IS UNIQUE",
  "CREATE CONSTRAINT pay_payment_id IF NOT EXISTS FOR (n:Payment) REQUIRE n.txn_id IS UNIQUE",
  "CREATE CONSTRAINT pay_message_id IF NOT EXISTS FOR (n:Message) REQUIRE n.notice_id IS UNIQUE",
  "CREATE CONSTRAINT pay_mandate_id IF NOT EXISTS FOR (n:Mandate) REQUIRE n.mandate_id IS UNIQUE",
  "CREATE CONSTRAINT pay_merchant_brand IF NOT EXISTS FOR (n:Merchant) REQUIRE n.brand IS UNIQUE",
  "CREATE CONSTRAINT pay_pattern_text IF NOT EXISTS FOR (n:Pattern) REQUIRE n.pattern IS UNIQUE",
  "CREATE CONSTRAINT pay_commitment_id IF NOT EXISTS FOR (n:Commitment) REQUIRE n.commitment_id IS UNIQUE"
];

async function main() {
  const { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } = await import("../db/neo4j/client");

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
    for (const statement of CONSTRAINTS) await session.run(statement);

    await session.run("MERGE (p:Person {persona: $persona}) SET p.name = $name, p.as_of = date($asOf)", {
      persona: "priya",
      name: "Priya Demo",
      asOf: AS_OF
    });

    const statement = readStatement();
    console.log(`Writing ${statement.length} payments...`);
    await session.run(
      `
      UNWIND $rows AS row
      MERGE (a:Account {account_id: row.accountId})
        SET a.account_type = row.accountType
      WITH row, a
      MATCH (person:Person {persona: 'priya'})
      MERGE (person)-[:HOLDS]->(a)
      MERGE (p:Payment {txn_id: row.txnId})
        SET p.date = date(row.date),
            p.narration = row.narration,
            p.debit_inr = row.debit,
            p.credit_inr = row.credit,
            p.reference = row.reference,
            p.channel = row.channel,
            p.txn_kind = row.txnKind
      MERGE (p)-[:ON_ACCOUNT]->(a)
      `,
      {
        rows: statement.map((row) => ({
          ...row,
          debit: row.debit ?? null,
          credit: row.credit ?? null
        }))
      }
    );

    const notifications = readNotifications();
    console.log(`Writing ${notifications.length} messages...`);
    await session.run(
      `
      UNWIND $rows AS row
      MERGE (m:Message {notice_id: row.noticeId})
        SET m.sent_on = date(row.sentOn),
            m.channel = row.channel,
            m.sender = row.sender,
            m.event_type = row.eventType,
            m.merchant_brand = row.brand,
            m.related_txn_id = row.relatedTxnId,
            m.amount_inr = row.amount,
            m.raw_text = row.text
      WITH m, row
      WHERE row.relatedTxnId IS NOT NULL
      MATCH (p:Payment {txn_id: row.relatedTxnId})
      MERGE (p)-[:NOTIFIED_BY]->(m)
      `,
      {
        rows: notifications.map((row) => ({
          ...row,
          relatedTxnId: row.relatedTxnId ?? null,
          amount: row.amount ?? null
        }))
      }
    );

    const mandates = readMandates();
    console.log(`Writing ${mandates.length} mandates...`);
    await session.run(
      `
      UNWIND $rows AS row
      MERGE (md:Mandate {mandate_id: row.mandateId})
        SET md.created_on = date(row.createdOn),
            md.mechanism = row.mechanism,
            md.narration = row.narration,
            md.brand = row.brand,
            md.max_amount_inr = row.maxAmount,
            md.frequency = row.frequency,
            md.mandate_ref = row.mandateRef,
            md.status = row.status
      MERGE (a:Account {account_id: row.accountId})
      MERGE (md)-[:ON_ACCOUNT]->(a)
      MERGE (brand:Merchant {brand: row.brand})
      MERGE (md)-[:FOR]->(brand)
      `,
      { rows: mandates }
    );

    const dictionary = readDictionary();
    console.log(`Writing ${dictionary.length} dictionary patterns...`);
    await session.run(
      `
      UNWIND $rows AS row
      MERGE (brand:Merchant {brand: row.brand})
      MERGE (pat:Pattern {pattern: row.pattern})
        SET pat.brand = row.brand,
            pat.product = row.product,
            pat.category = row.category,
            pat.one_liner = row.oneLiner,
            pat.mechanism = row.mechanism,
            pat.cancel_mode = row.cancelMode,
            pat.stop_the_service = row.stopTheService,
            pat.stop_the_money = row.stopTheMoney,
            pat.trap = row.trap,
            pat.if_they_stay_silent = row.ifTheyStaySilent
      MERGE (pat)-[:MATCHES]->(brand)
      `,
      { rows: dictionary }
    );

    const usage = readUsage();
    console.log(`Writing usage for ${usage.length} merchants...`);
    await session.run(
      `
      UNWIND $rows AS row
      MERGE (brand:Merchant {brand: row.brand})
        SET brand.opens_last_12_months = row.opens,
            brand.last_opened = CASE WHEN row.lastOpened IS NULL THEN null ELSE date(row.lastOpened) END
      `,
      {
        rows: usage.map((row) => ({
          brand: row.brand,
          opens: row.opensLast12Months,
          lastOpened: row.lastOpened ?? null
        }))
      }
    );

    console.log("Linking payments to merchants and mandates...");
    await session.run(`
      MATCH (p:Payment), (pat:Pattern)
      WHERE p.narration CONTAINS pat.pattern
      MATCH (pat)-[:MATCHES]->(brand:Merchant)
      MERGE (p)-[:PAID_TO]->(brand)
    `);
    await session.run(`
      MATCH (p:Payment), (md:Mandate)
      WHERE p.narration = md.narration
      MERGE (p)-[:AUTHORIZED_BY]->(md)
    `);
    await session.run(`
      MATCH (m:Message) WHERE m.merchant_brand IS NOT NULL AND m.merchant_brand <> ''
      MATCH (brand:Merchant {brand: m.merchant_brand})
      MERGE (m)-[:ABOUT]->(brand)
    `);

    // The graph derives commitments too, so its own count can be compared
    // with what the TypeScript engine finds from the same rows.
    console.log("Deriving commitments inside the graph...");
    await session.run(`
      MATCH (p:Payment)-[:PAID_TO]->(brand:Merchant)
      WHERE p.txn_kind IN ['debit_purchase', 'debit_bill', 'debit_vas', 'debit_emi']
      WITH brand, collect(p) AS payments, count(p) AS n
      WHERE n >= 2 OR EXISTS { MATCH (brand)<-[:FOR]-(:Mandate) }
      MERGE (c:Commitment {commitment_id: brand.brand})
        SET c.payment_count = n
      WITH c, brand, payments
      UNWIND payments AS p
      MERGE (p)-[:GROUPED_INTO]->(c)
      MERGE (c)-[:FOR]->(brand)
    `);

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
