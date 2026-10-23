import { Dashboard } from "@/components/dashboard";
import { hasNeo4jConfig, loadDatasetFromNeo4j, type SourceInfo } from "@/db/neo4j/dataset";
import { loadFixtures } from "@/lib/fixtures";
import type { Commitment, Dataset } from "@/lib/types";

// Read per request, so a change in the graph or in data/raw shows on reload.
export const dynamic = "force-dynamic";

const fixtureSource: SourceInfo = {
  kind: "fixture",
  counts: { payments: 0, messages: 0, mandates: 0, patterns: 0, commitments: 0 }
};

/**
 * Neo4j is the source when it is configured and reachable. The CSV fixture is
 * the fallback, so the prototype still runs for a reviewer with no database.
 * Neo4j also runs the analysis query, and those commitments are what the
 * screens render. The CSV fallback still detects in lib/engine.
 */
function fixtureFallback(note: string): SourceInfo {
  return { ...fixtureSource, note };
}

async function load(): Promise<{ dataset: Dataset; source: SourceInfo; commitments?: Commitment[] }> {
  if (hasNeo4jConfig()) {
    try {
      const { dataset, source, commitments } = await loadDatasetFromNeo4j();
      if (dataset.statement.length > 0) return { dataset, source, commitments };
      console.warn("Neo4j is configured but holds no payments. Run npm run seed. Falling back to the fixture.");
      const loaded = loadFixtures();
      return {
        dataset: loaded,
        source: fixtureFallback("Neo4j answered, but the graph has no payments. Run npm run seed.")
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Neo4j unreachable, falling back to the fixture:", message);
      const loaded = loadFixtures();
      const note = /unauthorized|authentication/i.test(message)
        ? "Aura rejected the login. The password in .env.local does not match this instance."
        : "Neo4j is configured but could not be reached. These screens are on the CSV fixture.";
      return { dataset: loaded, source: fixtureFallback(note) };
    }
  }
  const dataset = loadFixtures();
  return {
    dataset,
    source: {
      ...fixtureSource,
      counts: { ...fixtureSource.counts, payments: dataset.statement.length },
      note: "These screens are on the CSV fixture because Neo4j is not configured."
    }
  };
}

export default async function Home() {
  const { dataset, source, commitments } = await load();
  return <Dashboard dataset={dataset} source={source} commitments={commitments} />;
}
