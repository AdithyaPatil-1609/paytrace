/**
 * Personal and demo databases stay apart (Phase 1): demo code never reaches
 * the personal database, even when the demo one is missing or broken.
 * Connection strings here are made up; nothing connects anywhere real.
 */
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { demoSharesPersonalDatabase, getDemoDriver, hasDemoNeo4jConfig } from "../neo4j/client";
import { loadDemo } from "../server/data/load-demo";

const saved = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (key.startsWith("NEO4J")) delete process.env[key];
  Object.assign(process.env, Object.fromEntries(Object.entries(saved).filter(([key]) => key.startsWith("NEO4J"))));
});

function set(values: Record<string, string | undefined>) {
  for (const key of Object.keys(process.env)) if (key.startsWith("NEO4J")) delete process.env[key];
  for (const [key, value] of Object.entries(values)) if (value !== undefined) process.env[key] = value;
}

const personal = { NEO4J_URI: "neo4j+s://personal-example.databases.neo4j.io", NEO4J_USERNAME: "neo4j", NEO4J_PASSWORD: "made-up", NEO4J_DATABASE: "neo4j" };

test("demo mode is off without NEO4J_DEMO_*, even when the personal database is set", () => {
  set(personal);
  assert.equal(hasDemoNeo4jConfig(), false);
  assert.throws(() => getDemoDriver(), /demo database is not configured/);
});

test("demo settings pointing at the hosted personal database are refused", () => {
  set({ ...personal, NEO4J_DEMO_URI: personal.NEO4J_URI, NEO4J_DEMO_USERNAME: "neo4j", NEO4J_DEMO_PASSWORD: "made-up", NEO4J_DEMO_DATABASE: "neo4j" });
  assert.equal(demoSharesPersonalDatabase(), true);
  assert.throws(() => getDemoDriver(), /points at the personal database/);
});

test("a separate demo instance, or one local database for development, is allowed", () => {
  set({ ...personal, NEO4J_DEMO_URI: "neo4j+s://demo-example.databases.neo4j.io", NEO4J_DEMO_USERNAME: "neo4j", NEO4J_DEMO_PASSWORD: "made-up" });
  assert.equal(demoSharesPersonalDatabase(), false);
  set({ NEO4J_URI: "bolt://localhost:7687", NEO4J_USERNAME: "neo4j", NEO4J_PASSWORD: "x", NEO4J_DEMO_URI: "bolt://localhost:7687", NEO4J_DEMO_USERNAME: "neo4j", NEO4J_DEMO_PASSWORD: "x" });
  assert.equal(demoSharesPersonalDatabase(), false);
});

test("without a demo database the demo shows the CSV sample, never personal data", async () => {
  set(personal);
  const { source } = await loadDemo();
  assert.equal(source.kind, "fixture");
  assert.equal(source.personal, undefined);
});

test("when the demo database is down the demo shows the CSV sample, never personal data", async () => {
  set({ ...personal, NEO4J_DEMO_URI: "bolt://127.0.0.1:1", NEO4J_DEMO_USERNAME: "neo4j", NEO4J_DEMO_PASSWORD: "made-up" });
  const { source } = await loadDemo();
  assert.equal(source.kind, "fixture");
  assert.match(source.note ?? "", /unavailable|authenticated/);
});
