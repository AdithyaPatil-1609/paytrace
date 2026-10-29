/**
 * Screen 00 — Evidence graph
 * The graph before the product: what is in it, one merchant's neighbourhood,
 * and three findings that are relationship patterns. Live Neo4j only — the
 * offline fixture has no graph, so this screen says how to get one instead.
 */
import type { ReactNode } from "react";
import { ScreenHeader } from "@/components/chrome/screen-header";
import type { SourceInfo } from "@/db/neo4j/dataset";
import type { FocusGraph, GraphFacts, GraphFinding } from "@/db/neo4j/graph";
import { formatDate, formatINR } from "@/lib/format";

export function EvidenceGraphScreen({
  graph,
  source,
  onContinue
}: {
  graph?: GraphFacts;
  source: SourceInfo;
  onContinue: () => void;
}) {
  if (source.kind !== "neo4j" || !graph) {
    return (
      <>
        <ScreenHeader
          number="0"
          eyebrow="THE EVIDENCE GRAPH"
          title="This screen reads the graph itself"
          copy="Screen 00 runs Cypher over relationships: a price_change Message that is missing, a trial notice chained to a paid debit, money still moving to a merchant nobody opens. The offline CSV has rows but no relationships, so there is nothing here to read."
        />
        <section className="graph-offline">
          <strong>{source.note ?? "Neo4j is not configured."}</strong>
          <p>Run the live graph on this machine in about a minute — no Aura account needed:</p>
          <ol>
            <li>
              <code>docker compose up -d</code> (or <code>brew install neo4j</code>)
            </li>
            <li>
              Copy <code>.env.example</code> to <code>.env.local</code> and keep the local block
            </li>
            <li>
              <code>npm run seed</code>, then reload this page
            </li>
          </ol>
          <button className="secondary-button" onClick={onContinue}>
            Continue to the four screens on the CSV fixture <i>→</i>
          </button>
        </section>
      </>
    );
  }

  const nodes = graph.labels.reduce((sum, row) => sum + row.count, 0);
  const edges = graph.relationships.reduce((sum, row) => sum + row.count, 0);
  const unopenedPaid = graph.unopened.rows.reduce((sum, row) => sum + row.paid, 0);

  return (
    <>
      <ScreenHeader
        number="0"
        eyebrow="THE EVIDENCE GRAPH"
        title="The harm is a missing edge"
        copy="Bank lines, SMS, email, mandates and app opens arrive as separate records. In the graph they are linked, so a question like “which price went up with no message about it” is a pattern over relationships, not a scan of a spreadsheet. Everything on this screen is a live Cypher result."
      />

      <section className="graph-census" aria-label="What the graph holds">
        <div>
          <span>
            {nodes} nodes · {edges} relationships · <code>{source.host}</code>
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

      {graph.focus && <FocusDiagram focus={graph.focus} />}

      <h2 className="viz-heading">Three findings only relationships can state</h2>
      <div className="graph-findings">
        <Finding finding={graph.silentHikes} tone="ember">
          {graph.silentHikes.rows.map((row) => (
            <li key={row.brand}>
              <strong>{row.brand}</strong>
              <span>
                {formatINR(row.from)} → {formatINR(row.to)} from {formatDate(row.since)}. {row.messages} Messages
                are ABOUT it; none is a <code>price_change</code>.
              </span>
            </li>
          ))}
        </Finding>
        <Finding finding={graph.trials} tone="plum">
          {graph.trials.rows.map((row) => (
            <li key={row.brand}>
              <strong>{row.brand}</strong>
              <span>
                Trial notice {formatDate(row.noticeOn)} → first paid debit {formatDate(row.paidOn)} at{" "}
                {formatINR(row.amount)}
                {row.hold !== undefined && `. The ${formatINR(row.hold)} hold is a card check, not the price`}.
              </span>
            </li>
          ))}
        </Finding>
        <Finding finding={graph.unopened} tone="marigold">
          {graph.unopened.rows.map((row) => (
            <li key={row.brand}>
              <strong>{row.brand}</strong>
              <span>
                {row.lastOpened ? `Last opened ${formatDate(row.lastOpened)}` : "Never opened"} · {row.charges} debits
                since · {formatINR(row.paid)} · mandate <code>{row.mandateRef}</code>
              </span>
            </li>
          ))}
          <li className="graph-total">
            <strong>{formatINR(unopenedPaid)}</strong>
            <span>left her accounts after the last open. Only the PAID_TO and FOR edges together can say that.</span>
          </li>
        </Finding>
      </div>

      <section className="graph-handoff">
        <p>
          Screens 01–04 render what the analysis query returned from this same graph: the issues, the year, and each
          cancel path. Open any row there for its Evidence path.
        </p>
        <button className="primary-button" onClick={onContinue}>
          Open the four screens <i>→</i>
        </button>
      </section>
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
      <ul>{finding.rows.length > 0 ? children : <li className="empty">No match in the graph.</li>}</ul>
      <details>
        <summary>The Cypher that ran</summary>
        <pre>{finding.cypher}</pre>
      </details>
    </article>
  );
}

