"use client";

import { useMemo, useState } from "react";
import { withSimulatedAutopay } from "@/data/simulation";
import { hikeAmount, isSilentPriceHike, issueItems, keptLeakTotal, splitByBucket, yearlyTotal } from "@/lib/analysis";
import { toCsv } from "@/lib/csv";
import { bucketCopy, bucketLabels, detectCommitments } from "@/lib/engine";
import { formatDate, formatINR } from "@/lib/format";
import type { Commitment, Dataset } from "@/lib/types";
import type { SourceInfo } from "@/db/neo4j/dataset";
import { AnnualDashboard } from "@/components/visualizations/annual-dashboard";
import { PriceHistory } from "@/components/visualizations/price-history";
import { RenewalCalendar } from "@/components/visualizations/renewal-calendar";
import { UnusedSavings } from "@/components/visualizations/unused-savings";
import { PaymentCalendar } from "@/components/visualizations/payment-calendar";

type DashboardProps = { dataset: Dataset; source: SourceInfo; commitments?: Commitment[] };
type Screen = "annual" | "list" | "issues" | "paths";

const screens: { id: Screen; number: string; label: string }[] = [
  { id: "list", number: "01", label: "All payments" },
  { id: "issues", number: "02", label: "Issues" },
  { id: "paths", number: "03", label: "Cancel paths" },
  { id: "annual", number: "04", label: "Annual" }
];

export function Dashboard({ dataset, source, commitments }: DashboardProps) {
  const [screen, setScreen] = useState<Screen>("list");
  const [simulated, setSimulated] = useState(false);
  const [revoked, setRevoked] = useState<string[]>([]);
  const [kept, setKept] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  // Neo4j already decided the rows. Simulate is a new debit the graph has
  // not seen, so that path detects again from the rows.
  const detected = useMemo(() => {
    if (commitments && commitments.length > 0 && !simulated) return commitments;
    return detectCommitments(simulated ? withSimulatedAutopay(dataset) : dataset);
  }, [dataset, simulated, commitments]);

  // The rows before Simulate: their total drives the before-and-after
  // reading, and their ids tell Reset what the simulation added.
  const baseDetected = useMemo(
    () => (commitments && commitments.length > 0 ? commitments : detectCommitments(dataset)),
    [dataset, commitments]
  );
  const baseline = yearlyTotal(baseDetected);
  const active = detected.filter((item) => !revoked.includes(item.id));
  const total = yearlyTotal(active);
  const fullYear = yearlyTotal(detected);
  const stoppedValue = fullYear - total;
  // Keeping a row settles the warning across every screen, not just the one
  // the decision was made on.
  const issues = issueItems(active, kept);
  const keptLeak = keptLeakTotal(active, kept);
  const leakage = yearlyTotal(active.filter((item) => item.kind === "unused"));
  const hike = active.filter(isSilentPriceHike).reduce((sum, item) => sum + hikeAmount(item), 0);
  const debt = yearlyTotal(active.filter((item) => item.bucket === "debt"));
  const openItem = active.find((item) => item.id === openId) ?? null;

  function resetSimulation() {
    setSimulated(false);
    // Forget any decision taken on a row that only the simulation created,
    // found by id rather than by name: ids now carry account and descriptor.
    const baseIds = new Set(baseDetected.map((item) => item.id));
    setRevoked((current) => current.filter((id) => baseIds.has(id)));
    setKept((current) => current.filter((id) => baseIds.has(id)));
  }

  function confirmRevoke(id: string) {
    setRevoked((current) => (current.includes(id) ? current : [...current, id]));
    setKept((current) => current.filter((entry) => entry !== id));
  }

  /** Accepting the warning settles it: the row stops being flagged. */
  function keepIt(id: string) {
    setKept((current) => (current.includes(id) ? current : [...current, id]));
  }

  function flagAgain(id: string) {
    setKept((current) => current.filter((entry) => entry !== id));
  }

  return (
    <main className="paytrace-shell">
      <div className="product-chrome">
        <header className="product-bar">
          <div className="wordmark">
            <span>p</span>paytrace
          </div>
          <p>
            PROTOTYPE <i>·</i> SYNTHETIC MESSAGES ONLY
          </p>
          <span className={source.kind === "neo4j" ? "source-badge live" : "source-badge"}>
            <i />
            {source.kind === "neo4j" ? "Reading Neo4j" : "Reading CSV fixture"}
          </span>
          <div className="bar-actions">
            <button className="export-csv" onClick={() => downloadCsv(active)}>
              ↓ Export CSV
            </button>
            <div className="persona">
              <b>PD</b>
              <span>Priya Demo</span>
            </div>
          </div>
        </header>
        <EvidenceStrip source={source} />
      </div>

      <div className="app-layout">
        <aside className="side-nav">
          <p>THE FOUR SCREENS</p>
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
              source={source}
              detected={detected.length}
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
              asOf={dataset.asOf}
            />
          )}
          {screen === "issues" && (
            <Issues
              items={issues}
              allItems={active}
              total={total}
              leakage={leakage}
              hike={hike}
              onOpen={setOpenId}
              onGoToCancel={() => setScreen("paths")}
              keptLeak={keptLeak}
            />
          )}
          {screen === "paths" && (
            <CancelPaths
              items={active}
              allItems={detected}
              revoked={revoked}
              kept={kept}
              onConfirm={confirmRevoke}
              onKeep={keepIt}
              onFlagAgain={flagAgain}
            />
          )}
        </section>
      </div>

      {openItem && <DetailPanel item={openItem} asOf={dataset.asOf} onClose={() => setOpenId(null)} />}
    </main>
  );
}

