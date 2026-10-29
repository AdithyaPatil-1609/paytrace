/**
 * App entry (server).
 * 1. Prefer Neo4j live dataset + Cypher commitments + Screen 00 graph findings.
 * 2. Else offline CSV fixture.
 * 3. Hand the result to the client shell (components/dashboard.tsx).
 */
import { Dashboard } from "@/components/dashboard";
import { hasNeo4jConfig, loadDatasetFromNeo4j, type LoadedDataset, type SourceInfo } from "@/db/neo4j/dataset";
import { loadFixtures } from "@/lib/fixtures";

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
          "Offline fixture — Neo4j answered but the graph has no payments. Run npm run seed for live mode."
        )
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Neo4j unreachable, falling back to the fixture:", message);
      const loaded = loadFixtures();
      const note = /unauthorized|authentication/i.test(message)
        ? "Offline fixture — Neo4j rejected the login. Fix NEO4J_PASSWORD in .env.local, then seed."
        : "Offline fixture — Neo4j is configured but unreachable. Start it (docker compose up -d) or resume Aura, then npm run seed.";
      return { dataset: loaded, source: fixtureFallback(note) };
    }
  }
  const dataset = loadFixtures();
  return {
    dataset,
    source: {
      ...fixtureSource,
      counts: { ...fixtureSource.counts, payments: dataset.statement.length },
      note: "Offline fixture — Neo4j is not configured. docker compose up -d, copy .env.example to .env.local, then npm run seed."
    }
  };
}

export default async function Home() {
  const { dataset, source, commitments, graph } = await load();
  return <Dashboard dataset={dataset} source={source} commitments={commitments} graph={graph} />;
}
