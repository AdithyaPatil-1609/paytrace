import "./load-env-local";

async function main() {
  const { getAgentDriver } = await import("../neo4j/agent-client");
  const { seedAgentKnowledge } = await import("../neo4j/agent-knowledge");
  const driver = getAgentDriver();
  try {
    const counts = await seedAgentKnowledge();
    console.log("Agent knowledge seeded:", counts);
  } finally {
    await driver.close();
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "";
  if (message === "Database 2 contains private, demo or unmanaged data. Do not attach an Aura Agent to it." ||
      message === "The merchant catalog is empty.") console.error(message);
  else console.error("Agent knowledge seed failed. Check the separate database credentials and permissions.");
  process.exitCode = 1;
});
