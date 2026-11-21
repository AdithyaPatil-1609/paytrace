import neo4j, { type Driver } from "neo4j-driver";

/** Dedicated Aura Agent connection. It must never reuse the main or demo instance. */
let agentDriver: Driver | undefined;

const env = (name: string) => process.env[name]?.trim() || undefined;

export function hasAgentNeo4jConfig() {
  return Boolean(env("PERSONAL_NEO4J_URI") && env("PERSONAL_NEO4J_USERNAME") && env("PERSONAL_NEO4J_PASSWORD"));
}

export function getAgentDriver() {
  const uri = env("PERSONAL_NEO4J_URI");
  const username = env("PERSONAL_NEO4J_USERNAME");
  const password = env("PERSONAL_NEO4J_PASSWORD");
  if (!uri || !username || !password) {
    throw new Error("Agent database not configured. Set PERSONAL_NEO4J_URI, PERSONAL_NEO4J_USERNAME and PERSONAL_NEO4J_PASSWORD.");
  }

  const host = new URL(uri).hostname;
  for (const other of ["NEO4J_URI", "NEO4J_DEMO_URI"]) {
    const otherUri = env(other);
    if (otherUri && new URL(otherUri).hostname === host) {
      throw new Error("Agent database must use a separate instance from the main and demo databases.");
    }
  }

  if (!agentDriver) {
    agentDriver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  }
  return agentDriver;
}

export const agentDatabase = env("PERSONAL_NEO4J_DATABASE") ?? "neo4j";
