/**
 * App shell only: top bar, side nav, which screen is open — payments first,
 * then issues, cancellation, annual spending and the supporting evidence graph.
 * Screen UIs live in components/screens/. Detail drawer in components/detail/.
 */
"use client";

import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
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
};
type Screen = "graph" | "annual" | "list" | "issues" | "paths";

const screens: { id: Screen; number: string; label: string }[] = [
  { id: "list", number: "01", label: "All payments" },
  { id: "issues", number: "02", label: "Issues" },
  { id: "paths", number: "03", label: "Cancel paths" },
  { id: "annual", number: "04", label: "Annual" },
  { id: "graph", number: "05", label: "Evidence graph" }
];

export function Dashboard({ dataset, source, commitments, graph }: DashboardProps) {
  const [screen, setScreen] = useState<Screen>("list");
  const [openId, setOpenId] = useState<string | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const reduceMotion = useReducedMotion();
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
  } = usePaymentReview(dataset, commitments);
  const openItem = active.find((item) => item.id === openId) ?? null;

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
          <LayoutGroup id="paytrace-sidebar">
            {screens.map((item) => (
              <button
                key={item.id}
                className={screen === item.id ? "active" : ""}
                aria-current={screen === item.id ? "page" : undefined}
                onClick={() => setScreen(item.id)}
              >
                {screen === item.id && (
                  <motion.span
                    className="motion-active-rail"
                    layoutId="paytrace-active-rail"
                    aria-hidden="true"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 460, damping: 38 }
                    }
                  />
                )}
                <span>{item.number}</span>
                {item.label}
              </button>
            ))}
          </LayoutGroup>
          <div className="side-note">
            <strong>Cancellation guidance</strong>
            <span>
              Follow the steps in your payment app or with your provider. Mark the payment handled
              here once complete.
            </span>
          </div>
        </aside>

        <section className="main-stage">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={screen}
              className="motion-screen"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.14, ease: "easeOut" }}
            >
          {screen === "graph" && (
            <EvidenceGraphScreen
              graph={graph}
              source={source}
              items={active}
              dictionary={dataset.dictionary}
              recordsLive={live && (!simulated || Boolean(liveSimulation))}
              onOpen={openPayment}
              onContinue={() => setScreen("list")}
            />
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
            />
          )}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>

      <AnimatePresence>
        {openItem && (
        <DetailPanel
          key={openItem.id}
          item={openItem}
          asOf={dataset.asOf}
          source={source}
          dataset={simulated ? withSimulatedAutopay(dataset) : dataset}
          challengeLive={live && !simulated}
          challengeInitiallyOpen={challengeOpen}
          onClose={() => setOpenId(null)}
        />
      )}
      </AnimatePresence>
    </main>
  );
}
