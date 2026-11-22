import neo4j, { type Driver } from "neo4j-driver";

/**
 * Two independent Neo4j connections. The personal database (NEO4J_*) holds
 * signed-in people's real records; the demo database (NEO4J_DEMO_*) holds
 * synthetic data only. Which one a request uses is decided here, on the
 * server, never by the browser. Demo code never falls back to the personal
 * database: when the demo database is not configured, demo pages show the
 * offline CSV sample instead.
 */

let driver: Driver | undefined;
let demoDriver: Driver | undefined;

const env = (name: string) => process.env[name]?.trim() || undefined;

/** Personal database: accounts, Gmail and SMS ingestion, and personal warnings. */
export function hasNeo4jConfig() {
  return Boolean(env("NEO4J_URI") && env("NEO4J_USERNAME") && env("NEO4J_PASSWORD"));
}

export function getNeo4jDriver() {
  if (!hasNeo4jConfig()) {
    throw new Error("Neo4j is not configured. Add NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD.");
  }
  if (!driver) {
    driver = neo4j.driver(env("NEO4J_URI")!, neo4j.auth.basic(env("NEO4J_USERNAME")!, env("NEO4J_PASSWORD")!));
  }
  return driver;
}

export const neo4jDatabase = process.env.NEO4J_DATABASE || "neo4j";

/** Demo database: the synthetic seed, demo pages, simulations and Cypher tests. */
export function hasDemoNeo4jConfig() {
  return Boolean(env("NEO4J_DEMO_URI") && env("NEO4J_DEMO_USERNAME") && env("NEO4J_DEMO_PASSWORD"));
}

export const demoDatabase = () => env("NEO4J_DEMO_DATABASE") ?? "neo4j";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function where(uri: string | undefined, database: string) {
  try {
    const url = new URL(uri ?? "");
    return { place: `${url.hostname}:${url.port || "7687"}/${database}`, local: LOCAL_HOSTS.has(url.hostname) };
  } catch {
    return { place: `${uri}/${database}`, local: false };
  }
}

/**
 * True when the demo settings point at the very database that holds personal
 * records. Allowed only for a database on this machine (local development and
 * CI, where both are throwaway); a hosted personal database is never shared.
 */
export function demoSharesPersonalDatabase() {
  if (!hasDemoNeo4jConfig() || !hasNeo4jConfig()) return false;
  const demo = where(env("NEO4J_DEMO_URI"), demoDatabase());
  const personal = where(env("NEO4J_URI"), neo4jDatabase);
  return demo.place === personal.place && !demo.local;
}

export function getDemoDriver() {
  if (!hasDemoNeo4jConfig()) {
    throw new Error("The demo database is not configured. Add NEO4J_DEMO_URI, NEO4J_DEMO_USERNAME and NEO4J_DEMO_PASSWORD.");
  }
  if (demoSharesPersonalDatabase()) {
    throw new Error("NEO4J_DEMO_* points at the personal database. Use a separate Aura instance for demo data.");
  }
  if (!demoDriver) {
    demoDriver = neo4j.driver(env("NEO4J_DEMO_URI")!, neo4j.auth.basic(env("NEO4J_DEMO_USERNAME")!, env("NEO4J_DEMO_PASSWORD")!));
  }
  return demoDriver;
}

/** Host only, for the "data from" label. Never the password. */
export function demoHost() {
  try {
    return new URL(env("NEO4J_DEMO_URI") ?? "").host;
  } catch {
    return undefined;
  }
}
