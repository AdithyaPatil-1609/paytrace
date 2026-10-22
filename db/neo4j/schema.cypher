// Run once before seeding: cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" < db/neo4j/schema.cypher
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (person:Person) REQUIRE person.id IS UNIQUE;
CREATE CONSTRAINT account_id IF NOT EXISTS FOR (account:Account) REQUIRE account.id IS UNIQUE;
CREATE CONSTRAINT transaction_id IF NOT EXISTS FOR (transaction:Transaction) REQUIRE transaction.id IS UNIQUE;
CREATE CONSTRAINT merchant_key IF NOT EXISTS FOR (merchant:Merchant) REQUIRE merchant.key IS UNIQUE;
CREATE CONSTRAINT commitment_id IF NOT EXISTS FOR (commitment:Commitment) REQUIRE commitment.id IS UNIQUE;
CREATE CONSTRAINT notice_id IF NOT EXISTS FOR (notice:Notice) REQUIRE notice.id IS UNIQUE;
CREATE CONSTRAINT mandate_id IF NOT EXISTS FOR (mandate:Mandate) REQUIRE mandate.id IS UNIQUE;
