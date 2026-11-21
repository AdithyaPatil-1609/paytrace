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
