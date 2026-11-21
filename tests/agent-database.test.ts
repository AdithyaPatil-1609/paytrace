import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { getAgentDriver, hasAgentNeo4jConfig } from "../db/neo4j/agent-client";

const keys = ["PERSONAL_NEO4J_URI", "PERSONAL_NEO4J_USERNAME", "PERSONAL_NEO4J_PASSWORD", "NEO4J_URI", "NEO4J_DEMO_URI"];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));

function set(values: Record<string, string | undefined>) {
  for (const key of keys) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => set(saved));

const agent = {
  PERSONAL_NEO4J_URI: "neo4j+s://agent-example.databases.neo4j.io",
  PERSONAL_NEO4J_USERNAME: "neo4j",
  PERSONAL_NEO4J_PASSWORD: "made-up"
};

test("agent database requires its own complete configuration", () => {
  set({ NEO4J_URI: agent.PERSONAL_NEO4J_URI });
  assert.equal(hasAgentNeo4jConfig(), false);
  assert.throws(() => getAgentDriver(), /Agent database not configured/);
});

test("agent cannot reuse the main instance", () => {
  set({ ...agent, NEO4J_URI: agent.PERSONAL_NEO4J_URI });
  assert.throws(() => getAgentDriver(), /separate instance/);
});

test("agent cannot reuse the demo instance", () => {
  set({ ...agent, NEO4J_DEMO_URI: agent.PERSONAL_NEO4J_URI });
  assert.throws(() => getAgentDriver(), /separate instance/);
});
