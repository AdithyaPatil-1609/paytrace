// Paytrace prototype. Synthetic data only.
//
// This builds the EVIDENCE graph: raw payments, messages, mandates, and the
// merchant dictionary, with commitments derived in Cypher rather than written
// down. It is an alternative to schema.cypher + seed.cypher, which seed finished
// Commitment nodes instead. Run one or the other against a database, never both:
// they key their nodes differently.
//
// To run (local Neo4j 5):
//   1. Copy data/raw/*.csv into the Neo4j import folder.
//   2. Run this file in Neo4j Browser or: cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" -f db/neo4j/load-from-csv.cypher
//
// On Neo4j Aura, file:/// is not permitted. Host the CSVs over HTTPS and replace
// each file:///name.csv below with its URL.

CREATE CONSTRAINT pay_person_persona IF NOT EXISTS
FOR (n:Person) REQUIRE n.persona IS UNIQUE;
CREATE CONSTRAINT pay_account_id IF NOT EXISTS
FOR (n:Account) REQUIRE n.account_id IS UNIQUE;
CREATE CONSTRAINT pay_payment_id IF NOT EXISTS
FOR (n:Payment) REQUIRE n.txn_id IS UNIQUE;
CREATE CONSTRAINT pay_message_id IF NOT EXISTS
FOR (n:Message) REQUIRE n.notice_id IS UNIQUE;
CREATE CONSTRAINT pay_mandate_id IF NOT EXISTS
FOR (n:Mandate) REQUIRE n.mandate_id IS UNIQUE;
CREATE CONSTRAINT pay_merchant_brand IF NOT EXISTS
FOR (n:Merchant) REQUIRE n.brand IS UNIQUE;
CREATE CONSTRAINT pay_pattern_text IF NOT EXISTS
FOR (n:Pattern) REQUIRE n.pattern IS UNIQUE;
CREATE CONSTRAINT pay_commitment_id IF NOT EXISTS
FOR (n:Commitment) REQUIRE n.commitment_id IS UNIQUE;

MERGE (person:Person {persona: 'priya'})
SET person.name = 'Priya Demo';

LOAD CSV WITH HEADERS FROM 'file:///statement.csv' AS row
WITH row WHERE row.persona = 'priya'
MERGE (a:Account {account_id: row.account_id})
SET a.account_type = row.account_type
MERGE (person:Person {persona: 'priya'})
MERGE (person)-[:HOLDS]->(a)
MERGE (p:Payment {txn_id: row.txn_id})
SET p.date = date(row.date),
    p.narration = row.narration,
    p.debit_inr = CASE WHEN row.debit_inr = '' THEN null ELSE toFloat(row.debit_inr) END,
    p.credit_inr = CASE WHEN row.credit_inr = '' THEN null ELSE toFloat(row.credit_inr) END,
    p.reference = row.reference,
    p.channel = row.channel,
    p.txn_kind = row.txn_kind,
    p.brand_hint = row.brand
MERGE (p)-[:ON_ACCOUNT]->(a);

LOAD CSV WITH HEADERS FROM 'file:///notifications.csv' AS row
MERGE (msg:Message {notice_id: row.notice_id})
SET msg.sent_on = date(row.sent_on),
    msg.channel = row.channel,
    msg.event_type = row.event_type,
    msg.amount_inr = CASE WHEN row.amount_inr = '' THEN null ELSE toFloat(row.amount_inr) END,
    msg.raw_text = row.raw_text,
    msg.merchant_brand = row.merchant_brand,
    msg.related_txn_id = row.related_txn_id
FOREACH (_ IN CASE WHEN row.related_txn_id = '' THEN [] ELSE [1] END |
  MERGE (p:Payment {txn_id: row.related_txn_id})
  MERGE (p)-[:NOTIFIED_BY]->(msg)
);

LOAD CSV WITH HEADERS FROM 'file:///mandates.csv' AS row
MERGE (md:Mandate {mandate_id: row.mandate_id})
SET md.created_on = date(row.created_on),
    md.mechanism = row.mechanism,
    md.narration = row.narration,
    md.brand = row.brand,
    md.max_amount_inr = toFloat(row.max_amount_inr),
    md.frequency = row.frequency,
    md.mandate_ref = row.mandate_ref,
    md.status = row.status_as_of_2026_10_22
MERGE (a:Account {account_id: row.account_id})
MERGE (md)-[:ON_ACCOUNT]->(a)
MERGE (m:Merchant {brand: row.brand})
MERGE (md)-[:FOR]->(m);

// The dictionary row's wording lives on the Pattern, not the Merchant.
// Merchant is keyed by brand, and the dictionary holds two rows each for
// Spotify and Netflix (the plain descriptor and the PAYPAL * one), so copy
// written onto Merchant would let the later row overwrite the earlier one.
// scripts/seed-neo4j.ts writes the same shape.
LOAD CSV WITH HEADERS FROM 'file:///merchant-dictionary.csv' AS row
MERGE (m:Merchant {brand: row.brand})
MERGE (pat:Pattern {pattern: row.pattern})
SET pat.brand = row.brand,
    pat.product = row.product,
    pat.category = row.category,
    pat.one_liner = row.one_liner,
    pat.mechanism = row.mechanism,
    pat.cancel_mode = row.cancel_mode,
    pat.stop_the_service = row.stop_the_service,
    pat.stop_the_money = row.stop_the_money,
    pat.trap = row.trap,
    pat.if_they_stay_silent = row.if_they_stay_silent
MERGE (pat)-[:MATCHES]->(m);

