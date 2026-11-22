# Aura Agent knowledge database

The production assistant uses two independent graphs:
- Main (`NEO4J_*`): authenticated user-specific financial records.
- Agent (`PERSONAL_NEO4J_*`): shared, non-personal merchant knowledge. Never attach the agent to the main or any private mirror database.
- Optional demo (`NEO4J_DEMO_*`): synthetic transactions.

Run `npm run agent:seed` from the project root. It only projects the repository's merchant dictionary and general payment-mechanism guidance. No Gmail, SMS, user IDs or payment records are transferred. It refuses to run if the target contains an unmanaged or previous private mirror graph. It never deletes data.

Check in the second instance:
```cypher
MATCH (n) RETURN labels(n) AS labels, count(n) AS total
```

All nodes should have the AgentKnowledge label. Verify the entire target is private-data-free before attaching an agent. If a previous profile mirror was seeded, keep the agent disabled and obtain authorization before deleting or migrating any existing records.

Example fixed read-only Cypher Template:
```cypher
MATCH (m:AgentMerchant)-[:HAS_ALIAS]->(a:AgentMerchantAlias)-[:MAY_USE]->(p:AgentMechanism)
WHERE toLower(m.name) CONTAINS toLower($merchant)
RETURN m.name AS merchant, a.product AS product, p.name AS possibleBillingMethod, p.guidance AS guidance, p.caution AS caution
LIMIT 10
```

The catalog's billing mechanisms are sample mappings, not verified facts about any particular person's payment. Do not accept a raw personal question, account ID, email, amount or transaction reference as a remote agent tool parameter. The application should retain authenticated personal calculations in the main database and pass only catalog-recognized merchant information to the external agent.

## Web assistant integration

Keep `PAYTRACE_AURA_AGENT_ENABLED=false` while the agent is Internal. This does not affect the local Qwen assistant. When ready to incur external-agent charges, change the agent to External in Aura Console, copy its REST endpoint, and generate Aura API credentials (not database credentials). On the web host set:

```dotenv
PAYTRACE_AURA_AGENT_ENABLED=true
AURA_AGENT_ENDPOINT=https://api.neo4j.io/...
AURA_CLIENT_ID=
AURA_CLIENT_SECRET=
```

Rebuild/restart the app. In a signed-in account open Ask Paytrace, opt in to general Aura guidance, and ask "How do I cancel Spotify Premium?" or "How do I revoke UPI AutoPay?". A successful response displays the Neo4j Aura Agent source label only if the named Cypher template supplied matching records. If the agent returns no usable records, is unavailable or times out, the normal local answer is used. Personal calculations, account status and pasted payment alerts remain local. The UI never sends credentials to the browser; only server-generated catalog questions are sent to Aura. The public demo cannot invoke the paid agent.

Configure the two read-only tools with these output aliases:

- `merchant_lookup` (string `merchant`): return `merchant`, `product`, `billingMethod` (or `possibleBillingMethod`), `guidance`, `caution`.
- `payment_mechanism_guide` (string): accept the payment mechanism name or key; return `mechanism` (name or key), `guidance`, `caution`.

Disable Text2Cypher for this catalog agent if it is not needed. Never connect the external agent to the private profile database. To stop paid agent charges, return it to Internal in Aura Console; setting the application flag false alone does not stop Aura billing.
