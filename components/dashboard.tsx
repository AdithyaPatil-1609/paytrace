"use client";

import { useMemo, useState } from "react";
import { formatINR } from "@/lib/format";
import { unusedTotal, yearlyTotal } from "@/lib/analysis";
import type { Commitment } from "@/lib/types";

type DashboardProps = { commitments: Commitment[] };

const tabs = ["Annual", "List", "Detail", "Cancel"] as const;
type Tab = (typeof tabs)[number];

export function Dashboard({ commitments }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Annual");
  const [selectedId, setSelectedId] = useState("fitline-gym");
  const selected = commitments.find((commitment) => commitment.id === selectedId) ?? commitments[0];
  const annual = useMemo(() => yearlyTotal(commitments), [commitments]);
  const unused = useMemo(() => unusedTotal(commitments), [commitments]);
  const debt = useMemo(
    () => commitments.filter((commitment) => commitment.kind === "debt").reduce((sum, item) => sum + item.annualCost, 0),
    [commitments]
  );

  function showDetail(id: string) {
    setSelectedId(id);
    setActiveTab("Detail");
  }

  return (
    <main className="page-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">RECURRING PAYMENTS, EXPLAINED</p>
          <h1>Lekha</h1>
          <p className="lede">Every recurring debit, in plain language. One synthetic year for Priya, Bengaluru.</p>
        </div>
        <div className="profile-chip"><span>PR</span><div><strong>Priya</strong><small>Synthetic fixture</small></div></div>
      </header>

      <section className="summary-grid" aria-label="Annual payment summary">
        <SummaryCard value={formatINR(annual)} label="Committed over the next 12 months" />
        <SummaryCard value={formatINR(unused)} label="Still debiting for things she does not use" accent />
        <SummaryCard value={formatINR(debt)} label="Home-loan EMI, shown separately" />
      </section>

      <nav className="tabs" aria-label="Payment views">
        {tabs.map((tab) => (
          <button className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "Annual" && <Annual commitments={commitments} onSelect={showDetail} />}
      {activeTab === "List" && <List commitments={commitments} onSelect={showDetail} />}
      {activeTab === "Detail" && <Detail commitment={selected} onCancel={() => setActiveTab("Cancel")} />}
      {activeTab === "Cancel" && <Cancel commitment={selected} />}
    </main>
  );
}

function SummaryCard({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return <article className={`summary-card${accent ? " accent" : ""}`}><strong>{value}</strong><span>{label}</span></article>;
}

function Annual({ commitments, onSelect }: { commitments: Commitment[]; onSelect: (id: string) => void }) {
  const findings = commitments.filter((item) => ["unused", "silent", "trial"].includes(item.kind));
  return (
    <section className="content-panel">
      <div className="section-heading"><div><p className="eyebrow">ANNUAL REVIEW</p><h2>Where Priya can act</h2></div><p>Sorted by expected yearly cost.</p></div>
      <div className="finding-grid">
        {findings.sort((a, b) => b.annualCost - a.annualCost).map((item) => (
          <button className="finding-card" onClick={() => onSelect(item.id)} key={item.id}>
            <span className={`tag tag-${item.kind}`}>{item.kind}</span>
            <strong>{item.merchant}</strong>
            <small>{item.status}</small>
            <b>{formatINR(item.annualCost)}<em> / year</em></b>
          </button>
        ))}
      </div>
    </section>
  );
}

function List({ commitments, onSelect }: { commitments: Commitment[]; onSelect: (id: string) => void }) {
  return (
    <section className="content-panel">
      <div className="section-heading"><div><p className="eyebrow">MATCHED COMMITMENTS</p><h2>The statement, made readable</h2></div><p>Click any row for its proof.</p></div>
      <div className="table-wrap"><table><thead><tr><th>Statement narration</th><th>Lekha calls it</th><th>Signal</th><th>Next year</th></tr></thead>
      <tbody>{commitments.sort((a, b) => b.annualCost - a.annualCost).map((item) => <tr key={item.id} onClick={() => onSelect(item.id)}><td>{item.rawNarration}</td><td>{item.merchant}</td><td><span className={`table-dot ${item.kind}`} />{item.status}</td><td>{formatINR(item.annualCost)}</td></tr>)}</tbody></table></div>
    </section>
  );
}

function Detail({ commitment, onCancel }: { commitment: Commitment; onCancel: () => void }) {
  return (
    <section className="detail-layout content-panel">
      <div className="detail-copy"><p className="eyebrow">THE EVIDENCE</p><h2>{commitment.merchant}</h2><p className="raw">{commitment.rawNarration}</p><dl><div><dt>Payment rail</dt><dd>{commitment.instrument}</dd></div><div><dt>Cadence</dt><dd>{commitment.cadence}</dd></div><div><dt>Yearly cost</dt><dd>{formatINR(commitment.annualCost)}</dd></div></dl></div>
      <aside className="evidence-card"><span className={`tag tag-${commitment.kind}`}>{commitment.kind}</span><h3>{commitment.status}</h3><p>{commitment.evidence}</p>{commitment.canCancel ? <button className="primary-action" onClick={onCancel}>See how to stop it</button> : <p className="muted">No cancellation action is suggested for this payment.</p>}</aside>
    </section>
  );
}

function Cancel({ commitment }: { commitment: Commitment }) {
  return (
    <section className="cancel-panel content-panel">
      <p className="eyebrow">CANCELLATION PATH</p><h2>{commitment.merchant}</h2>
      {commitment.canCancel ? <><p className="cancel-copy">{commitment.cancellationPath}</p><div className="callout"><strong>Before you cancel</strong><span>This demo only explains the path. It never changes a real mandate or payment.</span></div></> : <><p className="cancel-copy">{commitment.evidence}</p><div className="callout"><strong>Keep this payment</strong><span>{commitment.status}. Lekha separates debt and essential bills from subscriptions.</span></div></>}
    </section>
  );
}
