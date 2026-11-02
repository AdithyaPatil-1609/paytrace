/**
 * Screen 00 reads the graph itself, not the commitments derived from it.
 *
 * Each finding is one Cypher pattern over relationships: a Message that is
 * absent, a chain from a trial notice to a paid debit, money that kept moving
 * after the last open. The query text ships with the result so the screen can
 * show exactly what ran. There is no CSV twin of this file; offline mode has
 * no graph, so Screen 00 says so instead of imitating it.
 */
import type { CypherRunner } from "./analyze";
import { RULES } from "@/lib/rules";

export type GraphFinding<Row> = { title: string; cypher: string; rows: Row[] };

export type SilentHikeRow = { brand: string; from: number; to: number; since: string; payments: number; messages: number };
export type TrialRow = { brand: string; noticeOn: string; paidOn: string; amount: number; hold?: number };
export type UnopenedRow = { brand: string; lastOpened?: string; mandateRef: string; charges: number; paid: number };

export type FocusGraph = {
  brand: string;
  patterns: string[];
  accounts: string[];
  payments: { date: string; amount: number }[];
  messages: { eventType: string; count: number }[];
  mandateRef?: string;
};

export type GraphFacts = {
  labels: { label: string; count: number }[];
  relationships: { type: string; count: number }[];
  silentHikes: GraphFinding<SilentHikeRow>;
  trials: GraphFinding<TrialRow>;
  unopened: GraphFinding<UnopenedRow>;
  focus?: FocusGraph;
};

/** A price that stepped up and stayed, on a merchant no price_change Message is ABOUT. */
export const SILENT_HIKE_QUERY = `MATCH (p:Payment)-[:PAID_TO]->(m:Merchant)
WHERE p.debit_inr > 0 AND coalesce(p.txn_kind, '') <> 'authorisation'
WITH m, p ORDER BY p.date
WITH m, collect(p.debit_inr) AS a, collect(p.date) AS d
WITH m, a, d, [i IN range(1, size(a) - 1)
  WHERE all(x IN a[0..i] WHERE x = a[0]) AND all(x IN a[i..] WHERE x = a[i]) AND a[i] > a[0] | i] AS steps
WHERE size(steps) > 0
  AND NOT EXISTS { (:Message {event_type: 'price_change'})-[:ABOUT]->(m) }
RETURN m.brand AS brand, a[0] AS from, a[steps[0]] AS to, toString(d[steps[0]]) AS since,
       size(a) AS payments, COUNT { (:Message)-[:ABOUT]->(m) } AS messages
ORDER BY brand`;

/** A trial_ending Message, then the first real debit to the same Merchant. */
export const TRIAL_QUERY = `MATCH (t:Message {event_type: 'trial_ending'})-[:ABOUT]->(m:Merchant)<-[:PAID_TO]-(p:Payment)
WHERE p.date >= t.sent_on AND coalesce(p.txn_kind, '') <> 'authorisation'
WITH t, m, p ORDER BY p.date
WITH t, m, head(collect(p)) AS first
OPTIONAL MATCH (h:Payment {txn_kind: 'authorisation'})-[:PAID_TO]->(m)
RETURN m.brand AS brand, toString(t.sent_on) AS noticeOn, toString(first.date) AS paidOn,
       first.debit_inr AS amount, head(collect(h.debit_inr)) AS hold
ORDER BY brand`;

/** A live Mandate FOR a Merchant nobody opens, and what was PAID_TO it since the last open. */
export const UNOPENED_QUERY = `MATCH (md:Mandate {status: 'active'})-[:FOR]->(m:Merchant)
WHERE (m.last_opened IS NOT NULL AND duration.inDays(m.last_opened, date($asOf)).days > $zombieDays)
   OR (m.last_opened IS NULL AND m.opens_last_12_months = 0)
OPTIONAL MATCH (p:Payment)-[:PAID_TO]->(m)
WHERE m.last_opened IS NULL OR p.date > m.last_opened
RETURN m.brand AS brand, toString(m.last_opened) AS lastOpened, md.mandate_ref AS mandateRef,
       count(p) AS charges, coalesce(sum(p.debit_inr), 0) AS paid
ORDER BY paid DESC`;

