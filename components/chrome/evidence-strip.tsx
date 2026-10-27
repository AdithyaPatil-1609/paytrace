/**
 * Bar under the product header: live Neo4j host + counts, or offline fixture note.
 */
import type { SourceInfo } from "@/db/neo4j/dataset";

export function EvidenceStrip({ source }: { source: SourceInfo }) {
  if (source.kind === "neo4j") {
    const host = source.host ?? "the configured host";
    return (
      <section className="evidence-strip live" aria-label="Neo4j evidence graph">
        <p className="evidence-mark">Neo4j</p>
        <p className="evidence-copy">
          Live evidence graph · <code>{host}</code>
          {source.analyzed
            ? " · Cypher decided the issues, the year, and each cancel path"
            : " · graph connected; analysis fell back inside the app"}
        </p>
        <dl className="evidence-counts">
          <div>
            <dt>Payments</dt>
            <dd>{source.counts.payments}</dd>
          </div>
          <div>
            <dt>Messages</dt>
            <dd>{source.counts.messages}</dd>
          </div>
          <div>
            <dt>Mandates</dt>
            <dd>{source.counts.mandates}</dd>
          </div>
          <div>
            <dt>Patterns</dt>
            <dd>{source.counts.patterns}</dd>
          </div>
          <div>
            <dt>Commitments</dt>
            <dd>{source.counts.commitments}</dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section className="evidence-strip" aria-label="Offline fixture">
      <p className="evidence-mark">Offline fixture</p>
      <p className="evidence-copy">
        {source.note ??
          "CSV only — for reviewers without Neo4j. Seed the graph for the live mode judges score."}
      </p>
    </section>
  );
}
