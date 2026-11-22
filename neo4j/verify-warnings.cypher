// Verification queries for the payment chains and live warnings.
// Paste into Neo4j Query Workspace one block at a time. Set the profile first:
//   :param profile => 'google-<your profile hash>'
// Find yours with:  MATCH (u:PaytraceUser {email:'you@example.com'}) RETURN u.profile
// Nothing here writes. Chains are rebuilt by the app when /api/account/warnings is read.

// 1. Subscriptions and chain sizes for one person.
MATCH (:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription)
RETURN s.merchant, s.paymentCount, s.firstDate, s.latestDate ORDER BY s.latestDate DESC;

// 2. One chain end to end, with gapDays and deltaPaise on every NEXT.
MATCH (:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription)-[:FIRST]->(f)
MATCH path = (f)-[:NEXT*0..]->(last) WHERE NOT (last)-[:NEXT]->()
RETURN s.merchant, [p IN nodes(path) | p.date + ' ₹' + toString(p.amountPaise / 100.0)] AS payments,
       [r IN relationships(path) | {gapDays: r.gapDays, deltaPaise: r.deltaPaise, pctChange: r.pctChange}] AS steps;

// 3. Integrity: exactly one FIRST and one LATEST per subscription (expect no rows).
MATCH (:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription)
WITH s, COUNT { (s)-[:FIRST]->() } AS firsts, COUNT { (s)-[:LATEST]->() } AS latests
WHERE firsts <> 1 OR latests <> 1 RETURN s.merchant, firsts, latests;

// 4. Integrity: no NEXT between two people or two merchants, no cycles (expect 0, 0).
MATCH (a:LivePayment)-[:NEXT]->(b:LivePayment) WHERE a.profile <> b.profile OR a.merchantKey <> b.merchantKey
WITH count(*) AS crossLinks
OPTIONAL MATCH cycle = (p:LivePayment)-[:NEXT*1..50]->(p)
RETURN crossLinks, count(cycle) AS cycles;

// 5. Integrity: one Gmail + SMS copy of a debit is one payment with several evidence records.
MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment) WHERE size(p.sources) > 1
RETURN p.merchant, p.date, p.amountPaise, p.sources, COUNT { (p)-[:EVIDENCED_BY]->() } AS evidence;

// 6. Query 1, price rises of 2% or more, with any matching notice.
MATCH (u:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s)-[:FIRST]->()-[:NEXT*0..]->(a)-[n:NEXT]->(b)
WHERE n.deltaPaise > 0 AND n.deltaPaise * 100 >= 2 * toInteger(a.amountPaise) AND n.gapDays >= 5 AND n.gapDays <= 400
OPTIONAL MATCH (u)-[:RECEIVED]->(notice:LiveEvent {kind:'price_change'})-[:ABOUT]->(m) WHERE m.key = s.merchantKey AND notice.date <= b.date
RETURN s.merchant, a.date, a.amountPaise, b.date, b.amountPaise, n.pctChange, collect(notice.date) AS notices;

// 7. Query 2, verified mandate limits against debits.
MATCH (u:LiveProfile {id:$profile})-[:RECEIVED]->(m:LiveEvent {kind:'mandate_created'})-[:ABOUT]->(mm)
MATCH (u)-[:HAS_PAYMENT]->(p:LivePayment {merchantKey: mm.key}) WHERE p.date >= m.date
RETURN mm.name AS merchant, m.amountPaise AS limitPaise, p.date, p.amountPaise, p.amountPaise > m.amountPaise AS overLimit;

// 8. Query 3, usage facts on subscriptions (null means usage unavailable, never unused).
MATCH (:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s)
RETURN s.merchant, s.lastVerifiedUsageAt, s.usageSource, s.usageCoverage;

// 9. Query 4, payments after a cancellation (user confirmed or mandate cancelled).
MATCH (u:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s)
OPTIONAL MATCH (u)-[:RECEIVED]->(mc:LiveEvent {kind:'mandate_cancelled'})-[:ABOUT]->(mm) WHERE mm.key = s.merchantKey
WITH u, s, min(mc.date) AS mandateCancelledOn
WHERE s.cancelEffectiveOn IS NOT NULL OR mandateCancelledOn IS NOT NULL
MATCH (u)-[:HAS_PAYMENT]->(p:LivePayment {merchantKey: s.merchantKey})
WHERE p.date > coalesce(s.cancelEffectiveOn, mandateCancelledOn)
RETURN s.merchant, s.cancelEffectiveOn, mandateCancelledOn, p.date, p.amountPaise;

// 10. Upcoming notices in the next 7 days.
MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent)
WHERE e.kind IN ['debit_scheduled','subscription_renewal']
  AND coalesce(e.renewalDate, e.date) >= toString(date()) AND coalesce(e.renewalDate, e.date) <= toString(date() + duration({days:7}))
RETURN e.merchant, coalesce(e.renewalDate, e.date) AS due, e.amountPaise;

// 11. Database separation: in the PERSONAL database this should be 0 once the
//     synthetic demo graph has been moved out (see remove-demo-from-personal.cypher).
MATCH (n) WHERE n:Person OR n:Account OR n:Payment OR n:Message OR n:Mandate OR n:Merchant OR n:Pattern OR n:Commitment
RETURN count(n) AS syntheticNodesHere;
