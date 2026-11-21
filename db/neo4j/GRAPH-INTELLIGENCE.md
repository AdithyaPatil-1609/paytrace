# Graph intelligence: SIMILAR merchants, source trust, the Cypher that ran

Why this file: it is the one place that explains what Tasks 1-6 added to the
personal graph, how to check it with Cypher, and how to show it to judges.

## Schema additions (personal database only)

```
(:LiveMerchant {id, name, key, profile})-[:SIMILAR {score, method, reason, band, status,
    detectedAt, decidedAt, decidedBy, algorithmVersion, profile}]->(:LiveMerchant)
(:LiveEvent {..., sourceTrust, verificationStatus, verificationMethod, trustReason, verifiedAt})
```

- `SIMILAR` joins two merchants of **one** person (both reached from that
  person's events), always from the smaller id to the larger, never a merchant
  to itself. `status` is `candidate`, `confirmed` or `rejected`; a rebuild
  never overwrites a decision. It is a suggestion only: payments are never
  merged and links are never followed in a chain.
- `band`: `strong` (score at or above 0.90) or `review` (0.75 to 0.90). Below
  0.75 no link is made. Limits live in `lib/payments/rules.ts` (`MERCHANT_MATCH`).
- `sourceTrust` is set on the server from checks that ran
  (`lib/ingestion/trust.ts`):

| Evidence | sourceTrust | Why |
| --- | --- | --- |
| Gmail email, Gmail DKIM/DMARC pass for the From domain | `verified_origin` | The sender's domain signed it |
| Gmail email, no verdict | `unverified` | Who sent it is not proven |
| SMS from a paired phone with a valid signature | `authenticated_source` | Proves the phone, not the bank |
| SMS from the iPhone Shortcut token | `authenticated_source` | Proves the Shortcut, not the bank |
| SMS with the old shared pairing code | `unverified` | Does not prove which phone |
| Uploaded bank statement line | `user_provided` | The file's authenticity is not checked |
| Anything stored before this change | none (read as `unverified`) | Never upgraded |

A payment is "confirmed by two channels" when its `EVIDENCED_BY` events come
from two or more different sources (SMS, email, statement). Two copies of one
Gmail message are one event (same Gmail id), so they never count twice.

## Where it runs

- SIMILAR candidates are refreshed with the payment chains
  (`ensureChains` in `chains.ts`), whenever a person's revision changed.
- `/api/account/graph` returns SIMILAR links, trust counts, two-channel
  payments and the metadata of every query that ran (`readGraphWarnings` now
  records each query's template, success, row count and the warnings it fed).
  The profile comes from the session cookie only.
- `/api/account/merchants/similar` lets the owner confirm or reject a link.
- `scripts/backfill-similar.ts` backfills older records: dry run by default,
  `--write` to store, refuses a non-local database without `--allow-remote`.
  It has not been run against production.

## Cypher checks (run in Neo4j Browser on the personal database; read-only)

```cypher
// 1. No SIMILAR link joins two people (expect 0)
MATCH (a:LiveMerchant)-[r:SIMILAR]->(b:LiveMerchant)
WHERE NOT EXISTS { MATCH (p:LiveProfile)-[:RECEIVED]->(:LiveEvent)-[:ABOUT]->(a)
                   MATCH (p)-[:RECEIVED]->(:LiveEvent)-[:ABOUT]->(b) }
RETURN count(r) AS crossProfileLinks;

// 2. No self-links and no reversed duplicates (expect 0, 0)
MATCH (m:LiveMerchant)-[r:SIMILAR]->(m) WITH count(r) AS selfLinks
OPTIONAL MATCH (a:LiveMerchant)-[r:SIMILAR]->(b:LiveMerchant) WHERE a.id > b.id
RETURN selfLinks, count(r) AS reversed;

// 3. Trust levels by channel
MATCH (e:LiveEvent) RETURN e.source AS source, coalesce(e.sourceTrust, 'legacy') AS trust, count(*) AS events ORDER BY source, trust;

// 4. Payments confirmed by two channels
MATCH (p:LivePayment)-[:EVIDENCED_BY]->(e:LiveEvent)
WITH p, collect(DISTINCT e.source) AS sources WHERE size(sources) >= 2
RETURN count(p) AS corroboratedPayments;

// 5. Chains are chronological (expect 0)
MATCH (a:LivePayment)-[n:NEXT]->(b:LivePayment) WHERE b.date < a.date RETURN count(n) AS outOfOrder;
```

## Demo for judges (about 3 minutes)

1. Sign in, open **Evidence graph** (screen 5).
2. **Possibly the same merchant**: two of your merchants joined by `:SIMILAR`
   with a score, the reason and the method. Press **Not the same**: the link is
   kept as rejected and a rebuild does not bring it back. Point out that
   Google One, Google Play and YouTube are never linked.
3. **How far each record can be trusted**: channels against trust levels, then
   payments confirmed by both SMS and email, each piece with its badge.
4. **Cypher that ran**: every parameterized query behind the warnings, with
   success, rows, the warnings it produced and the evidence. `$profile` comes
   from the session and is never shown; the browser cannot send Cypher.
5. **Issues** screen: each warning's evidence now carries its trust badge and
   "confirmed by 2 channels" where true.

## Tests

- `tests/merchant-match.test.ts`, `tests/source-trust.test.ts`: thresholds,
  related-brand false matches, trust rules.
- `tests/cypher/graph-intelligence.test.ts` (throwaway Neo4j only): SIMILAR
  ordering, idempotence, decisions, no cross-profile links; trust storage and
  legacy records; repeated Gmail syncs, ambiguous review, real repeats; query
  metadata without private values; route-level profile tampering.
