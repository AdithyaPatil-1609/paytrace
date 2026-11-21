import "./load-env-local";

async function main() {
  const { getNeo4jDriver } = await import("../db/neo4j/client");
  const { getAgentDriver } = await import("../db/neo4j/agent-client");
  const { syncAgentGraph } = await import("../db/neo4j/agent-sync");
  const profile = process.env.PERSONAL_NEO4J_PROFILE?.trim();
  if (!profile) throw new Error("Set PERSONAL_NEO4J_PROFILE in .env.local first.");

  // Calling the command is an explicit manual sync of the configured profile.
  const mainDriver = getNeo4jDriver();
  try {
    const agentDriver = getAgentDriver();
    try {
      const counts = await syncAgentGraph(profile);
      console.log("Agent graph synchronized:", counts);
    } finally {
      await agentDriver.close();
    }
  } finally {
    await mainDriver.close();
  }
}
main().catch(() => {
  // Avoid logging database credentials, query parameters, or records.
  console.error("Agent sync failed. Check both database configurations, the configured profile, and that Database 2 is empty or contains its own managed mirror. Retry after ingestion finishes.");
  process.exitCode = 1;
});
