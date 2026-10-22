"use client";

import { useMemo, useState } from "react";
import { formatINR } from "@/lib/format";
import { unusedTotal, yearlyTotal } from "@/lib/analysis";
import type { Commitment } from "@/lib/types";

type DashboardProps = { commitments: Commitment[] };
type View = "overview" | "commitments" | "plan";

const monthlyPulse = [49, 57, 53, 63, 68, 60, 74, 66, 81, 72, 65, 78];
const months = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export function Dashboard({ commitments }: DashboardProps) {
  const [view, setView] = useState<View>("overview");
  const [selectedId, setSelectedId] = useState("fitline-gym");
  const [showAll, setShowAll] = useState(false);
  const selected = commitments.find((commitment) => commitment.id === selectedId) ?? commitments[0];
  const annual = useMemo(() => yearlyTotal(commitments), [commitments]);
  const unused = useMemo(() => unusedTotal(commitments), [commitments]);
  const debt = useMemo(() => commitments.find((item) => item.kind === "debt")?.annualCost ?? 0, [commitments]);
  const actionItems = useMemo(
    () => commitments.filter((item) => item.canCancel && ["unused", "silent", "trial"].includes(item.kind)).sort((a, b) => b.annualCost - a.annualCost),
    [commitments]
  );
  const displayActions = showAll ? actionItems : actionItems.slice(0, 3);

  function inspect(id: string) {
    setSelectedId(id);
    setView("commitments");
  }

  return (
    <main className="recur-shell">
      <aside className="side-rail">
        <div className="rail-brand"><span className="brand-orb">R</span><span>recur</span></div>
        <nav className="rail-nav" aria-label="Dashboard navigation">
          <NavButton icon="▦" label="Overview" active={view === "overview"} onClick={() => setView("overview")} />
          <NavButton icon="◫" label="Commitments" active={view === "commitments"} onClick={() => setView("commitments")} />
          <NavButton icon="✦" label="Action plan" active={view === "plan"} onClick={() => setView("plan")} />
        </nav>
        <div className="rail-note"><span>✦</span><p><strong>Private by design</strong>Your financial data is always explained, never guessed.</p></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="crumb"><span className="live-dot" /> LIVE ANALYSIS <i>·</i> FY 2026</div>
          <div className="person"><div className="notification">⌁<b>3</b></div><div className="person-avatar">P</div><div><strong>Priya Sharma</strong><small>Bengaluru, India</small></div><span className="chevron">⌄</span></div>
        </header>

        {view === "overview" && <Overview annual={annual} unused={unused} debt={debt} actionItems={displayActions} selected={selected} onInspect={inspect} onShowAll={() => setShowAll((visible) => !visible)} showAll={showAll} />}
        {view === "commitments" && <Commitments commitments={commitments} selected={selected} onInspect={setSelectedId} onPlan={() => setView("plan")} />}
        {view === "plan" && <ActionPlan actionItems={actionItems} selected={selected} onInspect={inspect} />}
      </section>
    </main>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={`rail-button ${active ? "active" : ""}`} onClick={onClick}><span>{icon}</span>{label}</button>;
}

function Overview({ annual, unused, debt, actionItems, selected, onInspect, onShowAll, showAll }: { annual: number; unused: number; debt: number; actionItems: Commitment[]; selected: Commitment; onInspect: (id: string) => void; onShowAll: () => void; showAll: boolean }) {
  return <>
    <section className="welcome-row">
      <div><p className="section-kicker">MONDAY, 22 OCTOBER</p><h1>Good evening, Priya<span>.</span></h1><p className="welcome-copy">Here is the quiet story behind your recurring money.</p></div>
      <button className="statement-button"><span>⇩</span> View source statements</button>
    </section>

    <section className="hero-grid">
      <article className="freedom-card">
        <div className="freedom-top"><span className="label-pill">POTENTIAL FREEDOM</span><span className="sparkle">✦</span></div>
        <p>There is room to make your money feel lighter.</p>
        <strong>{formatINR(unused)}</strong><small>could stop leaving your account this year</small>
        <div className="freedom-progress"><span /><i>4 opportunities found</i></div>
        <button onClick={() => onInspect("fitline-gym")}>See the opportunities <span>→</span></button>
      </article>
      <article className="spend-card">
        <div className="card-heading"><div><p className="section-kicker">12-MONTH COMMITMENT</p><h2>{formatINR(annual)}</h2></div><span className="year-chip">2026</span></div>
        <div className="pulse-chart" aria-label="Monthly recurring payment trend">
          {monthlyPulse.map((height, index) => <div className={index === 8 ? "bar current" : "bar"} key={`${height}-${index}`}><span style={{ height: `${height}%` }} /><small>{months[index]}</small></div>)}
        </div>
        <div className="chart-caption"><span><i className="dot purple" />Recurring payments</span><strong>Up 8.4% from last year</strong></div>
      </article>
    </section>

    <section className="metric-row" aria-label="Key payment metrics">
      <Metric icon="↻" tone="purple" label="Active commitments" value="14" detail="Across 5 payment rails" />
      <Metric icon="◎" tone="gold" label="Needs your attention" value="4" detail="Worth reviewing this week" />
      <Metric icon="◈" tone="green" label="Fixed essentials" value={formatINR(debt)} detail="Home loan, shown separately" />
    </section>

    <section className="dashboard-grid">
      <article className="action-queue panel">
        <div className="panel-heading"><div><p className="section-kicker">YOUR ACTION QUEUE</p><h2>A few good moves</h2></div><button onClick={onShowAll}>{showAll ? "Show less" : "See all"} <span>→</span></button></div>
        <div className="action-list">
          {actionItems.map((item, index) => <button className="action-row" onClick={() => onInspect(item.id)} key={item.id}><span className={`action-number ${item.kind}`}>0{index + 1}</span><div className="action-copy"><strong>{item.merchant}</strong><small>{item.status}</small></div><div className="action-value"><strong>{formatINR(item.annualCost)}</strong><small>/ year</small></div><span className="arrow">→</span></button>)}
        </div>
      </article>

      <article className="radar-card panel">
        <div className="panel-heading"><div><p className="section-kicker">RECURRING RADAR</p><h2>What we noticed</h2></div><span className="radar-icon">⌁</span></div>
        <div className="radar-ring"><div><strong>82</strong><span>money clarity<br />score</span></div></div>
        <div className="radar-note"><span>↗</span><p>Your score is <strong>12 points higher</strong> than last month. Nice work staying aware.</p></div>
      </article>
    </section>

    <section className="upcoming panel">
      <div className="panel-heading"><div><p className="section-kicker">UP NEXT</p><h2>Coming up in the next 14 days</h2></div><button onClick={() => onInspect(selected.id)}>Open calendar <span>→</span></button></div>
      <div className="upcoming-items"><Upcoming date="24" month="OCT" title="FitLine Gym" detail="UPI Autopay" value="₹1,500" color="gold" /><Upcoming date="28" month="OCT" title="Spotify Premium" detail="Card · price changed" value="₹139" color="purple" /><Upcoming date="01" month="NOV" title="Home loan EMI" detail="eNACH · fixed payment" value="₹8,500" color="dark" /></div>
    </section>
  </>;
}

function Metric({ icon, tone, label, value, detail }: { icon: string; tone: string; label: string; value: string; detail: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function Upcoming({ date, month, title, detail, value, color }: { date: string; month: string; title: string; detail: string; value: string; color: string }) {
  return <div className="upcoming-entry"><div className={`date-badge ${color}`}><strong>{date}</strong><span>{month}</span></div><div><strong>{title}</strong><small>{detail}</small></div><b>{value}</b></div>;
}

function Commitments({ commitments, selected, onInspect, onPlan }: { commitments: Commitment[]; selected: Commitment; onInspect: (id: string) => void; onPlan: () => void }) {
  return <section className="commitment-view">
    <div className="view-intro"><p className="section-kicker">ALL RECURRING PAYMENTS</p><h1>Every commitment,<br /><em>made legible.</em></h1><p>Tap a payment to see why Recur grouped it, what it costs, and what you can do next.</p></div>
    <div className="commitment-layout">
      <div className="commitment-table panel"><div className="table-title"><span>14 recurring payments found</span><button>Filter ⌄</button></div>{commitments.sort((a, b) => b.annualCost - a.annualCost).map((item) => <button className={`commitment-row ${item.id === selected.id ? "selected" : ""}`} onClick={() => onInspect(item.id)} key={item.id}><span className={`service-glyph ${item.kind}`}>{item.merchant.slice(0, 1)}</span><div><strong>{item.merchant}</strong><small>{item.instrument} · {item.cadence}</small></div><span className={`status-dot ${item.kind}`} /><b>{formatINR(item.annualCost)}</b></button>)}</div>
      <DetailCard commitment={selected} onPlan={onPlan} />
    </div>
  </section>;
}

function DetailCard({ commitment, onPlan }: { commitment: Commitment; onPlan: () => void }) {
  return <aside className="detail-card"><div className="detail-top"><span className={`service-glyph large ${commitment.kind}`}>{commitment.merchant.slice(0, 1)}</span><span className={`kind-pill ${commitment.kind}`}>{commitment.kind}</span></div><h2>{commitment.merchant}</h2><p className="raw-text">{commitment.rawNarration}</p><div className="detail-cost"><span>Expected cost this year</span><strong>{formatINR(commitment.annualCost)}</strong></div><div className="why-box"><span>✦</span><div><small>WHY RECUR FLAGGED THIS</small><p>{commitment.evidence}</p></div></div>{commitment.canCancel ? <button className="plan-button" onClick={onPlan}>Add to my action plan <span>→</span></button> : <p className="safe-payment">✓ This is a fixed essential, not a subscription to cancel.</p>}</aside>;
}

function ActionPlan({ actionItems, selected, onInspect }: { actionItems: Commitment[]; selected: Commitment; onInspect: (id: string) => void }) {
  return <section className="plan-view"><div className="view-intro"><p className="section-kicker">A CALMER MONEY ROUTINE</p><h1>Your four-step<br /><em>action plan.</em></h1><p>Small decisions, ordered by the money they could return to you.</p></div><div className="plan-layout"><div className="plan-steps">{actionItems.map((item, index) => <button className={`plan-step ${item.id === selected.id ? "selected" : ""}`} onClick={() => onInspect(item.id)} key={item.id}><span>{index + 1}</span><div><small>STEP 0{index + 1}</small><strong>{item.merchant}</strong><p>{item.cancellationPath}</p></div><b>{formatINR(item.annualCost)}<em> saved / year</em></b></button>)}</div><DetailCard commitment={selected} onPlan={() => undefined} /></div></section>;
}
