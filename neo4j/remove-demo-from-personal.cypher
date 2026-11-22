// Removes the SYNTHETIC demo graph (npm run seed's labels) from the PERSONAL database,
// once the demo has its own database (NEO4J_DEMO_*). Run it only against the personal
// Aura instance, only after checking query 11 in verify-warnings.cypher, and only
// with the team's agreement. It never touches personal labels (PaytraceUser,
// PaytraceSession, LiveProfile, LiveEvent, LivePayment, LiveMerchant, LiveSubscription).

// Step 1: look first. These are the nodes that would be removed.
MATCH (n) WHERE n:Person OR n:Account OR n:Payment OR n:Message OR n:Mandate OR n:Merchant OR n:Pattern OR n:Commitment
RETURN labels(n)[0] AS label, count(*) AS nodes ORDER BY label;

// Step 2: remove them, in batches.
MATCH (n) WHERE n:Person OR n:Account OR n:Payment OR n:Message OR n:Mandate OR n:Merchant OR n:Pattern OR n:Commitment
CALL (n) { DETACH DELETE n } IN TRANSACTIONS OF 1000 ROWS;
