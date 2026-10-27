/**
 * App entry (server).
 * 1. Prefer Neo4j live dataset + Cypher commitments.
 * 2. Else offline CSV fixture.
 * 3. Hand the result to the client shell (components/dashboard.tsx).
 */
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
 * Live mode is Neo4j: the evidence graph holds the rows, and Cypher decides
 * the commitments the screens render. The CSV fixture is offline-only — so a
 * reviewer without Aura can still open the prototype. It is not the scored path.
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
        source: fixtureFallback(
          "Offline fixture — Neo4j answered but the graph has no payments. Run npm run seed for live mode."
        )
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Neo4j unreachable, falling back to the fixture:", message);
      const loaded = loadFixtures();
      const note = /unauthorized|authentication/i.test(message)
        ? "Offline fixture — Aura rejected the login. Fix NEO4J_PASSWORD in .env.local, then seed."
        : "Offline fixture — Neo4j is configured but unreachable. Resume Aura, then npm run seed.";
      return { dataset: loaded, source: fixtureFallback(note) };
    }
  }
  const dataset = loadFixtures();
  return {
    dataset,
    source: {
      ...fixtureSource,
      counts: { ...fixtureSource.counts, payments: dataset.statement.length },
      note: "Offline fixture — Neo4j is not configured. Add Aura credentials and seed for live mode."
    }
  };
}

export default async function Home() {
  const { dataset, source, commitments } = await load();
  return <Dashboard dataset={dataset} source={source} commitments={commitments} />;
}
