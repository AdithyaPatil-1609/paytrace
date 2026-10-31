/**
 * App shell only: top bar, side nav, which screen is open — Screen 00 (the
 * evidence graph) first, then the four product screens.
 * Screen UIs live in components/screens/. Detail drawer in components/detail/.
 */
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DetailPanel } from "@/components/detail/detail-panel";
import {
  AllPaymentsScreen,
  AnnualScreen,
  CancelPathsScreen,
  EvidenceGraphScreen,
  IssuesScreen
} from "@/components/screens";
import { withSimulatedAutopay } from "@/data/simulation";
import type { SourceInfo } from "@/db/neo4j/dataset";
import type { GraphFacts } from "@/db/neo4j/graph";
import { hikeAmount, isSilentPriceHike, issueItems, keptLeakTotal, yearlyTotal } from "@/lib/analysis";
import { downloadCommitmentsCsv } from "@/lib/commitment-ui";
import { detectCommitments } from "@/lib/engine";
import type { Commitment, Dataset } from "@/lib/types";

type DashboardProps = { dataset: Dataset; source: SourceInfo; commitments?: Commitment[]; graph?: GraphFacts };
type Screen = "graph" | "annual" | "list" | "issues" | "paths";

const graphScreen: { id: Screen; number: string; label: string } = { id: "graph", number: "00", label: "How it works" };

const screens: { id: Screen; number: string; label: string }[] = [
  { id: "annual", number: "04", label: "Spending" },
  { id: "list", number: "01", label: "All payments" },
  { id: "issues", number: "02", label: "Save money" },
  { id: "paths", number: "03", label: "Stop a payment" }
];

export function Dashboard({ dataset, source, commitments, graph }: DashboardProps) {
  const live = Boolean(commitments && commitments.length > 0);
  const [screen, setScreen] = useState<Screen>("annual");
  const [simulated, setSimulated] = useState(false);
  // Live Simulate: the rows Cypher returned inside a rolled-back transaction.
  const [liveSimulation, setLiveSimulation] = useState<Commitment[] | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [revoked, setRevoked] = useState<string[]>([]);
  const [kept, setKept] = useState<string[]>([]);
  const [handled, setHandled] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  // Live: Neo4j decides every row, Simulate included. The TypeScript engine
  // only runs on the offline fixture, or if the graph cannot simulate.
  const detected = useMemo(() => {
    if (live && !simulated) return commitments!;
    if (live && liveSimulation) return liveSimulation;
    return detectCommitments(simulated ? withSimulatedAutopay(dataset) : dataset);
  }, [dataset, simulated, commitments, live, liveSimulation]);

  // The rows before Simulate: their total drives the before-and-after
  // reading, and their ids tell Reset what the simulation added.
  const baseDetected = useMemo(
    () => (live ? commitments! : detectCommitments(dataset)),
    [dataset, commitments, live]
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
  const openItem = active.find((item) => item.id === openId) ?? null;

  async function simulate() {
    if (live) {
      setSimulating(true);
      try {
        const response = await fetch("/api/simulate", { method: "POST" });
        if (response.ok) {
          const body = (await response.json()) as { commitments: Commitment[] };
          setLiveSimulation(body.commitments);
        }
      } catch {
        // The fixture path below still answers; the card says which ran.
      } finally {
        setSimulating(false);
      }
    }
    setSimulated(true);
  }

  function resetSimulation() {
    setSimulated(false);
    setLiveSimulation(null);
    // Forget any decision taken on a row that only the simulation created.
    const baseIds = new Set(baseDetected.map((item) => item.id));
    setRevoked((current) => current.filter((id) => baseIds.has(id)));
    setKept((current) => current.filter((id) => baseIds.has(id)));
    setHandled((current) => current.filter((id) => baseIds.has(id)));
  }

  function confirmRevoke(id: string) {
    if (detected.find((item) => item.id === id)?.cancelMode !== "normal") return;
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
          <div className="bar-actions">
            <Button variant="outline" className="export-csv" onClick={() => downloadCommitmentsCsv(active)}>
              ↓ Export CSV
            </Button>
            <div className="persona">
              <b>P</b>
              <span>Priya</span>
            </div>
          </div>
        </header>
      </div>

      <div className="app-layout">
        <aside className="side-nav">
          <p>YOUR MONEY</p>
          {screens.map((item) => (
            <button
              key={item.id}
              className={screen === item.id ? "active" : ""}
              onClick={() => setScreen(item.id)}
              aria-current={screen === item.id ? "page" : undefined}
            >
              {item.label}
            </button>
          ))}
          <div className="side-note">
            <strong>You’re in control</strong>
            <span>Complete payment changes with your service or bank.</span>
          </div>
        </aside>

        <section className="main-stage">
          <nav className="mobile-nav" aria-label="Main navigation">
            {[...screens, graphScreen].map((item) => (
              <button
                className={screen === item.id ? "active" : ""}
                onClick={() => setScreen(item.id)}
                key={item.id}
                aria-current={screen === item.id ? "page" : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {screen === "graph" && (
            <EvidenceGraphScreen
              graph={graph}
              source={source}
              onContinue={() => setScreen("list")}
              onReview={() => setScreen("issues")}
            />
          )}
          {screen === "list" && (
            <AllPaymentsScreen
              items={active}
              total={total}
              baseline={baseline}
              simulated={simulated}
              simulating={simulating}
              simulatedIn={simulated ? (live && liveSimulation ? "neo4j" : "app") : undefined}
              onSimulate={simulate}
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
              keptLeak={keptLeak}
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
              handled={handled}
              onConfirm={confirmRevoke}
              onKeep={keepIt}
              onFlagAgain={flagAgain}
              onHandle={(id) => setHandled((current) => current.includes(id) ? current : [...current, id])}
              onRestore={(id) => setRevoked((current) => current.filter((entry) => entry !== id))}
            />
          )}
          {screen === "annual" && (
            <AnnualScreen
              items={active}
              total={total}
              leakage={leakage}
              stoppedValue={stoppedValue}
              asOf={dataset.asOf}
              onOpen={setOpenId}
              onGoToSavings={() => setScreen("issues")}
            />
          )}
        </section>
      </div>

      {openItem && (
        <DetailPanel item={openItem} asOf={dataset.asOf} onClose={() => setOpenId(null)} />
      )}
    </main>
  );
}