function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const candidate = value as { toNumber?: () => number };
  if (typeof candidate.toNumber === "function") return candidate.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export async function loadGraphFacts(runner: CypherRunner, asOf: string): Promise<GraphFacts> {
  const labels = await runner.run(
    "MATCH (n) UNWIND labels(n) AS label RETURN label, count(*) AS count ORDER BY count DESC, label"
  );
  const relationships = await runner.run(
    "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count ORDER BY count DESC, type"
  );
  const hikes = await runner.run(SILENT_HIKE_QUERY);
  const trials = await runner.run(TRIAL_QUERY);
  const unopened = await runner.run(UNOPENED_QUERY, { asOf, zombieDays: RULES.zombieDays });

  const silentHikes = hikes.records.map((record) => ({
    brand: text(record.get("brand")),
    from: num(record.get("from")),
    to: num(record.get("to")),
    since: text(record.get("since")),
    payments: num(record.get("payments")),
    messages: num(record.get("messages"))
  }));

  let focus: FocusGraph | undefined;
  if (silentHikes[0]) {
    const result = await runner.run(
      `MATCH (m:Merchant {brand: $brand})
       OPTIONAL MATCH (p:Payment)-[:PAID_TO]->(m)
       WHERE coalesce(p.txn_kind, '') <> 'authorisation'
       WITH m, p ORDER BY p.date
       WITH m, collect({date: toString(p.date), amount: p.debit_inr}) AS payments
       RETURN payments,
              [(pat:Pattern)-[:MATCHES]->(m) | pat.pattern] AS patterns,
              COLLECT { MATCH (q:Payment)-[:PAID_TO]->(m) MATCH (q)-[:ON_ACCOUNT]->(a:Account)
                        RETURN DISTINCT a.account_id } AS accounts,
              COLLECT { MATCH (msg:Message)-[:ABOUT]->(m) RETURN DISTINCT msg.event_type } AS types,
              [(msg:Message)-[:ABOUT]->(m) | msg.event_type] AS events,
              head([(md:Mandate)-[:FOR]->(m) | md.mandate_ref]) AS mandateRef`,
      { brand: silentHikes[0].brand }
    );
    const record = result.records[0];
    if (record) {
      const events = (record.get("events") as unknown[]).map(text);
      focus = {
        brand: silentHikes[0].brand,
        patterns: (record.get("patterns") as unknown[]).map(text),
        accounts: (record.get("accounts") as unknown[]).map(text),
        payments: (record.get("payments") as { date: unknown; amount: unknown }[]).map((row) => ({
          date: text(row.date),
          amount: num(row.amount)
        })),
        messages: (record.get("types") as unknown[]).map(text).map((eventType) => ({
          eventType,
          count: events.filter((event) => event === eventType).length
        })),
        mandateRef: record.get("mandateRef") ? text(record.get("mandateRef")) : undefined
      };
    }
  }

  return {
    labels: labels.records.map((record) => ({ label: text(record.get("label")), count: num(record.get("count")) })),
    relationships: relationships.records.map((record) => ({
      type: text(record.get("type")),
      count: num(record.get("count"))
    })),
    silentHikes: { title: "Price stepped up, and no price_change Message is ABOUT the merchant", cypher: SILENT_HIKE_QUERY, rows: silentHikes },
    trials: {
      title: "A trial_ending Message, then a paid debit to the same merchant",
      cypher: TRIAL_QUERY,
      rows: trials.records.map((record) => ({
        brand: text(record.get("brand")),
        noticeOn: text(record.get("noticeOn")),
        paidOn: text(record.get("paidOn")),
        amount: num(record.get("amount")),
        hold: record.get("hold") === null ? undefined : num(record.get("hold"))
      }))
    },
    unopened: {
      title: `A live Mandate FOR a merchant unopened for over ${RULES.zombieDays} days`,
      cypher: UNOPENED_QUERY,
      rows: unopened.records.map((record) => ({
        brand: text(record.get("brand")),
        lastOpened: record.get("lastOpened") ? text(record.get("lastOpened")) : undefined,
        mandateRef: text(record.get("mandateRef")),
        charges: num(record.get("charges")),
        paid: num(record.get("paid"))
      }))
    },
    focus
  };
}
