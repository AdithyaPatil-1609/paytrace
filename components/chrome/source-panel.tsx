import type { SourceInfo } from "@/db/neo4j/dataset";

export function SourcePanel({ source, detected }: { source: SourceInfo; detected: number }) {
  if (source.kind !== "neo4j") return null;

  return (
    <section className="source-panel live">
      <header><strong>About this estimate</strong></header>
      <p>
        We found {detected} recurring payments in the available records. This estimate projects their costs over the next
        twelve months and reflects the payments you have marked as stopped.
      </p>
    </section>
  );
}
