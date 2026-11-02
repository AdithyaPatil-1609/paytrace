/**
 * Writes evidence into the graph. Shared by the seed (npm run seed) and by
 * live Simulate, which writes the new autopay's rows inside a transaction,
 * asks the analysis query, and rolls back. One set of writers means a
 * simulated row is linked exactly the way a seeded row is.
 */
import type { CypherRunner } from "./analyze";
import type { DictionaryEntry, MandateRow, NotificationRow, StatementRow, UsageRow } from "@/lib/types";

export const CONSTRAINTS = [
  "CREATE CONSTRAINT pay_person_persona IF NOT EXISTS FOR (n:Person) REQUIRE n.persona IS UNIQUE",
  "CREATE CONSTRAINT pay_account_id IF NOT EXISTS FOR (n:Account) REQUIRE n.account_id IS UNIQUE",
  "CREATE CONSTRAINT pay_payment_id IF NOT EXISTS FOR (n:Payment) REQUIRE n.txn_id IS UNIQUE",
  "CREATE CONSTRAINT pay_message_id IF NOT EXISTS FOR (n:Message) REQUIRE n.notice_id IS UNIQUE",
  "CREATE CONSTRAINT pay_mandate_id IF NOT EXISTS FOR (n:Mandate) REQUIRE n.mandate_id IS UNIQUE",
  "CREATE CONSTRAINT pay_merchant_brand IF NOT EXISTS FOR (n:Merchant) REQUIRE n.brand IS UNIQUE",
  "CREATE CONSTRAINT pay_pattern_text IF NOT EXISTS FOR (n:Pattern) REQUIRE n.pattern IS UNIQUE",
  "CREATE CONSTRAINT pay_commitment_id IF NOT EXISTS FOR (n:Commitment) REQUIRE n.commitment_id IS UNIQUE"
];

export async function writePayments(runner: CypherRunner, statement: StatementRow[]) {
  await runner.run(
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
}

export async function writeMessages(runner: CypherRunner, notifications: NotificationRow[]) {
  await runner.run(
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
}

export async function writeMandates(runner: CypherRunner, mandates: MandateRow[]) {
  await runner.run(
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
}

export async function writePatterns(runner: CypherRunner, dictionary: DictionaryEntry[]) {
  await runner.run(
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
}

export async function writeUsage(runner: CypherRunner, usage: UsageRow[]) {
  await runner.run(
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
}

/** The joins that make it a graph: PAID_TO, AUTHORIZED_BY, ABOUT. MERGE, so re-running is safe. */
export async function linkEvidence(runner: CypherRunner) {
  await runner.run(`
    MATCH (p:Payment), (pat:Pattern)
    WHERE p.narration CONTAINS pat.pattern
    MATCH (pat)-[:MATCHES]->(brand:Merchant)
    MERGE (p)-[:PAID_TO]->(brand)
  `);
  await runner.run(`
    MATCH (p:Payment), (md:Mandate)
    WHERE p.narration = md.narration
    MERGE (p)-[:AUTHORIZED_BY]->(md)
  `);
  await runner.run(`
    MATCH (m:Message) WHERE m.merchant_brand IS NOT NULL AND m.merchant_brand <> ''
    MATCH (brand:Merchant {brand: m.merchant_brand})
    MERGE (m)-[:ABOUT]->(brand)
  `);
}

/**
 * Commitment nodes, so the graph's own count sits beside the analysis. The
 * screens render what analyzeCommitments returns, not these nodes.
 */
export async function deriveCommitmentNodes(runner: CypherRunner) {
  await runner.run(`
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
}
