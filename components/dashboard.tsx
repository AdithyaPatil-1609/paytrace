/**
 * App shell only: top bar, side nav, which screen is open — payments first,
 * then issues, cancellation, annual spending and the supporting evidence graph.
 * Screen UIs live in components/screens/. Detail drawer in components/detail/.
 */
"use client";

import { useMemo, useState } from "react";
import { MobileNavigation } from "@/components/chrome/mobile-navigation";
import { EvidenceStrip } from "@/components/chrome/evidence-strip";
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
import { yearlyTotal } from "@/lib/analysis";
import { downloadCommitmentsCsv } from "@/lib/commitment-ui";
import { detectCommitments } from "@/lib/engine";
import type { Commitment, Dataset } from "@/lib/types";

type DashboardProps = { dataset: Dataset; source: SourceInfo; commitments?: Commitment[]; graph?: GraphFacts };
type Screen = "graph" | "annual" | "list" | "issues" | "paths";

const screens: { id: Screen; number: string; label: string }[] = [
  { id: "list", number: "01", label: "All payments" },
  { id: "issues", number: "02", label: "Issues" },
  { id: "paths", number: "03", label: "Cancel paths" },
  { id: "annual", number: "04", label: "Annual" },
  { id: "graph", number: "05", label: "Evidence graph" }
];

export function Dashboard({ dataset, source, commitments, graph }: DashboardProps) {
  const live = Boolean(commitments && commitments.length > 0);
  const [screen, setScreen] = useState<Screen>("list");
  const [simulated, setSimulated] = useState(false);
  // Live Simulate: the rows Cypher returned inside a rolled-back transaction.
  const [liveSimulation, setLiveSimulation] = useState<Commitment[] | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [revoked, setRevoked] = useState<string[]>([]);
  const [kept, setKept] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  function openPayment(id: string) { setChallengeOpen(false); setOpenId(id); }
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

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
  const leakage = yearlyTotal(active.filter((item) => item.kind === "unused"));
  const debt = yearlyTotal(active.filter((item) => item.bucket === "debt"));
  const openItem = active.find((item) => item.id === openId) ?? null;

  async function simulate() {
    if (simulating || simulated) return;
    setScreen("list");
    if (live) {
      setSimulating(true);
      try {
        const response = await fetch("/api/simulate", { method: "POST" });
        if (response.ok) {
          const body = (await response.json()) as { commitments: Commitment[] };
          setLiveSimulation(body.commitments);
        }
      } catch {
        // The fixture path below still answers; the status says which ran.
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
          <MobileNavigation screens={screens} current={screen} onSelect={setScreen} />
          <div className="wordmark">
            <span>p</span>paytrace
          </div>
          <p>
            PAYMENTS <i>·</i> INSIGHTS <i>·</i> CONTROL
          </p>
          <span className={source.kind === "neo4j" ? "source-badge live" : "source-badge"}>
            <i />
            {source.kind === "neo4j" ? "Reading Neo4j" : "Reading CSV statements"}
          </span>
          <div className="bar-actions">
            <button
              className="simulate-button"
              onClick={simulated ? resetSimulation : simulate}
              disabled={simulating}
              aria-busy={simulating}
              title={simulated ? "Remove the simulated autopay" : "Add a synthetic autopay and rerun detection"}
            >
              {simulating ? "Simulating…" : simulated ? "Reset simulation" : "Simulate a new Autopay"}
            </button>
            <button className="export-csv" onClick={() => downloadCommitmentsCsv(active)}>
              ↓ Export CSV
            </button>
            <div className="persona">
              <b>PD</b>
              <span>Priya</span>
            </div>
          </div>
        </header>
        <EvidenceStrip source={source} />
        {simulated && <p className="simulation-status" role="status">
          Synthetic demo: Headspace autopay added · {live && liveSimulation ? "Neo4j simulation; stored records unchanged." : "Offline simulation using a temporary copy of the records."}
        </p>}
      </div>

      <div className="app-layout">
        <aside className="side-nav">
          <p>YOUR PAYMENTS</p>
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
            <strong>Cancellation guidance</strong>
            <span>Follow the steps in your payment app or with your provider. Mark the payment handled here once complete.</span>
          </div>
        </aside>

        <section className="main-stage">
          {screen === "graph" && (
            <EvidenceGraphScreen graph={graph} source={source} items={active} dictionary={dataset.dictionary} recordsLive={live && (!simulated || Boolean(liveSimulation))} onOpen={openPayment} onContinue={() => setScreen("list")} />
          )}
          {screen === "list" && (
            <AllPaymentsScreen
              items={active}
              total={total}
              baseline={baseline}
              simulated={simulated}
              onOpen={openPayment}
              asOf={dataset.asOf}
            />
          )}
          {screen === "issues" && (
            <IssuesScreen
              allItems={active}
              kept={kept}
              onOpen={openPayment}
              onChallenge={(id) => { setChallengeOpen(true); setOpenId(id); }}
              onGoToCancel={(id) => { setCancelTarget(id); setScreen("paths"); }}
            />
          )}
          {screen === "paths" && (
            <CancelPathsScreen
              initialOpenId={cancelTarget}
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
              onOpen={openPayment}
            />
          )}
        </section>
      </div>

      {openItem && (
        <DetailPanel key={openItem.id} item={openItem} asOf={dataset.asOf} source={source} dataset={simulated ? withSimulatedAutopay(dataset) : dataset} challengeLive={live && !simulated} challengeInitiallyOpen={challengeOpen} onClose={() => setOpenId(null)} />
      )}
    </main>
  );
}
