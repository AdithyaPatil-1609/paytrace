/**
 * The live engine, locked the way tests/analysis.test.ts locks the offline one.
 *
 * Needs a seeded Neo4j (NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD from the
 * environment or .env.local; then npm run seed). Without one, every test here
 * is skipped, not passed. CI runs
 * them against a Neo4j service container on every push.
 *
 * Nothing here writes to the stored graph: anything extra is written inside a
 * transaction that is rolled back.
 */
import "../scripts/load-env-local";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { Driver, Session } from "neo4j-driver";
import { withSimulatedAutopay } from "../data/simulation";
import { analyzeCommitments } from "../db/neo4j/analyze";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../db/neo4j/client";
import { loadGraphFacts } from "../db/neo4j/graph";
import { analyzeWithSimulatedAutopay } from "../db/neo4j/simulate";
import { writePayments } from "../db/neo4j/write";
import { isSilentPriceHike, isTrialConverted, isZombie, unusedTotal, yearlyTotal } from "../lib/analysis";
import { detectCommitments } from "../lib/engine";
import { AS_OF, loadFixtures, loadParserFixtures } from "../lib/fixtures";
import { RULES } from "../lib/rules";
import type { Commitment } from "../lib/types";

const skip = hasNeo4jConfig() ? false : "Neo4j is not configured. Set NEO4J_* and run npm run seed.";

const byId = (list: Commitment[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));

