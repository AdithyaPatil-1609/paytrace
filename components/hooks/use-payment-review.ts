import { useMemo, useState } from "react";
import { withSimulatedAutopay } from "@/data/simulation";
import { detectCommitments } from "@/lib/payments/engine";
import { yearlyTotal } from "@/lib/payments/analysis";
import type { Commitment, Dataset } from "@/lib/payments/types";

export function usePaymentReview(dataset: Dataset, commitments?: Commitment[]) {
  const live = Boolean(commitments?.length);
  const [simulated, setSimulated] = useState(false);
  // Live Simulate: the rows Cypher returned inside a rolled-back transaction.
  const [liveSimulation, setLiveSimulation] = useState<Commitment[] | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [revoked, setRevoked] = useState<string[]>([]);
  const [kept, setKept] = useState<string[]>([]);
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

  async function simulate() {
    if (simulating || simulated) return;
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

  return {
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
  };
}
