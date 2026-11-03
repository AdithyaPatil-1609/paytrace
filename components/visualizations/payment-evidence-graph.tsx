"use client";

import { useState } from "react";
import { matchDictionary } from "@/lib/engine";
import { formatDate, formatINR } from "@/lib/format";
import type { Commitment, DictionaryEntry } from "@/lib/types";

type EvidenceNode = { id: string; kind: "debit" | "message" | "mandate" | "pattern"; label: string; caption: string; detail: string; x: number; y: number; relationship: string };

export function PaymentEvidenceExplorer({ items, dictionary, live, onOpen }: {
  items: Commitment[]; dictionary: DictionaryEntry[]; live: boolean; onOpen: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const visible = items.filter((item) => `${item.merchant} ${item.product} ${item.rawNarration}`.toLowerCase().includes(search.toLowerCase().trim()));
  if (!selected) return <p className="evidence-explorer-empty">No recurring payments are available to explore.</p>;
  return <div className="payment-evidence-explorer">
    <aside className="evidence-picker" aria-label="Pick a payment">
      <label htmlFor="evidence-payment-search">PICK A PAYMENT</label>
      <input id="evidence-payment-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a service or bank description" />
      <div className="evidence-picker-list">{visible.map((item) => <button key={item.id} className={selected.id === item.id ? "selected" : ""} aria-pressed={selected.id === item.id} onClick={() => setSelectedId(item.id)}>
        <strong>{item.merchant}</strong><span>{formatINR(item.amount)} · {item.evidenceRows.length} debits · {item.notices.length} messages</span>
        {items.filter((entry) => entry.merchant === item.merchant).length > 1 && <small>{item.evidenceRows[0]?.account} · {item.rawNarration}</small>}
      </button>)}</div>
      {visible.length === 0 && <p className="evidence-picker-empty" role="status">No payments match your search.</p>}
    </aside>
    <PaymentDiagram key={selected.id} item={selected} dictionary={dictionary} live={live} onOpen={() => onOpen(selected.id)} />
  </div>;
}

function PaymentDiagram({ item, dictionary, live, onOpen }: { item: Commitment; dictionary: DictionaryEntry[]; live: boolean; onOpen: () => void }) {
  const [picked, setPicked] = useState<EvidenceNode | null>(null);
  const pattern = item.inDictionary ? matchDictionary(item.rawNarration, dictionary) : undefined;
  const debits = item.evidenceRows.length > 7 ? [...item.evidenceRows.slice(0, 3), ...item.evidenceRows.slice(-4)] : item.evidenceRows;
  const messages = item.notices.length > 5 ? [...item.notices.slice(0, 2), ...item.notices.slice(-3)] : item.notices;
  const nodes: EvidenceNode[] = [
    ...debits.map((row, index): EvidenceNode => {
      const angle = (debits.length === 1 ? 180 : 120 + index * 120 / (debits.length - 1)) * Math.PI / 180;
      return { id: row.txnId, kind: "debit", label: formatINR(row.amount), caption: row.date, detail: `${formatDate(row.date)} · ${row.narration} · ${row.account} · Reference: ${row.reference || "not supplied"}`, x: 450 + 300 * Math.cos(angle), y: 350 + 300 * Math.sin(angle), relationship: "charged" };
    }),
    ...messages.map((row, index): EvidenceNode => {
      const angle = (messages.length === 1 ? -35 : -80 + index * 90 / (messages.length - 1)) * Math.PI / 180;
      return { id: row.noticeId, kind: "message", label: row.channel.toUpperCase(), caption: row.sentOn, detail: `${row.sender} · ${row.eventType} · ${row.text}`, x: 450 + 300 * Math.cos(angle), y: 350 + 300 * Math.sin(angle), relationship: "message" };
    }),
    ...(item.mandateRef ? [{ id: item.mandateRef, kind: "mandate" as const, label: "Mandate", caption: item.mandateStatus ?? "unknown", detail: `${item.instrument} · ${item.mandateStatus ?? "status unknown"} · ${item.mandateRef}`, x: 740, y: 535, relationship: "mandate" }] : []),
    ...(pattern ? [{ id: pattern.pattern, kind: "pattern" as const, label: "Pattern", caption: item.category, detail: `${pattern.pattern} → ${pattern.brand}. ${pattern.oneLiner}`, x: 450, y: 670, relationship: "matches" }] : [])
  ];
  const words = item.merchant.split(" ");
  const split = Math.ceil(words.length / 2);
  const name = item.merchant.length > 17 ? [words.slice(0, split).join(" "), words.slice(split).join(" ")].filter(Boolean) : [item.merchant];
  return <section className="payment-diagram-panel" aria-label={`Evidence for ${item.merchant}`}>
    <p className="evidence-source-note">{live ? "Records from Neo4j analysis" : "CSV fixture · evidence diagram, not a live Neo4j query"}</p>
    <div className="payment-diagram-scroll" tabIndex={0} aria-label="Evidence graph; scroll horizontally on small screens">
      <svg className="payment-evidence-svg" viewBox="0 0 900 750" role="group" aria-label={`${item.merchant}: ${item.evidenceRows.length} debits, ${item.notices.length} messages${item.mandateRef ? ", a mandate" : ""}${pattern ? ", a merchant pattern" : ""}. Select a record to read its evidence.`}>
        {nodes.map((node) => <g key={`edge-${node.kind}-${node.id}`} className="payment-evidence-edge"><line x1={450} y1={350} x2={node.x} y2={node.y} /><text x={450 + (node.x - 450) * .53} y={350 + (node.y - 350) * .53 - 7} textAnchor="middle">{node.relationship}</text></g>)}
        {nodes.map((node) => <g key={`${node.kind}-${node.id}`} className={`payment-evidence-node evidence-node-${node.kind} ${picked?.id === node.id ? "picked" : ""}`} role="button" tabIndex={0} aria-label={`${node.label}, ${node.caption}. ${node.detail}`} onClick={() => setPicked(node)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPicked(node); } }}>
          <title>{node.detail}</title><circle cx={node.x} cy={node.y} r={46} /><text x={node.x} y={node.y - 3} textAnchor="middle" className="evidence-node-label">{node.label}</text><text x={node.x} y={node.y + 16} textAnchor="middle" className="evidence-node-caption">{node.caption}</text>
        </g>)}
        {item.evidenceRows.length > debits.length && <g className="evidence-more-node"><circle cx={160} cy={70} r={28} /><text x={160} y={67} textAnchor="middle">+{item.evidenceRows.length - debits.length}</text><text x={160} y={84} textAnchor="middle">debits</text></g>}
        {item.notices.length > messages.length && <g className="evidence-more-node"><circle cx={760} cy={70} r={28} /><text x={760} y={67} textAnchor="middle">+{item.notices.length - messages.length}</text><text x={760} y={84} textAnchor="middle">messages</text></g>}
        <g className="payment-evidence-centre"><title>{item.merchant}</title><circle cx={450} cy={350} r={78} />{name.map((line, index) => <text key={index} x={450} y={name.length > 1 ? 333 + index * 21 : 345} textAnchor="middle">{line.length > 21 ? `${line.slice(0, 20)}…` : line}</text>)}<text x={450} y={name.length > 1 ? 379 : 372} textAnchor="middle" className="centre-amount">{formatINR(item.amount)} · {item.cadence}</text></g>
      </svg>
    </div>
    <ul className="payment-evidence-legend" aria-label="Graph legend"><li><i className="legend-payment" />Payment group</li><li><i className="legend-debit" />Statement debit</li><li><i className="legend-message" />Message</li><li><i className="legend-mandate" />Mandate</li><li><i className="legend-pattern" />Merchant pattern</li></ul>
    <p className="evidence-sample-note">The centre is the detected recurring payment. Lines show how its evidence was grouped. {debits.length} of {item.evidenceRows.length} debits and {messages.length} of {item.notices.length} messages are drawn; all records remain available below.</p>
    <div className="evidence-node-detail" aria-live="polite">{picked ? <><strong>{picked.label} · {picked.caption}</strong><p>{picked.detail}</p></> : <p>Select a node to inspect its original record.</p>}</div>
    <details className="evidence-records"><summary>All evidence for {item.merchant}</summary><h3>Statement debits ({item.evidenceRows.length})</h3><ul>{item.evidenceRows.map((row) => <li key={row.txnId}>{formatDate(row.date)} · {formatINR(row.amount)} · {row.narration} · {row.account} · {row.reference}</li>)}</ul><h3>Messages ({item.notices.length})</h3><ul>{item.notices.map((row) => <li key={row.noticeId}>{formatDate(row.sentOn)} · {row.channel.toUpperCase()} · {row.eventType} · {row.text}</li>)}</ul><p>Mandate: {item.mandateRef ? `${item.mandateRef} · ${item.mandateStatus ?? "unknown"}` : "No mandate reference found in these records."}</p><p>Merchant pattern: {pattern?.pattern ?? "No matching merchant pattern found."}</p></details>
    <button className="secondary-button" onClick={onOpen}>Open payment details →</button>
  </section>;
}
