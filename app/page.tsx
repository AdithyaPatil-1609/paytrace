import { Dashboard } from "@/components/dashboard";
import { hasNeo4jConfig, loadDatasetFromNeo4j, type SourceInfo } from "@/db/neo4j/dataset";
import { loadFixtures } from "@/lib/fixtures";
import type { Dataset } from "@/lib/types";

// Read per request, so a change in the graph or in data/raw shows on reload.
export const dynamic = "force-dynamic";

const fixtureSource: SourceInfo = {
  kind: "fixture",
  counts: { payments: 0, messages: 0, mandates: 0, patterns: 0, commitments: 0 }
};

/**
 * Neo4j is the source when it is configured and reachable. The CSV fixture is
 * the fallback, so the prototype still runs for a reviewer with no database.
 * Both paths hand the same Dataset to the same detection engine.
 */
async function load(): Promise<{ dataset: Dataset; source: SourceInfo }> {
  if (hasNeo4jConfig()) {
    try {
      const { dataset, source } = await loadDatasetFromNeo4j();
      if (dataset.statement.length > 0) return { dataset, source };
      console.warn("Neo4j is configured but holds no payments. Run npm run seed. Falling back to the fixture.");
    } catch (error) {
      console.warn("Neo4j unreachable, falling back to the fixture:", error instanceof Error ? error.message : error);
    }
  }
  const dataset = loadFixtures();
  return { dataset, source: { ...fixtureSource, counts: { ...fixtureSource.counts, payments: dataset.statement.length } } };
}

export default async function Home() {
  const { dataset, source } = await load();
  return <Dashboard dataset={dataset} source={source} />;
}