describe("Cypher engine on the live graph", { skip }, () => {
  let driver: Driver;
  let session: Session;
  let cypher: Commitment[];
  const dataset = loadFixtures();
  const offline = detectCommitments(dataset);
  const find = (merchant: string) => cypher.find((item) => item.merchant === merchant)!;

  before(async () => {
    driver = getNeo4jDriver();
    session = driver.session({ database: neo4jDatabase });
    const seeded = await session.run("MATCH (p:Payment) RETURN count(p) AS n");
    assert.ok(seeded.records[0].get("n").toNumber() > 0, "The graph is empty. Run npm run seed first.");
    cypher = await analyzeCommitments(session, AS_OF);
  });

  after(async () => {
    await session?.close();
    await driver?.close();
  });

  // One answer, two runners.

  test("C1. Cypher and the TypeScript engine agree on every field of every commitment", () => {
    assert.equal(cypher.length, offline.length);
    assert.deepEqual(byId(cypher), byId(offline));
  });

  // The nine checks, asked of Cypher directly, so a failure names the rule.

  test("C2. Spotify at 119, 119, 139, 139 with no price notice is a silent hike", () => {
    const spotify = find("Spotify");
    assert.equal(spotify.amountPattern, "step");
    assert.equal(spotify.previousAmount, 119);
    assert.equal(spotify.amount, 139);
    assert.equal(spotify.hasPriceChangeNotice, false);
    assert.equal(isSilentPriceHike(spotify), true);
  });

  test("C3. the YouTube trial notice followed by 149 is a converted trial, the ₹1 hold is evidence", () => {
    const youtube = find("YouTube");
    assert.equal(isTrialConverted(youtube), true);
    assert.equal(youtube.amount, 149);
    assert.deepEqual(youtube.holds.map((row) => row.amount), [1]);
  });

  test("C4. the monthly gym last opened eleven months ago is a zombie", () => {
    const gym = find("FitLine Gym");
    assert.equal(gym.cadence, "monthly");
    assert.equal(isZombie(gym), true);
    assert.equal(gym.kind, "unused");
  });

  test("C5. one Swiggy order and one transfer to Rahul are not commitments", () => {
    assert.equal(cypher.some((item) => item.rawNarration.includes("SWIGGY")), false);
    assert.equal(cypher.some((item) => item.rawNarration.includes("RAHUL")), false);
  });

  test("C6. electricity from 900 to 3,200 is one variable commitment", () => {
    const bescom = cypher.filter((item) => item.rawNarration === "BESCOM BILLPAY");
    assert.equal(bescom.length, 1);
    assert.equal(bescom[0].amountPattern, "variable");
    assert.equal(bescom[0].amount, 1800);
    assert.equal(bescom[0].annualCost, 21600);
  });

  test("C7. society on scattered dates is one irregular commitment", () => {
    const society = cypher.filter((item) => item.rawNarration === "NEFT APT SOCIETY");
    assert.equal(society.length, 1);
    assert.equal(society[0].cadence, "irregular");
    assert.equal(society[0].annualCost, 18000);
  });

  test("C8. the loan is an obligation with no cancel action", () => {
    const loan = find("Home loan");
    assert.equal(loan.kind, "debt");
    assert.equal(loan.cancelMode, "block");
    assert.equal(loan.canCancel, false);
  });

  test("C9. the year adds to 1,99,138 over 14 commitments, 27,936 of it unused", () => {
    assert.equal(cypher.length, 14);
    assert.equal(yearlyTotal(cypher), 199138);
    assert.equal(unusedTotal(cypher), 27936);
  });

  test("C10. ids are unique and carry the account, as offline", () => {
    const ids = cypher.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(find("Spotify").id, "spotify-cc-priya-2291");
    assert.equal(find("FitLine Gym").id, "fitline-gym-sav-priya-9912");
  });

  // What used to be TypeScript-only.

  test("C11. PayPal Spotify and PayPal Netflix stay two commitments in Cypher too", async () => {
    const parser = loadParserFixtures();
    const tx = session.beginTransaction();
    try {
      await tx.run("MERGE (:Person {persona: 'priya'})");
      await writePayments(tx, parser.statement);
      const withParser = await analyzeCommitments(tx, AS_OF);
      const paypal = withParser.filter((item) => item.rawNarration.startsWith("PAYPAL"));
      assert.deepEqual(paypal.map((item) => item.rawNarration).sort(), ["PAYPAL *NETFLIX", "PAYPAL *SPOTIFY"]);
      assert.equal(new Set(withParser.map((item) => item.id)).size, withParser.length);
      // And the offline engine reads the same rows the same way.
      const offlineWithParser = detectCommitments({ ...dataset, statement: [...dataset.statement, ...parser.statement] });
      assert.deepEqual(byId(withParser), byId(offlineWithParser));
    } finally {
      await tx.rollback();
    }
  });

  test("C12. Simulate runs in Cypher, finds Headspace, and leaves the stored graph unchanged", async () => {
    const count = async () =>
      (await session.run("MATCH (n) RETURN count(n) AS n")).records[0].get("n").toNumber() as number;
    const before = await count();
    const simulated = await analyzeWithSimulatedAutopay();
    const headspace = simulated.find((item) => item.merchant === "Headspace Plus")!;
    assert.equal(headspace.amount, 299);
    assert.equal(headspace.annualCost, 3588);
    assert.equal(headspace.issue, undefined);
    assert.equal(yearlyTotal(simulated), 202726);
    assert.deepEqual(byId(simulated), byId(detectCommitments(withSimulatedAutopay(dataset))));
    assert.equal(await count(), before);
  });

  test("C13. thresholds reach the query from lib/rules.ts, they are not written into it", async () => {
    const lenient = await analyzeCommitments(session, AS_OF, { ...RULES, zombieDays: 400 });
    const gym = lenient.find((item) => item.merchant === "FitLine Gym")!;
    assert.equal(gym.signals.includes("zombie"), false);
    assert.equal(gym.kind, "essential");
  });

  // Screen 00.

  test("C14. the graph findings name Spotify, YouTube, and 24,341 paid after the last open", async () => {
    const graph = await loadGraphFacts(session, AS_OF);
    assert.deepEqual(
      graph.silentHikes.rows.map((row) => [row.brand, row.from, row.to]),
      [["Spotify", 119, 139]]
    );
    assert.deepEqual(graph.trials.rows.map((row) => [row.brand, row.amount, row.hold]), [["YouTube", 149, 1]]);
    assert.deepEqual(
      graph.unopened.rows.map((row) => row.brand).sort(),
      ["Caller tune", "Canva", "FitApp", "FitLine Gym"]
    );
    assert.equal(graph.unopened.rows.reduce((sum, row) => sum + row.paid, 0), 24341);
    assert.equal(graph.focus?.brand, "Spotify");
    assert.deepEqual(graph.focus?.messages.map((row) => row.eventType), ["debit_sms"]);
  });
});
