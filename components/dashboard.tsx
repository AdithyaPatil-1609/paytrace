/**
 * App shell only: top bar, side nav, which of the four screens is open.
 * Screen UIs live in components/screens/. Detail drawer in components/detail/.
 */
"use client";

import { useMemo, useState } from "react";
import { EvidenceStrip } from "@/components/chrome/evidence-strip";
import { DetailPanel } from "@/components/detail/detail-panel";
import {
  AllPaymentsScreen,
  AnnualScreen,
  CancelPathsScreen,
  IssuesScreen
} from "@/components/screens";
import { withSimulatedAutopay } from "@/data/simulation";
import type { SourceInfo } from "@/db/neo4j/dataset";
import { hikeAmount, isSilentPriceHike, issueItems, yearlyTotal } from "@/lib/analysis";
import { downloadCommitmentsCsv } from "@/lib/commitment-ui";
import { detectCommitments } from "@/lib/engine";
import type { Commitment, Dataset } from "@/lib/types";

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

  const baseline = useMemo(
    () => yearlyTotal(commitments && commitments.length > 0 ? commitments : detectCommitments(dataset)),
    [dataset, commitments]
  );
  const active = detected.filter((item) => !revoked.includes(item.id));
  const total = yearlyTotal(active);
  const fullYear = yearlyTotal(detected);
  const stoppedValue = fullYear - total;
  const issues = issueItems(active);
  const leakage = yearlyTotal(active.filter((item) => item.kind === "unused"));
  const hike = active.filter(isSilentPriceHike).reduce((sum, item) => sum + hikeAmount(item), 0);
  const debt = yearlyTotal(active.filter((item) => item.bucket === "debt"));
  const openItem = active.find((item) => item.id === openId) ?? null;

  function resetSimulation() {
    setSimulated(false);
    setRevoked((current) => current.filter((id) => id !== "headspace-plus"));
  }

  function confirmRevoke(id: string) {
    setRevoked((current) => (current.includes(id) ? current : [...current, id]));
    setKept((current) => current.filter((entry) => entry !== id));
  }

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
            <button className="export-csv" onClick={() => downloadCommitmentsCsv(active)}>
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

          {screen === "list" && (
            <AllPaymentsScreen
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
            <IssuesScreen
              items={issues}
              allItems={active}
              total={total}
              leakage={leakage}
              hike={hike}
              onOpen={setOpenId}
              onGoToCancel={() => setScreen("paths")}
            />
          )}
          {screen === "paths" && (
            <CancelPathsScreen
              items={active}
              allItems={detected}
              revoked={revoked}
              kept={kept}
              onConfirm={confirmRevoke}
              onKeep={keepIt}
              onFlagAgain={flagAgain}
            />
          )}
          {screen === "annual" && (
            <AnnualScreen
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
        </section>
      </div>

      {openItem && (
        <DetailPanel item={openItem} asOf={dataset.asOf} source={source} onClose={() => setOpenId(null)} />
      )}
    </main>
  );
}
