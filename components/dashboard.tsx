/**
 * App shell only: top bar, side nav, which screen is open — payments first,
 * then issues, cancellation, annual spending and the supporting evidence graph.
 * Screen UIs live in components/screens/. Detail drawer in components/detail/.
 */
"use client";

import { PayTraceLogo } from "@/components/paytrace-logo";
import { useState, type ReactNode } from "react";
import { MobileNavigation } from "@/components/chrome/mobile-navigation";
import { ChromeHeight } from "@/components/chrome/chrome-height";
import { ProfileMenu } from "@/components/chrome/profile-menu";
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
import { AssistantWidget } from "@/components/assistant/assistant-widget";

type DashboardProps = {
  dataset: Dataset;
  source: SourceInfo;
  commitments?: Commitment[];
  graph?: GraphFacts;
  account?: { name: string; controls: ReactNode; notice?: ReactNode; activity?: ReactNode; subscriptionAlerts?: ReactNode; graphWarnings?: ReactNode };
  /** Demo only: a button shown in the top bar, left of the profile menu. */
  demoAction?: ReactNode;
};
type Screen = "graph" | "annual" | "list" | "issues" | "paths";

const screens: { id: Screen; number: string; label: string }[] = [
  { id: "list", number: "01", label: "All payments" },
  { id: "issues", number: "02", label: "Issues" },
  { id: "paths", number: "03", label: "Cancel paths" },
  { id: "annual", number: "04", label: "Annual" },
  { id: "graph", number: "05", label: "Evidence graph" }
];

export function Dashboard({ dataset, source, commitments, graph, account, demoAction }: DashboardProps) {
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
    confirmRevoke,
    keepIt,
    flagAgain
  } = usePaymentReview(dataset, commitments, !account);
  const openItem = active.find((item) => item.id === openId) ?? null;

  return (
    <main className={`paytrace-shell${account ? " personal-shell" : ""}`}>
      <ChromeHeight />
      <div className="product-chrome">
        <header className="product-bar">
          <MobileNavigation screens={screens} current={screen} onSelect={setScreen} />
          <div className="wordmark">
            <PayTraceLogo />
          </div>
          <span
            className={source.kind === "neo4j" ? "source-badge live" : "source-badge"}
            title={source.note}
          >
            <i />
            {account ? "Your data · private" : source.kind === "neo4j" ? "Live data" : "Sample data"}
          </span>
          <div className="bar-actions">
            {account && (
              <button className="export-csv" onClick={() => downloadCommitmentsCsv(active)}>
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                  <path d="M8 2v8m0 0L4.8 6.8M8 10l3.2-3.2M2.5 11.5v2h11v-2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Export CSV
              </button>
            )}
            {!account && demoAction}
            {account ? account.controls : <ProfileMenu />}
          </div>
        </header>
        {account?.notice}
      </div>

      <div className="app-layout">
        <aside className="side-nav">
          <p>Your payments</p>
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

        <section className={screen === "list" ? "main-stage is-ledger" : "main-stage"}>
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
              kept={kept}
              onOpen={openPayment}
              live={source.kind === "neo4j"}
              asOf={dataset.asOf}
              personal={Boolean(account)}
              subscriptionNotices={account?.subscriptionAlerts}
            /></>
          )}
          {screen === "issues" && (
            <>{account?.graphWarnings}<IssuesScreen
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
            /></>
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

      <AssistantWidget scope={account ? "account" : source.kind === "fixture" ? "demo-static" : "demo"} onOpen={openPayment} />

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