/**
 * Stays under the product bar on every screen. It reports the live source
 * only: Neo4j counts come from the graph, and the fixture state never
 * claims those rows were read from Neo4j.
 */
function EvidenceStrip({ source }: { source: SourceInfo }) {
  if (source.kind === "neo4j") {
    const host = source.host ?? "the configured host";
    return (
      <section className="evidence-strip live" aria-label="Neo4j evidence graph">
        <p className="evidence-mark">Neo4j</p>
        <p className="evidence-copy">
          Evidence graph · <code>{host}</code>
          {source.analyzed ? " · issues, the year, and cancel paths decided here" : ""}
        </p>
        <dl className="evidence-counts">
          <div>
            <dt>Payments</dt>
            <dd>{source.counts.payments}</dd>
          </div>
          <div>
            <dt>Messages</dt>
            <dd>{source.counts.messages}</dd>
          </div>
          <div>
            <dt>Mandates</dt>
            <dd>{source.counts.mandates}</dd>
          </div>
          <div>
            <dt>Patterns</dt>
            <dd>{source.counts.patterns}</dd>
          </div>
          <div>
            <dt>Commitments</dt>
            <dd>{source.counts.commitments}</dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section className="evidence-strip" aria-label="CSV fixture">
      <p className="evidence-mark">CSV fixture</p>
      <p className="evidence-copy">{source.note}</p>
    </section>
  );
}

/**
 * Annual-only proof. The strip already names the source, so this panel only
 * compares the graph's commitment count with the rows detection found.
 */
function SourcePanel({ source, detected }: { source: SourceInfo; detected: number }) {
  if (source.kind !== "neo4j") return null;

  const inGraph = source.counts.commitments;
  return (
    <section className="source-panel live">
      <header>
        <strong>{source.analyzed ? "Decided in Neo4j" : "Commitments"}</strong>
        <span>
          {detected} on screen · {inGraph} commitment nodes
        </span>
      </header>
      <p>
        {source.analyzed && source.yearTotal !== undefined
          ? `The issues, the cancel path on each row, and the year of ${formatINR(source.yearTotal)} came back from a Cypher query. This screen is showing that result.`
          : `The graph holds ${inGraph} commitment nodes. Detection in the app found ${detected} from the rows it returned.`}
      </p>
    </section>
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
  source,
  detected,
  onOpen
}: {
  items: Commitment[];
  total: number;
  leakage: number;
  debt: number;
  stoppedValue: number;
  asOf: string;
  source: SourceInfo;
  detected: number;
  onOpen: (id: string) => void;
}) {
  const split = splitByBucket(items);
  const largest = Math.max(...split.map((group) => group.total), 1);

  return (
    <>
      <ScreenHeader
        number="4"
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
          A revoke confirmed on screen 3 has taken <strong>{formatINR(stoppedValue)}</strong> out of the year.
        </p>
      )}

      <SourcePanel source={source} detected={detected} />

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
                <button
                  className={item.signals.includes("new") ? "is-new" : ""}
                  key={item.id}
                  onClick={() => onOpen(item.id)}
                >
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
  asOf
}: {
  items: Commitment[];
  total: number;
  baseline: number;
  simulated: boolean;
  onSimulate: () => void;
  onReset: () => void;
  onOpen: (id: string) => void;
  asOf: string;
}) {
  return (
    <>
      <ScreenHeader
        number="1"
        eyebrow="ALL OF THEM"
        title="Every periodic payment, on one page"
        copy="This is the whole book before any judgement. Each row shows the bank string and the plain name beside it. Electricity changes amount, and society has uneven dates. Both still belong here."
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
          <span>A PERSON READS</span>
          <span>EACH MONTH</span>
          <span>THIS YEAR</span>
          <span>SOURCE</span>
        </div>
        <div className="payment-rows">
          {items.map((item) => (
            <button
              className={["payment-row", item.signals.includes("new") ? "is-new" : ""].join(" ").trim()}
              data-row={item.id}
              key={item.id}
              onClick={() => onOpen(item.id)}
            >
              <strong className="raw-narration">{item.rawNarration}</strong>
              <span className="pay-plain">
                <strong>
                  {item.merchant}
                  {!item.inDictionary && <i className="unknown-tag">unknown</i>}
                </strong>
                <em>{item.plainDescription}</em>
              </span>
              <span className="pay-month">{monthlyCost(item)}</span>
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

      <h2 className="viz-heading">The next two months</h2>
      <RenewalCalendar items={items} asOf={asOf} onOpen={onOpen} />

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

function Issues({
  items,
  allItems,
  total,
  leakage,
  hike,
  onOpen,
  onGoToCancel,
  keptLeak
}: {
  items: Commitment[];
  allItems: Commitment[];
  total: number;
  leakage: number;
  hike: number;
  onOpen: (id: string) => void;
  onGoToCancel: () => void;
  keptLeak: number;
}) {
  return (
    <>
      <ScreenHeader
        number="2"
        eyebrow="CHANGES, ISSUES, UNUSED"
        title="Only what deserves your attention"
        copy="The list screen is the whole book. This page is the part that should change what she does. The full year stays visible so flags are not mistaken for her entire financial life."
      />
      <section className="issue-metrics">
        <Metric value={formatINR(total)} label="Everything on the list screen, this year." />
        <Metric
          value={formatINR(leakage)}
          label={
            keptLeak > 0
              ? `Still leaving for things she does not use. ${formatINR(keptLeak)} of it is on rows she chose to keep, so it is accepted, not stopped.`
              : "Still leaving for the gym, Canva, FitApp, and the caller tune."
          }
          accent
        />
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
            className="issue-row"
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
        {allItems.some((item) => item.signals.includes("new")) &&
          ` ${allItems
            .filter((item) => item.signals.includes("new"))
            .map((item) => item.merchant)
            .join(", ")} was just detected. Nothing is wrong with it, so it is not listed here. `}
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
  kept,
  onConfirm,
  onKeep,
  onFlagAgain
}: {
  items: Commitment[];
  allItems: Commitment[];
  revoked: string[];
  kept: string[];
  onConfirm: (id: string) => void;
  onKeep: (id: string) => void;
  onFlagAgain: (id: string) => void;
}) {
  const stoppedRows = allItems.filter((item) => revoked.includes(item.id));
  const saved = stoppedRows.reduce((sum, item) => sum + item.annualCost, 0);

  return (
    <>
      <ScreenHeader
        number="3"
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
          const isKept = kept.includes(item.id);
          const isIssue = ["unused", "silent", "trial"].includes(item.kind) && !isKept;
          return (
            <article
              className={`path-card ${isIssue ? "issue" : ""} ${isKept ? "kept" : ""} ${item.signals.includes("new") ? "is-new" : ""}`}
              data-row={item.id}
              key={item.id}
            >
              <div className="path-name">
                <strong>{item.merchant}</strong>
                <span>{monthlyCost(item)}</span>
                <small className="path-mode">{modeLabel(item)}</small>
                <small className="path-spent">
                  Since {formatDate(item.startedOn)} · {formatINR(item.spentToDate)} taken
                </small>
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
                {isKept && (
                  <p className="kept-note">
                    Kept. The warning is settled and the mandate stays <strong>Active</strong>, so the year is
                    unchanged.{" "}
                    <button onClick={() => onFlagAgain(item.id)}>Flag it again</button>
                  </p>
                )}
              </div>
              <div className="path-action">
                {item.cancelMode === "block" ? (
                  <span className="no-action">No revoke control</span>
                ) : (
                  <>
                    {isIssue && (
                      <button className="keep-button" onClick={() => onKeep(item.id)}>
                        Keep it
                      </button>
                    )}
                    <button className="danger-button" onClick={() => onConfirm(item.id)}>
                      {item.cancelMode === "normal" ? "Cancel the autopay" : "Mark it handled"} <i>→</i>
                    </button>
                    <small>
                      {item.cancelMode === "normal"
                        ? `Cancelling drops the year by ${formatINR(item.annualCost)}.`
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
          <Fact label="Paying since" value={formatDate(item.startedOn)} />
          <Fact label="Spent so far" value={formatINR(item.spentToDate)} />
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
  if (item.kind === "unused") return "UNUSED · STILL CHARGING";
  if (item.kind === "silent") return "PRICE ROSE · NO NOTICE";
  if (item.kind === "trial") return "TRIAL BECAME PAID";
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
