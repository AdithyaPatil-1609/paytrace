"use client";

import { useEffect, useMemo, useState } from "react";
import { withSimulatedAutopay } from "@/data/simulation";
import { hikeAmount, isSilentPriceHike, issueItems, splitByBucket, yearlyTotal } from "@/lib/analysis";
import { toCsv } from "@/lib/csv";
import { bucketCopy, bucketLabels, detectCommitments } from "@/lib/engine";
import { formatDate, formatINR } from "@/lib/format";
import type { Commitment, Dataset } from "@/lib/types";
import { AnnualDashboard } from "@/components/visualizations/annual-dashboard";
import { PriceHistory } from "@/components/visualizations/price-history";
import { RenewalCalendar } from "@/components/visualizations/renewal-calendar";
import { UnusedSavings } from "@/components/visualizations/unused-savings";
import { PaymentCalendar } from "@/components/visualizations/payment-calendar";
import { DemoOverlay, type DemoStep } from "@/components/demo-runner";

type DashboardProps = { dataset: Dataset };
type Screen = "annual" | "list" | "language" | "issues" | "paths";

const screens: { id: Screen; number: string; label: string }[] = [
  { id: "annual", number: "01", label: "Annual" },
  { id: "list", number: "02", label: "All payments" },
  { id: "language", number: "03", label: "Plain language" },
  { id: "issues", number: "04", label: "Issues" },
  { id: "paths", number: "05", label: "Cancel paths" }
];

