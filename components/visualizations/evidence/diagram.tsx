"use client";

import { useRef, useState } from "react";
import { layoutEvidence, type EvidenceNode } from "./layout";
import { formatDate, formatINR } from "@/lib/presentation/format";
import type { Commitment, DictionaryEntry } from "@/lib/payments/types";

export function PaymentDiagram({
  item,
  dictionary,
  live,
  onOpen
}: {
  item: Commitment;
  dictionary: DictionaryEntry[];
  live: boolean;
  onOpen: () => void;
}) {
  const [picked, setPicked] = useState<EvidenceNode | null>(null);
  const [zoom, setZoom] = useState(100);
  const viewport = useRef<HTMLDivElement>(null);
  function selectNode(node: EvidenceNode) {
    setPicked((current) => (current?.id === node.id && current.kind === node.kind ? null : node));
  }
  const { nodes, name, debits, messages, pattern } = layoutEvidence(item, dictionary);
  return (
    <section className="payment-diagram-panel" aria-label={`Evidence for ${item.merchant}`}>
      <p className="evidence-source-note">
        {live
          ? "Records from Neo4j analysis"
          : "CSV fixture · evidence diagram, not a live Neo4j query"}
      </p>
      <div className="evidence-graph-controls" role="group" aria-label="Graph controls">
        <div>
          <button
            aria-label="Zoom out"
            disabled={zoom <= 75}
            onClick={() => setZoom((current) => Math.max(75, current - 25))}
          >
            −
          </button>
          <output aria-label="Graph zoom" aria-live="polite">
            {zoom}%
          </output>
          <button
            aria-label="Zoom in"
            disabled={zoom >= 200}
            onClick={() => setZoom((current) => Math.min(200, current + 25))}
          >
            +
          </button>
        </div>
        <div>
          <button disabled={!picked} onClick={() => setPicked(null)}>
            Clear selection
          </button>
          <button
            onClick={() => {
              setZoom(100);
              setPicked(null);
              viewport.current?.scrollTo({ left: 0, top: 0 });
            }}
          >
            Reset view
          </button>
        </div>
      </div>
      <div
        className="payment-diagram-scroll"
        ref={viewport}
        tabIndex={0}
        aria-label="Evidence graph; scroll to inspect the graph at larger zoom levels"
      >
        <svg
          className={`payment-evidence-svg${picked ? " has-selection" : ""}`}
          style={{ width: `${zoom}%`, minWidth: `${6.2 * zoom}px` }}
          viewBox="0 0 900 750"
          role="group"
          aria-label={`${item.merchant}: ${item.evidenceRows.length} debits, ${item.notices.length} messages${item.mandateRef ? ", a mandate" : ""}${pattern ? ", a merchant pattern" : ""}. Select a record to read its evidence.`}
        >
          {nodes.map((node) => (
            <g
              key={`edge-${node.kind}-${node.id}`}
              className={`payment-evidence-edge${picked?.id === node.id && picked.kind === node.kind ? " selected-edge" : ""}`}
            >
              <line x1={450} y1={350} x2={svgCoordinate(node.x)} y2={svgCoordinate(node.y)} />
              <text
                x={svgCoordinate(450 + (node.x - 450) * 0.53)}
                y={svgCoordinate(350 + (node.y - 350) * 0.53 - 7)}
                textAnchor="middle"
              >
                {node.relationship}
              </text>
            </g>
          ))}
          {nodes.map((node) => (
            <g
              key={`${node.kind}-${node.id}`}
              className={`payment-evidence-node evidence-node-${node.kind} ${picked?.id === node.id && picked.kind === node.kind ? "picked" : ""}`}
              role="button"
              aria-pressed={picked?.id === node.id && picked.kind === node.kind}
              tabIndex={0}
              aria-label={`${node.label}, ${node.caption}. ${node.detail}`}
              onClick={() => selectNode(node)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectNode(node);
                }
              }}
            >
              <title>{node.detail}</title>
              <circle cx={svgCoordinate(node.x)} cy={svgCoordinate(node.y)} r={46} />
              <text
                x={svgCoordinate(node.x)}
                y={svgCoordinate(node.y - 3)}
                textAnchor="middle"
                className="evidence-node-label"
              >
                {node.label}
              </text>
              <text
                x={svgCoordinate(node.x)}
                y={svgCoordinate(node.y + 16)}
                textAnchor="middle"
                className="evidence-node-caption"
              >
                {node.caption}
              </text>
            </g>
          ))}
          {item.evidenceRows.length > debits.length && (
            <g className="evidence-more-node">
              <circle cx={160} cy={70} r={28} />
              <text x={160} y={67} textAnchor="middle">
                +{item.evidenceRows.length - debits.length}
              </text>
              <text x={160} y={84} textAnchor="middle">
                debits
              </text>
            </g>
          )}
          {item.notices.length > messages.length && (
            <g className="evidence-more-node">
              <circle cx={760} cy={70} r={28} />
              <text x={760} y={67} textAnchor="middle">
                +{item.notices.length - messages.length}
              </text>
              <text x={760} y={84} textAnchor="middle">
                messages
              </text>
            </g>
          )}
          <g className="payment-evidence-centre">
            <title>{item.merchant}</title>
            <circle cx={450} cy={350} r={78} />
            {name.map((line, index) => (
              <text
                key={index}
                x={450}
                y={name.length > 1 ? 333 + index * 21 : 345}
                textAnchor="middle"
              >
                {line.length > 21 ? `${line.slice(0, 20)}…` : line}
              </text>
            ))}
            <text
              x={450}
              y={name.length > 1 ? 379 : 372}
              textAnchor="middle"
              className="centre-amount"
            >
              {formatINR(item.amount)} · {item.cadence}
            </text>
          </g>
        </svg>
      </div>
      <ul className="payment-evidence-legend" aria-label="Graph legend">
        <li>
          <i className="legend-payment" />
          Payment group
        </li>
        <li>
          <i className="legend-debit" />
          Statement debit
        </li>
        <li>
          <i className="legend-message" />
          Message
        </li>
        <li>
          <i className="legend-mandate" />
          Mandate
        </li>
        <li>
          <i className="legend-pattern" />
          Merchant pattern
        </li>
      </ul>
      <p className="evidence-sample-note">
        The centre is the detected recurring payment. Lines show how its evidence was grouped.{" "}
        {debits.length} of {item.evidenceRows.length} debits and {messages.length} of{" "}
        {item.notices.length} messages are drawn; all records remain available below.
      </p>
      <div className="evidence-node-detail" aria-live="polite">
        {picked ? (
          <>
            <strong>
              {picked.label} · {picked.caption}
            </strong>
            <p>{picked.detail}</p>
          </>
        ) : (
          <p>Select a node to inspect its original record.</p>
        )}
      </div>
      <details className="evidence-records">
        <summary>All evidence for {item.merchant}</summary>
        <h3>Statement debits ({item.evidenceRows.length})</h3>
        <ul>
          {item.evidenceRows.map((row) => (
            <li key={row.txnId}>
              {formatDate(row.date)} · {formatINR(row.amount)} · {row.narration} · {row.account} ·{" "}
              {row.reference}
            </li>
          ))}
        </ul>
        <h3>Messages ({item.notices.length})</h3>
        <ul>
          {item.notices.map((row) => (
            <li key={row.noticeId}>
              {formatDate(row.sentOn)} · {row.channel.toUpperCase()} · {row.eventType} · {row.text}
            </li>
          ))}
        </ul>
        <p>
          Mandate:{" "}
          {item.mandateRef
            ? `${item.mandateRef} · ${item.mandateStatus ?? "unknown"}`
            : "No mandate reference found in these records."}
        </p>
        <p>Merchant pattern: {pattern?.pattern ?? "No matching merchant pattern found."}</p>
      </details>
      <button className="secondary-button" onClick={onOpen}>
        Open payment details →
      </button>
    </section>
  );
}

function svgCoordinate(value: number) {
  return Number(value.toFixed(3));
}