LOAD CSV WITH HEADERS FROM 'file:///usage.csv' AS row
MERGE (m:Merchant {brand: row.brand})
SET m.opens_last_12_months = toInteger(row.opens_last_12_months),
    m.last_opened = CASE WHEN row.last_opened = '' THEN null ELSE date(row.last_opened) END;

// Narration contains the dictionary pattern.
MATCH (p:Payment)
MATCH (pat:Pattern)
WHERE p.narration CONTAINS pat.pattern
MATCH (pat)-[:MATCHES]->(m:Merchant)
MERGE (p)-[:PAID_TO]->(m);

MATCH (p:Payment)
MATCH (md:Mandate)
WHERE p.narration = md.narration
MERGE (p)-[:AUTHORIZED_BY]->(md);

MATCH (msg:Message)
WHERE msg.merchant_brand IS NOT NULL AND msg.merchant_brand <> ''
MATCH (m:Merchant {brand: msg.merchant_brand})
MERGE (msg)-[:ABOUT]->(m);

// A commitment is 3 or more debits, or any debit count when a mandate exists.
// Swiggy is one debit and has no mandate, so it is not written.
MATCH (p:Payment)-[:PAID_TO]->(m:Merchant)
WHERE p.txn_kind IN ['debit_purchase', 'debit_bill', 'debit_vas', 'debit_emi']
WITH m, collect(p) AS payments, count(p) AS n
WHERE n >= 3 OR EXISTS { MATCH (m)<-[:FOR]-(:Mandate) }
MERGE (c:Commitment {commitment_id: m.brand})
SET c.payment_count = n
WITH c, m, payments
UNWIND payments AS p
MERGE (p)-[:GROUPED_INTO]->(c)
MERGE (c)-[:FOR]->(m);

// --- queries the screens read ---

// (a) One merchant even when the amount or the gap varies.
// MATCH (p:Payment)-[:GROUPED_INTO]->(c:Commitment)-[:FOR]->(m:Merchant)
// RETURN m.brand, c.payment_count, min(p.debit_inr) AS low, max(p.debit_inr) AS high;

// (b) PayPal Spotify and PayPal Netflix stay apart.
// MATCH (pat:Pattern)-[:MATCHES]->(m:Merchant)
// WHERE pat.pattern CONTAINS 'PAYPAL'
// RETURN pat.pattern, m.brand;

// (c) Swiggy is one payment and has no mandate.
// MATCH (p:Payment)-[:PAID_TO]->(m:Merchant {brand: 'Swiggy'})
// WHERE NOT EXISTS { MATCH (m)<-[:FOR]-(:Mandate) }
// WITH m, count(p) AS n
// WHERE n = 1
// RETURN m.brand, n;

// (d) Silent hike: two plateaus, no price_change message.
// MATCH (p:Payment)-[:PAID_TO]->(m:Merchant)
// WHERE p.txn_kind = 'debit_purchase' AND p.debit_inr IS NOT NULL
// WITH m, p ORDER BY p.date
// WITH m, collect(p.debit_inr) AS series
// WITH m, series, head(series) AS first_amt, last(series) AS last_amt
// WHERE first_amt < last_amt
//   AND all(x IN series WHERE x = first_amt OR x = last_amt)
//   AND NOT EXISTS { MATCH (:Message {event_type: 'price_change'})-[:ABOUT]->(m) }
// RETURN m.brand, first_amt, last_amt;

// (e) Zombie: last opened more than 90 days before 22 Oct 2026, payments continue.
// MATCH (c:Commitment)-[:FOR]->(m:Merchant)
// WHERE m.last_opened IS NOT NULL
//   AND duration.inDays(m.last_opened, date('2026-10-22')).days > 90
// RETURN m.brand, m.last_opened, m.opens_last_12_months;

// Simulate. One click. Safe to run twice.
// MERGE (m:Merchant {brand: 'Headspace Plus'})
//   ON CREATE SET m.product = 'Headspace Plus', m.mechanism = 'upi_autopay', m.cancel_mode = 'normal';
// MERGE (md:Mandate {mandate_id: 'MDT-SIM-01'})
//   ON CREATE SET md.mechanism = 'upi_autopay', md.narration = 'UPI/HEADSPACE/7712003344',
//     md.max_amount_inr = 299, md.frequency = 'monthly', md.mandate_ref = 'UMN-sim-headspace-01',
//     md.status = 'active', md.created_on = date('2026-10-22');
// MERGE (pay:Payment {txn_id: 'TXN-SIM-0001'})
//   ON CREATE SET pay.date = date('2026-10-22'), pay.narration = 'UPI/HEADSPACE/7712003344',
//     pay.debit_inr = 299, pay.channel = 'UPI', pay.txn_kind = 'debit_purchase',
//     pay.reference = 'ARCSIM000001';
// MERGE (msg:Message {notice_id: 'NTC-SIM-0001'})
//   ON CREATE SET msg.channel = 'sms', msg.event_type = 'mandate_created', msg.amount_inr = 299,
//     msg.sent_on = date('2026-10-22');
// WITH m, md, pay, msg
// MATCH (a:Account {account_id: 'SAV-PRIYA-9912'})
// MERGE (pay)-[:ON_ACCOUNT]->(a)
// MERGE (md)-[:ON_ACCOUNT]->(a)
// MERGE (pay)-[:AUTHORIZED_BY]->(md)
// MERGE (md)-[:FOR]->(m)
// MERGE (pay)-[:PAID_TO]->(m)
// MERGE (msg)-[:ABOUT]->(m)
// MERGE (pay)-[:NOTIFIED_BY]->(msg)
// MERGE (c:Commitment {commitment_id: 'Headspace Plus'})
// SET c.payment_count = 1
// MERGE (pay)-[:GROUPED_INTO]->(c)
// MERGE (c)-[:FOR]->(m);