export function Dashboard({ dataset }: DashboardProps) {
  const [screen, setScreen] = useState<Screen>("annual");
  const [simulated, setSimulated] = useState(false);
  const [revoked, setRevoked] = useState<string[]>([]);
  const [paused, setPaused] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [demoStep, setDemoStep] = useState<DemoStep>("idle");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Detection runs over the fixture rows, so simulating an autopay means
  // adding rows and detecting again, not appending a finished commitment.
  const detected = useMemo(
    () => detectCommitments(simulated ? withSimulatedAutopay(dataset) : dataset),
    [dataset, simulated]
  );

  // The year before Simulate, so the screen can show the move.
  const baseline = useMemo(() => yearlyTotal(detectCommitments(dataset)), [dataset]);
  const active = detected.filter((item) => !revoked.includes(item.id));
  const total = yearlyTotal(active);
  const fullYear = yearlyTotal(detected);
  const stoppedValue = fullYear - total;
  const issues = issueItems(active);
  const leakage = yearlyTotal(active.filter((item) => item.kind === "unused"));
  const hike = active.filter(isSilentPriceHike).reduce((sum, item) => sum + hikeAmount(item), 0);
  const debt = yearlyTotal(active.filter((item) => item.bucket === "debt"));
  const openItem = active.find((item) => item.id === openId) ?? null;

  const newItem = active.find((item) => item.signals.includes("new"));
  const hikeItem = active.find((item) => item.signals.includes("silent_hike"));
  const zombieItem = active
    .filter((item) => item.kind === "unused" && item.cancelMode === "normal")
    .sort((a, b) => b.annualCost - a.annualCost)[0];

  // Bring whatever the run is talking about into view.
  useEffect(() => {
    if (!highlightId) return;
    const target = document.querySelector(`[data-row="${highlightId}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, screen]);

  function startDemo() {
    setSimulated(true);
    setScreen("list");
    setHighlightId("headspace-plus");
    setDemoStep("autopay");
  }

  function advanceDemo() {
    if (demoStep === "autopay") {
      setScreen("issues");
      setHighlightId(hikeItem?.id ?? null);
      setDemoStep("price");
      return;
    }
    if (demoStep === "price") {
      setHighlightId(zombieItem?.id ?? null);
      setDemoStep("unused");
      return;
    }
    if (demoStep === "unused") {
      setScreen("paths");
      setHighlightId(zombieItem?.id ?? null);
      setDemoStep("cancel");
    }
  }

  function endDemo() {
    setDemoStep("done");
    setHighlightId(null);
  }

  function resetSimulation() {
    setSimulated(false);
    setRevoked((current) => current.filter((id) => id !== "headspace-plus"));
    setDemoStep("idle");
    setHighlightId(null);
  }

  function confirmRevoke(id: string) {
    setRevoked((current) => (current.includes(id) ? current : [...current, id]));
    setPaused((current) => current.filter((entry) => entry !== id));
  }

  function takePause(id: string) {
    setPaused((current) => (current.includes(id) ? current : [...current, id]));
  }

  return (
    <main className="paytrace-shell">
      <header className="product-bar">
        <div className="wordmark">
          <span>p</span>paytrace
        </div>
        <p>
          PROTOTYPE <i>·</i> SYNTHETIC MESSAGES ONLY
        </p>
        <div className="bar-actions">
          <button className="run-demo" onClick={demoStep === "idle" || demoStep === "done" ? startDemo : endDemo}>
            {demoStep === "idle" || demoStep === "done" ? "▶ Run the demo" : "■ Stop the run"}
          </button>
          <button className="export-csv" onClick={() => downloadCsv(active)}>
            ↓ Export CSV
          </button>
          <div className="persona">
            <b>PD</b>
            <span>Priya Demo</span>
          </div>
        </div>
      </header>

      <div className="app-layout">
        <aside className="side-nav">
          <p>THE FIVE SCREENS</p>
          {screens.map((item) => (
            <button
              key={item.id}
              className={screen === item.id ? "active" : ""}
              onClick={() => setScreen(item.id)}
            >
              <span>{item.number}</span>
              {item.label}
            </button>
          ))}
          <div className="side-note">
            <strong>Prototype only</strong>
            <span>It shows a route to stop a payment. It never sends a revoke.</span>
          </div>
        </aside>

        <section className="main-stage">
          <nav className="mobile-nav">
            {screens.map((item) => (
              <button
                className={screen === item.id ? "active" : ""}
                onClick={() => setScreen(item.id)}
                key={item.id}
              >
                {item.number}
              </button>
            ))}
          </nav>

          {screen === "annual" && (
            <AnnualView
              items={active}
              total={total}
              leakage={leakage}
              debt={debt}
              stoppedValue={stoppedValue}
              asOf={dataset.asOf}
              onOpen={setOpenId}
            />
          )}
          {screen === "list" && (
            <AllPayments
              items={active}
              total={total}
              baseline={baseline}
              simulated={simulated}
              onSimulate={() => setSimulated(true)}
              onReset={resetSimulation}
              onOpen={setOpenId}
              highlightId={highlightId}
            />
          )}
          {screen === "language" && <PlainLanguage items={active} onOpen={setOpenId} />}
          {screen === "issues" && (
            <Issues
              items={issues}
              allItems={active}
              total={total}
              leakage={leakage}
              hike={hike}
              onOpen={setOpenId}
              onGoToCancel={() => setScreen("paths")}
              highlightId={highlightId}
            />
          )}
          {screen === "paths" && (
            <CancelPaths
              items={active}
              allItems={detected}
              revoked={revoked}
              paused={paused}
              onConfirm={confirmRevoke}
              onPause={takePause}
              highlightId={highlightId}
            />
          )}
        </section>
      </div>

      <DemoOverlay
        step={demoStep}
        newItem={newItem}
        hikeItem={hikeItem}
        zombieItem={zombieItem}
        onAdvance={advanceDemo}
        onDecline={endDemo}
        onFinish={endDemo}
      />

      {openItem && <DetailPanel item={openItem} asOf={dataset.asOf} onClose={() => setOpenId(null)} />}
    </main>
  );
}

function ScreenHeader({ number, eyebrow, title, copy }: { number: string; eyebrow: string; title: string; copy: string }) {
  return (
    <header className="screen-header">
      <p>
        <span>SCREEN {number}</span> · {eyebrow}
      </p>
      <h1>{title}</h1>
      <div>{copy}</div>
    </header>
  );
}

function AnnualView({
  items,
  total,
  leakage,
  debt,
  stoppedValue,
  asOf,
  onOpen
}: {
  items: Commitment[];
  total: number;
  leakage: number;
  debt: number;
  stoppedValue: number;
  asOf: string;
  onOpen: (id: string) => void;
}) {
  const split = splitByBucket(items);
  const largest = Math.max(...split.map((group) => group.total), 1);

  return (
    <>
      <ScreenHeader
        number="1"
        eyebrow="THE YEAR"
        title="The next twelve months, on one screen"
        copy="Every commitment projected forward and split five ways. The unused part is the money that should move. The loan sits apart from both: it is a debt, not a subscription."
      />
      <section className="annual-headline">
        <article className="annual-figure">
          <span>COMMITTED TO LEAVE</span>
          <strong>{formatINR(total)}</strong>
          <small>Over the next twelve months, across the savings account and the card.</small>
        </article>
        <article className="annual-figure accent">
          <span>STILL DEBITING, NOT USED</span>
          <strong>{formatINR(leakage)}</strong>
          <small>The part of the year that a decision can remove.</small>
        </article>
        <article className="annual-figure muted">
          <span>HOME-LOAN EMI</span>
          <strong>{formatINR(debt)}</strong>
          <small>This prototype has no cancel button for it.</small>
        </article>
      </section>

      {stoppedValue > 0 && (
        <p className="revoke-banner">
          A revoke confirmed on screen 5 has taken <strong>{formatINR(stoppedValue)}</strong> out of the year.
        </p>
      )}

      <AnnualDashboard items={items} asOf={asOf} onOpen={onOpen} />

      <h2 className="viz-heading">The month on the fridge door</h2>
      <PaymentCalendar items={items} asOf={asOf} onOpen={onOpen} />

      <h2 className="viz-heading">The same year, split by what to do about it</h2>
      <section className="bucket-list">
        {split.map((group) => (
          <article className="bucket-card" key={group.bucket} data-bucket={group.bucket}>
            <header>
              <div>
                <strong>{bucketLabels[group.bucket]}</strong>
                <span>{bucketCopy[group.bucket]}</span>
              </div>
              <b>{formatINR(group.total)}</b>
            </header>
            <div className="bucket-bar">
              <i style={{ width: `${Math.max((group.total / largest) * 100, 2)}%` }} />
            </div>
            <div className="bucket-rows">
              {group.rows.map((item) => (
                <button key={item.id} onClick={() => onOpen(item.id)}>
                  <span>{item.merchant}</span>
                  <b>{formatINR(item.annualCost)}</b>
                </button>
              ))}
              {group.rows.length === 0 && <p className="bucket-empty">Nothing in this group.</p>}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

function AllPayments({
  items,
  total,
  baseline,
  simulated,
  onSimulate,
  onReset,
  onOpen,
  highlightId
}: {
  items: Commitment[];
  total: number;
  baseline: number;
  simulated: boolean;
  onSimulate: () => void;
  onReset: () => void;
  onOpen: (id: string) => void;
  highlightId?: string | null;
}) {
  return (
    <>
      <ScreenHeader
        number="2"
        eyebrow="ALL OF THEM"
        title="Every periodic payment, on one page"
        copy="This is the whole book before any judgement. Monthly rows show the amount that leaves each month and the amount across the year. Electricity changes amount, and society has uneven dates. Both still belong here."
      />
      <section className="year-banner">
        <div>
          <span>YEAR OF EVERYTHING</span>
          <strong>{formatINR(total)}</strong>
          {simulated && baseline !== total && (
            <p className="year-delta">
              <s>{formatINR(baseline)}</s> → <b>{formatINR(total)}</b> after one new autopay
            </p>
          )}
          <small>{items.length} recurring commitments from statement lines and payment messages.</small>
        </div>
        <div className="year-note">
          <b>{simulated ? "New autopay is included" : "A clear annual total"}</b>
          <p>
            {simulated
              ? "Headspace was detected from one statement line and one live mandate. It is not an issue."
              : "The current Spotify price is shown here. Price history belongs on the issues screen."}
          </p>
        </div>
      </section>

      <section className="data-panel">
        <div className="table-caption">
          <span>WHAT THE MESSAGE PRINTS</span>
          <span>EACH MONTH</span>
          <span>THIS YEAR</span>
          <span>SOURCE</span>
        </div>
        <div className="payment-rows">
          {items.map((item) => (
            <button
              className={[
                "payment-row",
                item.signals.includes("new") ? "is-new" : "",
                highlightId === item.id ? "is-spotlit" : ""
              ].join(" ").trim()}
              data-row={item.id}
              key={item.id}
              onClick={() => onOpen(item.id)}
            >
              <strong>{item.rawNarration}</strong>
              <span>{monthlyCost(item)}</span>
              <b>{formatINR(item.annualCost)}</b>
              <small>{item.source}</small>
            </button>
          ))}
        </div>
      </section>
      <p className="exclusion-note">
        <strong>Not added to this list:</strong> one Swiggy order, a transfer to Rahul, salary credits, the
        credit-card repayment, and YouTube&apos;s ₹1 authorisation. Each is a statement line with no second debit
        and no mandate behind it, so the grouping drops it. Open any row above to see the rule that kept it.
      </p>

      <h2 className="viz-heading">What is due next</h2>
      <RenewalCalendar items={items} onOpen={onOpen} />

      <section className="simulation-card">
        <div>
          <p>SIMULATE NEW AUTOPAY</p>
          <h2>{simulated ? "Headspace is now being tracked" : "See what a new autopay looks like"}</h2>
          <span>
            {simulated
              ? "One statement line, one UPI mandate, and two SMS were added to the fixture. Detection found Headspace on its own. A second click will not duplicate it."
              : "One click appends the rows a new mandate leaves behind: ₹299 on 22 Oct 2026, a UPI Autopay mandate, and the SMS. Detection then runs again."}
          </span>
        </div>
        {simulated ? (
          <button className="secondary-button" onClick={onReset}>
            Reset simulation
          </button>
        ) : (
          <button className="primary-button" onClick={onSimulate}>
            Simulate new autopay <i>→</i>
          </button>
        )}
      </section>
    </>
  );
}

function PlainLanguage({ items, onOpen }: { items: Commitment[]; onOpen: (id: string) => void }) {
  const unknown = items.filter((item) => !item.inDictionary);
  return (
    <>
      <ScreenHeader
        number="3"
        eyebrow="PLAIN LANGUAGE"
        title="The bank string, in words a person knows"
        copy="Every match comes from the hand-written dictionary in data/raw. Paytrace does not guess the merchant, and the longest matching pattern wins, so PayPal Spotify never collapses into Spotify."
      />
      <section className="data-panel language-panel">
        <div className="language-caption">
          <span>STRING</span>
          <span>A PERSON READS</span>
          <span>WHAT IT ACTUALLY IS</span>
        </div>
        {items.map((item) => (
          <button className="language-row" key={item.id} onClick={() => onOpen(item.id)}>
            <code>{item.rawNarration}</code>
            <strong>
              {item.merchant}
              {!item.inDictionary && <i className="unknown-tag">unknown</i>}
            </strong>
            <p>{item.plainDescription}</p>
          </button>
        ))}
      </section>
      <p className="screen-footnote">
        {unknown.length === 0
          ? "Every string on this fixture matched a pattern. A string that does not match stays unknown rather than being guessed at."
          : `${unknown.length} string(s) did not match a pattern. They stay unknown until someone names them by hand.`}
      </p>
    </>
  );
}

function Issues({
  items,
  allItems,
  total,
  leakage,
  hike,
  onOpen,
  onGoToCancel,
  highlightId
}: {
  items: Commitment[];
  allItems: Commitment[];
  total: number;
  leakage: number;
  hike: number;
  onOpen: (id: string) => void;
  onGoToCancel: () => void;
  highlightId?: string | null;
}) {
  return (
    <>
      <ScreenHeader
        number="4"
        eyebrow="CHANGES, ISSUES, UNUSED"
        title="Only what deserves your attention"
        copy="The list screen is the whole book. This page is the part that should change what she does. The full year stays visible so flags are not mistaken for her entire financial life."
      />
      <section className="issue-metrics">
        <Metric value={formatINR(total)} label="Everything on the list screen, this year." />
        <Metric value={formatINR(leakage)} label="Still leaving for the gym, Canva, FitApp, and the caller tune." accent />
        <Metric value={formatINR(hike)} label="Spotify's silent hike. ₹119 became ₹139, with no price message." accent />
      </section>
      <section className="issues-table">
        <div className="issue-caption">
          <span>PLAIN NAME</span>
          <span>WHAT IS WRONG</span>
          <span>MONTH</span>
          <span>THIS YEAR</span>
          <span>MESSAGE</span>
        </div>
        {items.map((item) => (
          <button
            className={highlightId === item.id ? "issue-row is-spotlit" : "issue-row"}
            data-row={item.id}
            key={item.id}
            onClick={() => onOpen(item.id)}
          >
            <strong>{item.merchant}</strong>
            <p>{item.issue}</p>
            <span>{monthlyCost(item)}</span>
            <b>{formatINR(item.annualCost)}</b>
            <small>{item.source}</small>
          </button>
        ))}
      </section>
      <h2 className="viz-heading">The price that moved</h2>
      <PriceHistory items={allItems} onOpen={onOpen} />

      <h2 className="viz-heading">What stopping them would be worth</h2>
      <UnusedSavings items={allItems} onOpen={onOpen} onGoToCancel={onGoToCancel} />

      <p className="screen-footnote">
        Not on this page: Netflix, Google One, Prime, JioHotstar, insurance, electricity, society, and the loan.
        Electricity&apos;s changing amount and society&apos;s uneven dates are discovery signals, not waste.
      </p>
    </>
  );
}

function Metric({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <article className={accent ? "issue-metric accent" : "issue-metric"}>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function CancelPaths({
  items,
  allItems,
  revoked,
  paused,
  onConfirm,
  onPause,
  highlightId
}: {
  items: Commitment[];
  allItems: Commitment[];
  revoked: string[];
  paused: string[];
  onConfirm: (id: string) => void;
  onPause: (id: string) => void;
  highlightId?: string | null;
}) {
  const stoppedRows = allItems.filter((item) => revoked.includes(item.id));
  const saved = stoppedRows.reduce((sum, item) => sum + item.annualCost, 0);

  return (
    <>
      <ScreenHeader
        number="5"
        eyebrow="HOW TO STOP EACH ONE"
        title="A cancel path for every autopay"
        copy="A normal path has two tracks: stop the service, then stop the money. Every path also says what to do when the merchant never replies, because the revoke does not need their answer. The loan has no revoke control."
      />
      {saved > 0 && (
        <p className="revoke-banner">
          Confirmed stops have taken <strong>{formatINR(saved)}</strong> out of the year:{" "}
          {stoppedRows.map((item) => item.merchant).join(", ")}.
        </p>
      )}
      <section className="path-list">
        {items.map((item) => {
          const isIssue = ["unused", "silent", "trial"].includes(item.kind);
          const isPaused = paused.includes(item.id);
          return (
            <article
              className={`path-card ${isIssue ? "issue" : ""} ${isPaused ? "paused" : ""} ${highlightId === item.id ? "is-spotlit" : ""}`}
              data-row={item.id}
              key={item.id}
            >
              <div className="path-name">
                <strong>{item.merchant}</strong>
                <span>{monthlyCost(item)}</span>
                <small className="path-mode">{modeLabel(item)}</small>
                {item.mandateRef && <small>Mandate: {item.mandateRef}</small>}
              </div>
              <div className="path-copy">
                <div>
                  <b>STOP THE SERVICE</b>
                  <p>{item.stopService}</p>
                  {item.mechanism === "vas" && (
                    <code className="stop-line">Sample: send STOP CT to 155223</code>
                  )}
                </div>
                <div>
                  <b>STOP THE MONEY</b>
                  <p>{item.stopMoney}</p>
                </div>
                <div className="silent-line">
                  <b>IF THEY STAY SILENT</b>
                  <p>{item.ifSilent}</p>
                </div>
                {item.trap && (
                  <p className="trap">
                    <strong>Watch for:</strong> {item.trap}
                  </p>
                )}
                {isPaused && (
                  <p className="pause-result">
                    Pause taken. Mandate after pause · <strong>Active</strong>. The year has not moved by one rupee.
                    Only a revoke stops the money.
                  </p>
                )}
              </div>
              <div className="path-action">
                {item.cancelMode === "block" ? (
                  <span className="no-action">No revoke control</span>
                ) : (
                  <>
                    {item.mechanism === "upi_autopay" && !isPaused && (
                      <button className="pause-button" onClick={() => onPause(item.id)}>
                        Accept the 2-month pause
                      </button>
                    )}
                    <button onClick={() => onConfirm(item.id)}>
                      {item.cancelMode === "normal" ? "Confirm the revoke" : "Mark it handled"} <i>→</i>
                    </button>
                    <small>
                      {item.cancelMode === "normal"
                        ? `Confirming drops the year by ${formatINR(item.annualCost)}.`
                        : "This does not change the year. The amount due remains."}
                    </small>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}

function DetailPanel({ item, asOf, onClose }: { item: Commitment; asOf: string; onClose: () => void }) {
  const priceNotices = item.notices.filter((notice) => notice.eventType === "price_change");
  return (
    <div className="detail-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <aside className="detail-panel" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <code>{item.rawNarration}</code>
            <h2>{item.merchant}</h2>
            <p>{item.plainDescription}</p>
          </div>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <section className="detail-facts">
          <Fact label="This year" value={formatINR(item.annualCost)} />
          <Fact label="Each charge" value={monthlyCost(item)} />
          <Fact label="Rhythm" value={item.cadence} />
          <Fact label="Instrument" value={item.instrument} />
          <Fact label="Debits seen" value={String(item.debitCount)} />
          <Fact label="Next charge" value={formatDate(item.nextCharge)} />
          <Fact label="Last opened" value={item.lastOpened ? formatDate(item.lastOpened) : "No record"} />
          <Fact label="Opens in 12 months" value={item.opensLast12Months === undefined ? "—" : String(item.opensLast12Months)} />
        </section>

        <section className="detail-block">
          <h3>Why it counts as recurring</h3>
          <p>{item.whyRecurring}</p>
          {item.mandateRef && (
            <p className="detail-mandate">
              Mandate {item.mandateRef} · status {item.mandateStatus ?? "unknown"} as of {formatDate(asOf)}.
            </p>
          )}
        </section>

        {item.issue && (
          <section className="detail-block flagged">
            <h3>What is wrong</h3>
            <p>{item.issue}</p>
          </section>
        )}

        <section className="detail-block">
          <h3>Notices · {item.notices.length}</h3>
          <p className="detail-note">
            Price-change messages · <strong>{priceNotices.length === 0 ? "none" : priceNotices.length}</strong>
            {priceNotices.length === 0 && item.amountPattern === "step" && " — that empty list is the finding."}
          </p>
          <ul className="notice-list">
            {item.notices.slice(-6).map((notice) => (
              <li key={notice.noticeId}>
                <span>
                  {formatDate(notice.sentOn)} · {notice.channel.toUpperCase()} · {notice.eventType}
                </span>
                <p>{notice.text}</p>
              </li>
            ))}
            {item.notices.length === 0 && <li className="empty">No message is attached to this row.</li>}
          </ul>
        </section>

        {item.holds.length > 0 && (
          <section className="detail-block">
            <h3>Authorisation holds</h3>
            <p className="detail-note">
              Held out of the price. A ₹{item.holds[0].amount} hold is a card check, not the plan.
            </p>
          </section>
        )}

        <section className="detail-block">
          <h3>Evidence · {item.evidenceRows.length} statement lines</h3>
          <div className="evidence-table">
            {item.evidenceRows.map((row) => (
              <div key={row.txnId}>
                <span>{formatDate(row.date)}</span>
                <code>{row.narration}</code>
                <b>{formatINR(row.amount)}</b>
                <small>{row.reference}</small>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function modeLabel(item: Commitment) {
  if (item.cancelMode === "block") return "DEBT · NO CANCEL";
  if (item.cancelMode === "warn") return "OBLIGATION · DECIDE CAREFULLY";
  if (item.cancelMode === "explain") return "THE AMOUNT DUE REMAINS";
  return "TWO TRACKS";
}

function monthlyCost(item: Commitment) {
  if (item.cadence === "annual") return "once a year";
  if (item.cadence === "irregular") return `${formatINR(item.amount)} each time`;
  if (item.amountPattern === "variable") return `about ${formatINR(item.amount)}`;
  return `${formatINR(item.amount)} / month`;
}

function downloadCsv(items: Commitment[]) {
  const headers = [
    "statement_narration",
    "plain_name",
    "what_it_is",
    "instrument",
    "cadence",
    "amount_pattern",
    "each_charge_inr",
    "annual_cost_inr",
    "bucket",
    "signals",
    "status",
    "debits_seen",
    "last_charge",
    "next_charge",
    "last_opened",
    "message_source",
    "stop_the_service",
    "stop_the_money",
    "if_they_stay_silent"
  ];
  const rows = items.map((item) => [
    item.rawNarration,
    item.merchant,
    item.plainDescription,
    item.instrument,
    item.cadence,
    item.amountPattern,
    item.cadence === "annual" ? "" : item.amount,
    item.annualCost,
    item.bucket,
    item.signals.join(" "),
    item.status,
    item.debitCount,
    item.lastCharge,
    item.nextCharge ?? "",
    item.lastOpened ?? "",
    item.source,
    item.stopService,
    item.stopMoney,
    item.ifSilent
  ]);
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "paytrace-commitments.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
