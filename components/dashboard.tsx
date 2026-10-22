"use client";

import { useMemo, useState } from "react";
import { headspaceCommitment } from "@/data/priya";
import { formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

type DashboardProps = { commitments: Commitment[] };
type Screen = "all" | "language" | "issues" | "paths";

const screens: { id: Screen; number: string; label: string }[] = [
  { id: "all", number: "01", label: "All payments" },
  { id: "language", number: "02", label: "Plain language" },
  { id: "issues", number: "03", label: "Issues" },
  { id: "paths", number: "04", label: "Cancel paths" }
];

export function Dashboard({ commitments: seedCommitments }: DashboardProps) {
  const [screen, setScreen] = useState<Screen>("all");
  const [simulated, setSimulated] = useState(false);
  const [stopped, setStopped] = useState<string[]>([]);
  const commitments = useMemo(() => simulated ? [...seedCommitments, headspaceCommitment] : seedCommitments, [seedCommitments, simulated]);
  const active = commitments.filter((item) => !stopped.includes(item.id));
  const total = active.reduce((sum, item) => sum + item.annualCost, 0);
  const issueItems = active.filter((item) => ["unused", "silent", "trial"].includes(item.kind));
  const leakage = active.filter((item) => item.kind === "unused").reduce((sum, item) => sum + item.annualCost, 0);
  const hike = active.find((item) => item.id === "spotify") ? 240 : 0;

  function resetSimulation() {
    setSimulated(false);
    setStopped((current) => current.filter((id) => id !== "headspace"));
  }

  function confirmStop(id: string) {
    setStopped((current) => current.includes(id) ? current : [...current, id]);
  }

  return <main className="paytrace-shell">
    <header className="product-bar"><div className="wordmark"><span>p</span>paytrace</div><p>PROTOTYPE <i>·</i> SYNTHETIC MESSAGES ONLY</p><div className="bar-actions"><button className="export-csv" onClick={() => downloadCsv(active)}>↓ Export CSV</button><div className="persona"><b>PD</b><span>Priya Demo</span></div></div></header>
    <div className="app-layout">
      <aside className="side-nav"><p>THE FOUR SCREENS</p>{screens.map((item) => <button key={item.id} className={screen === item.id ? "active" : ""} onClick={() => setScreen(item.id)}><span>{item.number}</span>{item.label}</button>)}<div className="side-note"><strong>Prototype only</strong><span>It shows a route to stop a payment. It never sends a revoke.</span></div></aside>
      <section className="main-stage">
        <nav className="mobile-nav">{screens.map((item) => <button className={screen === item.id ? "active" : ""} onClick={() => setScreen(item.id)} key={item.id}>{item.number}</button>)}</nav>
        {screen === "all" && <AllPayments items={active} total={total} simulated={simulated} onSimulate={() => setSimulated(true)} onReset={resetSimulation} />}
        {screen === "language" && <PlainLanguage items={active} />}
        {screen === "issues" && <Issues items={issueItems} total={total} leakage={leakage} hike={hike} />}
        {screen === "paths" && <CancelPaths items={active} stopped={stopped} onConfirm={confirmStop} />}
      </section>
    </div>
  </main>;
}

function ScreenHeader({ number, eyebrow, title, copy }: { number: string; eyebrow: string; title: string; copy: string }) {
  return <header className="screen-header"><p><span>SCREEN {number}</span> · {eyebrow}</p><h1>{title}</h1><div>{copy}</div></header>;
}

function AllPayments({ items, total, simulated, onSimulate, onReset }: { items: Commitment[]; total: number; simulated: boolean; onSimulate: () => void; onReset: () => void }) {
  return <><ScreenHeader number="1" eyebrow="ALL OF THEM" title="Every periodic payment, on one page" copy="This is the whole book before any judgement. Monthly rows show the amount that leaves each month and the amount across the year. Electricity changes amount, and society has uneven dates. Both still belong here." />
    <section className="year-banner"><div><span>YEAR OF EVERYTHING</span><strong>{formatINR(total)}</strong><small>{items.length} recurring commitments from statement lines and payment messages.</small></div><div className="year-note"><b>{simulated ? "New autopay is included" : "A clear annual total"}</b><p>{simulated ? "Headspace is now on screens 1, 2, and 4. It is not an issue." : "The current Spotify price is shown here. Price history belongs on screen 3."}</p></div></section>
    <section className="data-panel"><div className="table-caption"><span>WHAT THE MESSAGE PRINTS</span><span>EACH MONTH</span><span>THIS YEAR</span><span>SOURCE</span></div><div className="payment-rows">{items.map((item) => <div className="payment-row" key={item.id}><strong>{item.rawNarration}</strong><span>{monthlyCost(item)}</span><b>{formatINR(item.annualCost)}</b><small>{item.source}</small></div>)}</div></section>
    <p className="exclusion-note"><strong>Not added to this list:</strong> one Swiggy order, a transfer to Rahul, salary credits, the credit-card repayment, and YouTube&apos;s ₹1 authorisation. They are statement lines, not recurring commitments.</p>
    <section className="simulation-card"><div><p>SIMULATE NEW AUTOPAY</p><h2>{simulated ? "Headspace is now being tracked" : "See what a new autopay looks like"}</h2><span>{simulated ? "UPI/HEADSPACE/7712003344 is on the full list, plain-language view, and cancel paths. A second click will not duplicate it." : "One click adds Headspace: ₹299 every month, source SMS, no email, and no issue flag. It never appears on the issues screen."}</span></div>{simulated ? <button className="secondary-button" onClick={onReset}>Reset simulation</button> : <button className="primary-button" onClick={onSimulate}>Simulate new autopay <i>→</i></button>}</section>
  </>;
}

function PlainLanguage({ items }: { items: Commitment[] }) {
  return <><ScreenHeader number="2" eyebrow="PLAIN LANGUAGE" title="The bank string, in words a person knows" copy="Every match comes from a hand-written merchant dictionary. Paytrace does not guess the merchant. Headspace joins only after you simulate it." />
    <section className="data-panel language-panel"><div className="language-caption"><span>STRING</span><span>A PERSON READS</span><span>WHAT IT ACTUALLY IS</span></div>{items.map((item) => <article className="language-row" key={item.id}><code>{item.rawNarration}</code><strong>{item.merchant}</strong><p>{item.plainDescription}</p></article>)}</section>
  </>;
}

function Issues({ items, total, leakage, hike }: { items: Commitment[]; total: number; leakage: number; hike: number }) {
  return <><ScreenHeader number="3" eyebrow="CHANGES, ISSUES, UNUSED" title="Only what deserves your attention" copy="Screen 1 is the whole book. This page is the part that should change what she does. The full year stays visible so flags are not mistaken for her entire financial life." />
    <section className="issue-metrics"><Metric value={formatINR(total)} label="Everything on screen 1, this year." /><Metric value={formatINR(leakage)} label="Still leaving for the gym, Canva, FitApp, and the caller tune." accent /><Metric value={formatINR(hike)} label="Spotify's silent hike. ₹119 became ₹139, with no email." accent /></section>
    <section className="issues-table"><div className="issue-caption"><span>PLAIN NAME</span><span>WHAT IS WRONG</span><span>MONTH</span><span>THIS YEAR</span><span>MESSAGE</span></div>{items.map((item) => <article className="issue-row" key={item.id}><strong>{item.merchant}</strong><p>{item.issue}</p><span>{monthlyCost(item)}</span><b>{formatINR(item.annualCost)}</b><small>{item.source}</small></article>)}</section>
    <p className="screen-footnote">Not on this page: Netflix, Google One, Prime, JioHotstar, insurance, electricity, society, and the loan. Electricity&apos;s changing amount and society&apos;s uneven dates are discovery signals, not waste.</p>
  </>;
}

function Metric({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) { return <article className={accent ? "issue-metric accent" : "issue-metric"}><strong>{value}</strong><span>{label}</span></article>; }

function CancelPaths({ items, stopped, onConfirm }: { items: Commitment[]; stopped: string[]; onConfirm: (id: string) => void }) {
  return <><ScreenHeader number="4" eyebrow="HOW TO STOP EACH ONE" title="A cancel path for every autopay" copy="Normal paths show two tracks: stop the service, then stop the money. Every path also says what to do if the merchant never replies. The loan has no revoke control." />
    <section className="path-list">{items.map((item) => <article className={`path-card ${["unused", "silent", "trial"].includes(item.kind) ? "issue" : ""} ${stopped.includes(item.id) ? "stopped" : ""}`} key={item.id}><div className="path-name"><strong>{item.merchant}</strong><span>{monthlyCost(item)}</span>{item.mandateRef && <small>Mandate: {item.mandateRef}</small>}</div><div className="path-copy"><div><b>STOP THE SERVICE</b><p>{item.stopService}</p></div><div><b>STOP THE MONEY</b><p>{item.stopMoney}</p></div><div className="silent-line"><b>IF THEY STAY SILENT</b><p>{item.ifSilent}</p></div>{item.trap && <p className="trap"><strong>Watch for:</strong> {item.trap}</p>}</div><div className="path-action">{stopped.includes(item.id) ? <span className="stopped-label">✓ Marked stopped</span> : item.canCancel ? <button onClick={() => onConfirm(item.id)}>I&apos;ve completed this <i>→</i></button> : <span className="no-action">No revoke control</span>}</div></article>)}</section>
  </>;
}

function monthlyCost(item: Commitment) { return item.cadence === "annual" ? "once a year" : item.id === "electricity" ? "about ₹1,800" : item.id === "society" ? "₹4,500 each time" : `${formatINR(item.amount)} / month`; }

function downloadCsv(items: Commitment[]) {
  const headers = ["statement_narration", "plain_name", "monthly_cost_inr", "annual_cost_inr", "source", "status", "issue", "cancel_path"];
  const encode = (value: string | number | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = items.map((item) => [item.rawNarration, item.merchant, item.cadence === "annual" ? "" : item.amount, item.annualCost, item.source, item.status, item.issue, item.cancellationPath].map(encode).join(","));
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "paytrace-commitments.csv"; anchor.click(); URL.revokeObjectURL(url);
}
