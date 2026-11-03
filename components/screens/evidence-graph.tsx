import type { ReactNode } from "react";
import { ScreenHeader } from "@/components/chrome/screen-header";
import { PaymentEvidenceExplorer } from "@/components/visualizations/payment-evidence-graph";
import type { SourceInfo } from "@/db/neo4j/dataset";
import type { GraphFacts, GraphFinding } from "@/db/neo4j/graph";
import type { Commitment, DictionaryEntry } from "@/lib/types";
import { formatDate, formatINR } from "@/lib/format";

export function EvidenceGraphScreen({ graph, source, items, dictionary, recordsLive, onOpen, onContinue }: {
  graph?: GraphFacts; source: SourceInfo; items: Commitment[]; dictionary: DictionaryEntry[];
  recordsLive?: boolean;
  onOpen: (id: string) => void; onContinue: () => void;
}) {
  return <>
    <ScreenHeader number="5" eyebrow="THE EVIDENCE GRAPH" title="Why each payment is here, drawn as a graph" copy="Pick a payment to see the charges, messages and permission behind it." help="The centre is a detected recurring payment. Around it are the debits grouped into it, related messages, any available payment permission and its matching merchant pattern. Select a record to inspect it; use the zoom controls for a closer look." />
    <PaymentEvidenceExplorer items={items} dictionary={dictionary} live={recordsLive ?? source.kind === "neo4j"} onOpen={onOpen} />
    {source.kind === "neo4j" && graph ? <details className="evidence-live-details"><summary>Explore live Neo4j queries and findings</summary>
      <section className="graph-census" aria-label="What the live graph holds"><div><span>{graph.labels.reduce((sum, row) => sum + row.count, 0)} nodes · {graph.relationships.reduce((sum, row) => sum + row.count, 0)} relationships · <code>{source.host}</code></span><ul>{graph.labels.map((row) => <li key={row.label}><code>:{row.label}</code> <b>{row.count}</b></li>)}</ul></div><div><ul>{graph.relationships.map((row) => <li key={row.type} className="rel"><code>[:{row.type}]</code> <b>{row.count}</b></li>)}</ul></div></section>
      <div className="graph-findings">
        <Finding finding={graph.silentHikes} tone="ember">{graph.silentHikes.rows.map((row) => <li key={row.brand}><strong>{row.brand}</strong><span>{formatINR(row.from)} → {formatINR(row.to)} from {formatDate(row.since)}. {row.messages} related messages; the query found no price-change notice.</span></li>)}</Finding>
        <Finding finding={graph.trials} tone="plum">{graph.trials.rows.map((row) => <li key={row.brand}><strong>{row.brand}</strong><span>Trial notice {formatDate(row.noticeOn)} → first paid debit {formatDate(row.paidOn)} at {formatINR(row.amount)}{row.hold !== undefined && `. The ${formatINR(row.hold)} authorisation hold is not a subscription charge`}.</span></li>)}</Finding>
        <Finding finding={graph.unopened} tone="marigold">{graph.unopened.rows.map((row) => <li key={row.brand}><strong>{row.brand}</strong><span>{row.lastOpened ? `Last recorded use ${formatDate(row.lastOpened)}` : "No recorded use"} · {row.charges} debits · {formatINR(row.paid)} · mandate <code>{row.mandateRef}</code></span></li>)}</Finding>
      </div>
    </details> : <details className="evidence-live-details"><summary>About this evidence source</summary><p>{source.note ?? "Neo4j is not configured."}</p><p>The diagram above is built from the CSV fixture and its detected payments. Live graph queries and database relationship counts are available only when Neo4j is connected.</p></details>}
    <div className="graph-handoff"><button className="primary-button" onClick={onContinue}>See all payments →</button></div>
  </>;
}

function Finding<Row>({ finding, tone, children }: { finding: GraphFinding<Row>; tone: "ember" | "plum" | "marigold"; children: ReactNode }) {
  return <article className={`graph-finding ${tone}`}><header><b>{finding.rows.length}</b><h3>{finding.title}</h3></header><ul>{finding.rows.length > 0 ? children : <li className="empty">No match in the graph.</li>}</ul><details><summary>The Cypher that ran</summary><pre>{finding.cypher}</pre></details></article>;
}
