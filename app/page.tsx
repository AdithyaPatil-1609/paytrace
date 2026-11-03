/**
 * App entry (server).
 * 1. Prefer the live Neo4j dataset, Cypher commitments and evidence graph findings.
 * 2. Else offline CSV fixture.
 * 3. Hand the result to the client shell (components/dashboard.tsx).
 */
import { Dashboard } from "@/components/dashboard";
import { hasNeo4jConfig, loadDatasetFromNeo4j, type LoadedDataset, type SourceInfo } from "@/db/neo4j/dataset";
import { loadFixtures } from "@/data/fixtures";

// Read per request, so a change in the graph or in data/raw shows on reload.
export const dynamic = "force-dynamic";

const fixtureSource: SourceInfo = {
  kind: "fixture",
  counts: { payments: 0, messages: 0, mandates: 0, patterns: 0, commitments: 0 }
};

/**
 * Live mode is Neo4j: the evidence graph holds the rows, and Cypher decides
 * the commitments the screens render. The CSV fixture is offline-only — so a
 * reviewer without a running Neo4j can still open the prototype. It is not the scored path.
 */
function fixtureFallback(note: string): SourceInfo {
  return { ...fixtureSource, note };
}

async function load(): Promise<LoadedDataset> {
  if (hasNeo4jConfig()) {
    try {
      const live = await loadDatasetFromNeo4j();
      if (live.dataset.statement.length > 0) return live;
      console.warn("Neo4j is configured but holds no payments. Run npm run seed. Falling back to the fixture.");
      const loaded = loadFixtures();
      return {
        dataset: loaded,
        source: fixtureFallback(
          "Showing saved CSV statements. No payments are available from the connected graph."
        )
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Neo4j unreachable, falling back to the fixture:", message);
      const loaded = loadFixtures();
      const note = /unauthorized|authentication/i.test(message)
        ? "Showing saved CSV statements. The graph connection could not be authenticated."
        : "Showing saved CSV statements. The graph connection is currently unavailable.";
      return { dataset: loaded, source: fixtureFallback(note) };
    }
  }
  const dataset = loadFixtures();
  return {
    dataset,
    source: {
      ...fixtureSource,
      counts: { ...fixtureSource.counts, payments: dataset.statement.length },
      note: "Payments and insights from saved CSV statements."
    }
  };
}

export default async function Home() {
  const { dataset, source, commitments, graph } = await load();
  return <Dashboard dataset={dataset} source={source} commitments={commitments} graph={graph} />;
}
