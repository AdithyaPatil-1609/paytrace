import type { SourceInfo } from "@/db/neo4j/dataset";

export function EvidenceStrip({ source }: { source: SourceInfo }) {
  return (
    <section className={`evidence-strip${source.kind === "neo4j" ? " live" : ""}`} aria-label="Payment records">
      <p className="evidence-mark">Payment records</p>
      <p className="evidence-copy">
        {source.kind === "neo4j"
          ? `${source.counts.payments} bank payments and ${source.counts.messages} messages checked.`
          : "Showing the available payment records."}
        {" "}No bank account is connected.
      </p>
    </section>
  );
}
