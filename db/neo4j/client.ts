import neo4j, { type Driver } from "neo4j-driver";

let driver: Driver | undefined;

export function hasNeo4jConfig() {
  return Boolean(process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD);
}

export function getNeo4jDriver() {
  if (!hasNeo4jConfig()) {
    throw new Error("Neo4j is not configured. Add NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD.");
  }

  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!)
    );
  }

  return driver;
}

export const neo4jDatabase = process.env.NEO4J_DATABASE || "neo4j";
