import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "@/db/neo4j/client";
import { AS_OF } from "@/lib/fixtures";
import type {
  CancelMode,
  Dataset,
  DictionaryEntry,
  MandateRow,
  Mechanism,
  NotificationRow,
  StatementRow,
  UsageRow
} from "@/lib/types";

/** Where the rows on screen came from, so the UI can say so. */
export type SourceInfo = {
  kind: "neo4j" | "fixture";
  /** Host only. The password never leaves the server. */
  host?: string;
  database?: string;
  counts: { payments: number; messages: number; mandates: number; patterns: number; commitments: number };
  /** Why the CSV fixture is on screen, when Neo4j was expected. */
  note?: string;
};

export type LoadedDataset = { dataset: Dataset; source: SourceInfo };

/** Neo4j returns Integer and Date objects; both need unwrapping. */
function num(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const candidate = value as { toNumber?: () => number };
  if (typeof candidate.toNumber === "function") return candidate.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function iso(value: unknown): string {
  if (!value) return "";
  const date = value as { year?: unknown; month?: unknown; day?: unknown };
  if (date.year !== undefined) {
    const y = num(date.year) ?? 0;
    const m = num(date.month) ?? 1;
    const d = num(date.day) ?? 1;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return String(value);
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Reads the evidence graph back into exactly the shape lib/engine expects.
 * Detection is identical whether the rows came from Neo4j or from the CSV
 * fixture, which is what keeps the tests meaningful against both.
 */
export async function loadDatasetFromNeo4j(): Promise<LoadedDataset> {
  const driver = getNeo4jDriver();
  const session = driver.session({ database: neo4jDatabase });

  try {
    const [payments, messages, mandates, patterns, usage, counts] = await Promise.all([
      session.run("MATCH (p:Payment)-[:ON_ACCOUNT]->(a:Account) RETURN p, a ORDER BY p.date, p.txn_id"),
      session.run("MATCH (m:Message) RETURN m ORDER BY m.sent_on, m.notice_id"),
      session.run("MATCH (md:Mandate)-[:ON_ACCOUNT]->(a:Account) RETURN md, a.account_id AS account"),
      session.run("MATCH (pat:Pattern) RETURN pat"),
      session.run(
        "MATCH (brand:Merchant) WHERE brand.opens_last_12_months IS NOT NULL RETURN brand"
      ),
      session.run(`
        MATCH (p:Payment) WITH count(p) AS payments
        MATCH (m:Message) WITH payments, count(m) AS messages
        MATCH (md:Mandate) WITH payments, messages, count(md) AS mandates
        MATCH (pat:Pattern) WITH payments, messages, mandates, count(pat) AS patterns
        OPTIONAL MATCH (c:Commitment)
        RETURN payments, messages, mandates, patterns, count(c) AS commitments
      `)
    ]);

    const statement: StatementRow[] = payments.records.map((record) => {
      const p = record.get("p").properties;
      const a = record.get("a").properties;
      return {
        txnId: text(p.txn_id),
        persona: "priya",
        date: iso(p.date),
        accountId: text(a.account_id),
        accountType: text(a.account_type),
        narration: text(p.narration),
        debit: num(p.debit_inr),
        credit: num(p.credit_inr),
        reference: text(p.reference),
        channel: text(p.channel),
        txnKind: text(p.txn_kind)
      };
    });

    const notifications: NotificationRow[] = messages.records.map((record) => {
      const m = record.get("m").properties;
      return {
        noticeId: text(m.notice_id),
        sentOn: iso(m.sent_on),
        channel: text(m.channel) === "email" ? "email" : "sms",
        sender: text(m.sender),
        eventType: text(m.event_type),
        brand: text(m.merchant_brand),
        relatedTxnId: m.related_txn_id ? text(m.related_txn_id) : undefined,
        amount: num(m.amount_inr),
        text: text(m.raw_text)
      };
    });

    const mandateRows: MandateRow[] = mandates.records.map((record) => {
      const md = record.get("md").properties;
      return {
        mandateId: text(md.mandate_id),
        createdOn: iso(md.created_on),
        mechanism: text(md.mechanism) as Mechanism,
        narration: text(md.narration),
        brand: text(md.brand),
        maxAmount: num(md.max_amount_inr) ?? 0,
        frequency: text(md.frequency),
        mandateRef: text(md.mandate_ref),
        accountId: text(record.get("account")),
        status: text(md.status)
      };
    });

    const dictionary: DictionaryEntry[] = patterns.records.map((record) => {
      const pat = record.get("pat").properties;
      return {
        pattern: text(pat.pattern),
        brand: text(pat.brand),
        product: text(pat.product),
        category: text(pat.category),
        oneLiner: text(pat.one_liner),
        mechanism: text(pat.mechanism) as Mechanism,
        cancelMode: (text(pat.cancel_mode) || "normal") as CancelMode,
        stopTheService: text(pat.stop_the_service),
        stopTheMoney: text(pat.stop_the_money),
        trap: text(pat.trap),
        ifTheyStaySilent: text(pat.if_they_stay_silent)
      };
    });

    const usageRows: UsageRow[] = usage.records.map((record) => {
      const brand = record.get("brand").properties;
      return {
        brand: text(brand.brand),
        lastOpened: brand.last_opened ? iso(brand.last_opened) : undefined,
        opensLast12Months: num(brand.opens_last_12_months) ?? 0
      };
    });

    const countRow = counts.records[0];
    const host = (() => {
      try {
        return new URL(process.env.NEO4J_URI ?? "").host;
      } catch {
        return undefined;
      }
    })();

    return {
      dataset: {
        asOf: AS_OF,
        statement,
        notifications,
        usage: usageRows,
        mandates: mandateRows,
        dictionary
      },
      source: {
        kind: "neo4j",
        host,
        database: neo4jDatabase,
        counts: {
          payments: num(countRow?.get("payments")) ?? 0,
          messages: num(countRow?.get("messages")) ?? 0,
          mandates: num(countRow?.get("mandates")) ?? 0,
          patterns: num(countRow?.get("patterns")) ?? 0,
          commitments: num(countRow?.get("commitments")) ?? 0
        }
      }
    };
  } finally {
    await session.close();
  }
}

export { hasNeo4jConfig };
