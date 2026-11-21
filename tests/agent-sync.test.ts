import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { requireAgentProfile } from "../db/neo4j/agent-sync";

const saved = process.env.PERSONAL_NEO4J_PROFILE;
afterEach(() => {
  if (saved === undefined) delete process.env.PERSONAL_NEO4J_PROFILE;
  else process.env.PERSONAL_NEO4J_PROFILE = saved;
});

test("sync requires the configured profile and rejects other profiles", () => {
  delete process.env.PERSONAL_NEO4J_PROFILE;
  assert.throws(() => requireAgentProfile("test-person"), /not authorized/);
  process.env.PERSONAL_NEO4J_PROFILE = "test-person";
  assert.equal(requireAgentProfile("test-person"), "test-person");
  assert.throws(() => requireAgentProfile("other-person"), /not authorized/);
});