/** One merchant's neighbourhood, drawn from the nodes and edges the graph returned. */
function FocusDiagram({ focus }: { focus: FocusGraph }) {
  const cx = 380;
  const cy = 200;
  const first = focus.payments[0]?.amount;
  const count = focus.payments.length;
  const payments = focus.payments.map((payment, index) => {
    const angle = ((125 + (count === 1 ? 55 : (110 * index) / (count - 1))) * Math.PI) / 180;
    return { ...payment, x: cx + 230 * Math.cos(angle), y: cy + 150 * Math.sin(angle), raised: payment.amount !== first };
  });
  const patterns = focus.patterns.map((pattern, index) => ({
    pattern,
    x: cx + (index - (focus.patterns.length - 1) / 2) * 190,
    y: 34
  }));
  const messages = [
    ...focus.messages.map((message) => ({ label: `${message.eventType} × ${message.count}`, missing: false })),
    { label: "price_change × 0", missing: true }
  ].map((message, index, all) => ({ ...message, x: 640, y: cy + (index - (all.length - 1) / 2) * 62 }));

  return (
    <section className="graph-focus" aria-label={`${focus.brand} in the evidence graph`}>
      <header>
        <strong>{focus.brand}, as the graph holds it</strong>
        <span>
          {count} Payment nodes · {focus.patterns.length} Pattern nodes · {focus.accounts.join(", ")}
        </span>
      </header>
      <svg viewBox="0 0 760 400" role="img">
        {payments.map((payment) => (
          <line key={`e-${payment.date}`} x1={payment.x} y1={payment.y} x2={cx} y2={cy} className="edge" />
        ))}
        {patterns.map((pattern) => (
          <line key={`e-${pattern.pattern}`} x1={pattern.x} y1={pattern.y + 14} x2={cx} y2={cy - 34} className="edge" />
        ))}
        {messages.map((message) => (
          <line
            key={`e-${message.label}`}
            x1={message.x - 70}
            y1={message.y}
            x2={cx + 34}
            y2={cy}
            className={message.missing ? "edge missing" : "edge"}
          />
        ))}
        {focus.mandateRef && <line x1={cx} y1={cy + 34} x2={cx} y2={350} className="edge" />}

        <text x={cx - 128} y={cy - 6} className="edge-label">
          PAID_TO
        </text>
        <text x={cx + 8} y={92} className="edge-label">
          MATCHES
        </text>
        <text x={cx + 130} y={cy - 70} className="edge-label">
          ABOUT
        </text>
        {focus.mandateRef && (
          <text x={cx + 8} y={300} className="edge-label">
            FOR
          </text>
        )}

        {payments.map((payment) => (
          <g key={payment.date} className={payment.raised ? "node payment raised" : "node payment"}>
            <circle cx={payment.x} cy={payment.y} r={13} />
            <text x={payment.x - 20} y={payment.y + 4} textAnchor="end">
              {payment.amount}
            </text>
          </g>
        ))}
        {patterns.map((pattern) => (
          <g key={pattern.pattern} className="node pattern">
            <rect x={pattern.x - 78} y={pattern.y - 14} width={156} height={28} rx={6} />
            <text x={pattern.x} y={pattern.y + 4} textAnchor="middle">
              {pattern.pattern}
            </text>
          </g>
        ))}
        {messages.map((message) => (
          <g key={message.label} className={message.missing ? "node message missing" : "node message"}>
            <rect x={message.x - 70} y={message.y - 16} width={150} height={32} rx={16} />
            <text x={message.x + 5} y={message.y + 4} textAnchor="middle">
              {message.label}
            </text>
          </g>
        ))}
        {focus.mandateRef && (
          <g className="node mandate">
            <rect x={cx - 80} y={350} width={160} height={28} rx={6} />
            <text x={cx} y={368} textAnchor="middle">
              Mandate · {focus.mandateRef}
            </text>
          </g>
        )}
        <g className="node merchant">
          <circle cx={cx} cy={cy} r={34} />
          <text x={cx} y={cy + 5} textAnchor="middle">
            {focus.brand}
          </text>
        </g>
      </svg>
      <p className="graph-legend">
        <i className="dot" /> Payment at the first price <i className="dot raised" /> Payment after the step{" "}
        <i className="dash" /> the edge that does not exist — the silent hike
      </p>
    </section>
  );
}
