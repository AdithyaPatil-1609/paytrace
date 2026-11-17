/**
 * App shell only: top bar, side nav, which screen is open — payments first,
 * then issues, cancellation, annual spending and the supporting evidence graph.
 * Screen UIs live in components/screens/. Detail drawer in components/detail/.
 */
"use client";

import { useState, type ReactNode } from "react";
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
import { usePaymentReview } from "./hooks/use-payment-review";
import { downloadCommitmentsCsv } from "@/lib/presentation/commitment-ui";
import type { Commitment, Dataset } from "@/lib/payments/types";

type DashboardProps = {
  dataset: Dataset;
  source: SourceInfo;
  commitments?: Commitment[];
  graph?: GraphFacts;
  account?: { name: string; controls: ReactNode; notice?: ReactNode; activity?: ReactNode };
};
type Screen = "graph" | "annual" | "list" | "issues" | "paths";

const screens: { id: Screen; number: string; label: string }[] = [
  { id: "list", number: "01", label: "All payments" },
  { id: "issues", number: "02", label: "Issues" },
  { id: "paths", number: "03", label: "Cancel paths" },
  { id: "annual", number: "04", label: "Annual" },
  { id: "graph", number: "05", label: "Evidence graph" }
];

export function Dashboard({ dataset, source, commitments, graph, account }: DashboardProps) {
  const [screen, setScreen] = useState<Screen>("list");
  const [openId, setOpenId] = useState<string | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  function openPayment(id: string) {
    setChallengeOpen(false);
    setOpenId(id);
  }
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  const {
    live,
    simulated,
    simulating,
    liveSimulation,
    revoked,
    kept,
    detected,
    active,
    baseline,
    total,
    stoppedValue,
    leakage,
    debt,
    simulate,
    resetSimulation,
    confirmRevoke,
    keepIt,
    flagAgain
  } = usePaymentReview(dataset, commitments, !account);
  const openItem = active.find((item) => item.id === openId) ?? null;

  return (
    <main className={`paytrace-shell${account ? " personal-shell" : ""}`}>
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
            {account ? "Private Neo4j" : source.kind === "neo4j" ? "Reading Neo4j" : "Reading CSV statements"}
          </span>
          <div className="bar-actions">
            {!account && <a className="account-link" href="/account">Personal account</a>}
            {!account && <button
              className="simulate-button"
              onClick={
                simulated
                  ? resetSimulation
                  : () => {
                      setScreen("list");
                      void simulate();
                    }
              }
              disabled={simulating}
              aria-busy={simulating}
              title={
                simulated
                  ? "Remove the simulated autopay"
                  : "Add a synthetic autopay and rerun detection"
              }
            >
              {simulating
                ? "Simulating…"
                : simulated
                  ? "Reset simulation"
                  : "Simulate a new Autopay"}
            </button>}
            <button className="export-csv" onClick={() => downloadCommitmentsCsv(active)}>
              ↓ Export CSV
            </button>
            {account ? account.controls : <div className="persona">
              <b>PD</b>
              <span>Priya</span>
            </div>}
          </div>
        </header>
        <EvidenceStrip source={source} />
        {account?.notice}
        {simulated && (
          <p className="simulation-status" role="status">
            Synthetic demo: Headspace autopay added ·{" "}
            {live && liveSimulation
              ? "Neo4j simulation; stored records unchanged."
              : "Offline simulation using a temporary copy of the records."}
          </p>
        )}
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
            <span>
              Follow the steps in your payment app or with your provider. Mark the payment handled
              here once complete.
            </span>
          </div>
        </aside>

        <section className="main-stage">
          {screen === "graph" && (
            <EvidenceGraphScreen
              graph={graph}
              source={source}
              items={active}
              dictionary={dataset.dictionary}
              recordsLive={Boolean(account && source.kind === "neo4j") || (live && (!simulated || Boolean(liveSimulation)))}
              onOpen={openPayment}
              onContinue={() => setScreen("list")}
            />
          )}
          {screen === "list" && (
            <><AllPaymentsScreen
              items={active}
              total={total}
              baseline={baseline}
              simulated={simulated}
              onOpen={openPayment}
              asOf={dataset.asOf}
              personal={Boolean(account)}
            />{account?.activity}</>
          )}
          {screen === "issues" && (
            <IssuesScreen
              allItems={active}
              kept={kept}
              onOpen={openPayment}
              onChallenge={(id) => {
                setChallengeOpen(true);
                setOpenId(id);
              }}
              onGoToCancel={(id) => {
                setCancelTarget(id);
                setScreen("paths");
              }}
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
              personal={Boolean(account)}
            />
          )}
        </section>
      </div>

      {openItem && (
        <DetailPanel
          key={openItem.id}
          item={openItem}
          asOf={dataset.asOf}
          source={source}
          dataset={simulated ? withSimulatedAutopay(dataset) : dataset}
          challengeLive={!account && live && !simulated}
          challengeInitiallyOpen={challengeOpen}
          onClose={() => setOpenId(null)}
        />
      )}
    </main>
  );
}
