import type { ReactNode } from "react";
import { ScreenHeader } from "@/web/components/chrome/screen-header";
import { PaymentEvidenceExplorer } from "@/web/components/visualizations/payment-evidence-graph";
import { PersonalGraphPanel } from "@/web/components/insights/personal-graph-panel";
import type { SourceInfo } from "@/neo4j/dataset";
import type { GraphFacts, GraphFinding } from "@/neo4j/graph";
import type { Commitment, DictionaryEntry } from "@/server/payments/types";
import { formatDate, formatINR } from "@/server/presentation/format";

export function EvidenceGraphScreen({
  graph,
  source,
  items,
  dictionary,
  recordsLive,
  onOpen,
  onContinue,
  visitorGraph
}: {
  graph?: GraphFacts;
  source: SourceInfo;
  items: Commitment[];
  dictionary: DictionaryEntry[];
  /** Demo: the visitor's own Neo4j graph panel, once their sample is written there. */
  visitorGraph?: ReactNode;
  recordsLive?: boolean;
  onOpen: (id: string) => void;
  onContinue: () => void;
}) {
  return (
    <>
      <ScreenHeader
        number="5"
        eyebrow="THE EVIDENCE GRAPH"
        title="Why each payment is here, drawn as a graph"
        copy="Pick a payment to see the charges, messages and permission behind it."
        help="Each circle in the middle is one of your repeating payments. Around it are the bank debits, messages and autopay permissions that prove it. Click anything to see the original message or debit."
      />
      <PaymentEvidenceExplorer
        items={items}
        dictionary={dictionary}
        live={recordsLive ?? source.kind === "neo4j"}
        personal={source.personal}
        onOpen={onOpen}
      />
      {source.kind === "neo4j" && graph ? (
        <details className="evidence-live-details">
          <summary>Explore live Neo4j queries and findings</summary>
          <section className="graph-census" aria-label="What the live graph holds">
            <div>
              <span>
                {graph.labels.reduce((sum, row) => sum + row.count, 0)} nodes ·{" "}
                {graph.relationships.reduce((sum, row) => sum + row.count, 0)} relationships ·{" "}
                <code>{source.host}</code>
              </span>
              <ul>
                {graph.labels.map((row) => (
                  <li key={row.label}>
                    <code>:{row.label}</code> <b>{row.count}</b>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <ul>
                {graph.relationships.map((row) => (
                  <li key={row.type} className="rel">
                    <code>[:{row.type}]</code> <b>{row.count}</b>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <div className="graph-findings">
            <Finding finding={graph.silentHikes} tone="ember">
              {graph.silentHikes.rows.map((row) => (
                <li key={row.brand}>
                  <strong>{row.brand}</strong>
                  <span>
                    {formatINR(row.from)} → {formatINR(row.to)} from {formatDate(row.since)}.{" "}
                    {row.messages} related messages; the query found no price-change notice.
                  </span>
                </li>
              ))}
            </Finding>
            <Finding finding={graph.trials} tone="plum">
              {graph.trials.rows.map((row) => (
                <li key={row.brand}>
                  <strong>{row.brand}</strong>
                  <span>
                    Trial notice {formatDate(row.noticeOn)} → first paid debit{" "}
                    {formatDate(row.paidOn)} at {formatINR(row.amount)}
                    {row.hold !== undefined &&
                      `. The ${formatINR(row.hold)} authorisation hold is not a subscription charge`}
                    .
                  </span>
                </li>
              ))}
            </Finding>
            <Finding finding={graph.unopened} tone="marigold">
              {graph.unopened.rows.map((row) => (
                <li key={row.brand}>
                  <strong>{row.brand}</strong>
                  <span>
                    {row.lastOpened
                      ? `Last recorded use ${formatDate(row.lastOpened)}`
                      : "No recorded use"}{" "}
                    · {row.charges} debits · {formatINR(row.paid)} · mandate{" "}
                    <code>{row.mandateRef}</code>
                  </span>
                </li>
              ))}
            </Finding>
          </div>
        </details>
      ) : source.personal ? (
        <PersonalGraphPanel />
      ) : visitorGraph ? (
        visitorGraph
      ) : (
        <details className="evidence-live-details">
          <summary>Where this comes from</summary>
          {source.note && <p>{source.note}</p>}
          <p>Each repeating payment is linked to the bank debits, SMS, emails and autopay permissions that prove it. Click any of them to see the original.</p>
        </details>
      )}
      <div className="graph-handoff">
        <button className="primary-button" onClick={onContinue}>
          See all payments →
        </button>
      </div>
    </>
  );
}

function Finding<Row>({
  finding,
  tone,
  children
}: {
  finding: GraphFinding<Row>;
  tone: "ember" | "plum" | "marigold";
  children: ReactNode;
}) {
  return (
    <article className={`graph-finding ${tone}`}>
      <header>
        <b>{finding.rows.length}</b>
        <h3>{finding.title}</h3>
      </header>
      <ul>
        {finding.rows.length > 0 ? children : <li className="empty">No match in the graph.</li>}
      </ul>
      <details>
        <summary>The Cypher that ran</summary>
        <pre>{finding.cypher}</pre>
      </details>
    </article>
  );
}
