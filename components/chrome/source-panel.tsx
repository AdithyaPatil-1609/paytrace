/**
 * Annual-screen proof that Cypher decided the year (live Neo4j only).
 */
import type { SourceInfo } from "@/db/neo4j/dataset";
import { formatINR } from "@/lib/format";

export function SourcePanel({ source, detected }: { source: SourceInfo; detected: number }) {
  if (source.kind !== "neo4j") return null;

  const inGraph = source.counts.commitments;
  return (
    <section className="source-panel live">
      <header>
        <strong>{source.analyzed ? "Decided in Neo4j" : "Commitments"}</strong>
        <span>
          {detected} on screen · {inGraph} commitment nodes
        </span>
      </header>
      <p>
        {source.analyzed && source.yearTotal !== undefined
          ? `Live mode: a Cypher query on the evidence graph returned the issues, each cancel path, and the year of ${formatINR(source.yearTotal)}. This screen is that result.`
          : `The graph holds ${inGraph} commitment nodes. The app detected ${detected} rows from what the graph returned because the analysis query did not finish.`}
      </p>
    </section>
  );
}
