"use client";

import { useEffect, useRef, useState } from "react";
import { runOfflineChallenge, type ChallengeAction, type ChallengeResult } from "@/lib/challenge";
import { formatINR } from "@/lib/format";
import type { Commitment, Dataset } from "@/lib/types";

export function FindingChallenge({ item, dataset, live, initiallyOpen = false }: { item: Commitment; dataset: Dataset; live: boolean; initiallyOpen?: boolean }) {
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const hasIncrease = item.previousAmount !== undefined && item.amount > item.previousAmount;
  async function challenge(action: ChallengeAction) {
    setPending(true); setError(""); setResult(null);
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    try {
      if (live) {
        const response = await fetch("/api/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commitmentId: item.id, action, merchantName: action === "merchant_correction" ? merchantName : undefined }), signal: abort.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "The graph could not evaluate this challenge.");
        setResult(body as ChallengeResult);
      } else setResult(runOfflineChallenge(dataset, item, action, merchantName));
    } catch (failure) {
      if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "The challenge could not be evaluated.");
    } finally { if (!abort.signal.aborted) setPending(false); }
  }
  return <details className="finding-challenge" open={initiallyOpen || undefined}><summary>Challenge this finding</summary>
    <p className="challenge-demo-label">SYNTHETIC EVIDENCE LAB · NO SAVED CHANGES</p>
    <p>Test one alternative explanation at a time. Each test starts from the original records and reruns the detector. Your payment decisions and the original dataset stay unchanged.</p>
    <div className="challenge-actions">
      <button disabled={pending || !hasIncrease} onClick={() => challenge("matching_notice")}>Add a matching price notice</button>
      <button disabled={pending || !hasIncrease} onClick={() => challenge("old_notice")}>Add an unrelated old notice</button>
      <button disabled={pending || !item.inDictionary} onClick={() => challenge("recent_usage")}>Confirm recent usage</button>
      <button disabled={pending} onClick={() => challenge("descriptor_change")}>Change bank references</button>
    </div>
    {!hasIncrease && <p className="challenge-hint">Price-notice tests are available on payments with a recorded increase.</p>}
    {!item.inDictionary && <div className="challenge-merchant"><label htmlFor={`challenge-name-${item.id}`}>Hypothetical merchant name</label><input id={`challenge-name-${item.id}`} value={merchantName} maxLength={60} onChange={(event) => setMerchantName(event.target.value)} placeholder="For example, Demo Services" /><button disabled={pending || merchantName.trim().length < 2} onClick={() => challenge("merchant_correction")}>Test merchant correction</button><p>This tests a user-supplied label; it does not verify the merchant or its cancellation instructions.</p></div>}
    {pending && <p role="status">Evaluating the changed evidence…</p>}
    {error && <p role="alert" className="challenge-error">{error} No substitute result was generated.</p>}
    {result && <div className="challenge-result" role="status">
      <h3>What changed?</h3><ul>{result.changes.map((change) => <li key={change}>{change}</li>)}</ul>
      <div className="challenge-comparison"><Verdict title="Original evidence" items={[result.before]} /><Verdict title="After this test" items={result.after} /></div>
      <p>{result.engine === "neo4j" ? "Calculated in Neo4j. The transaction rolled back; the stored graph is unchanged." : "Calculated by the offline detector against a temporary copy of the synthetic records."}</p>
      <button onClick={() => { setResult(null); setError(""); setMerchantName(""); }}>Reset challenge</button>
    </div>}
  </details>;
}

function Verdict({ title, items }: { title: string; items: Commitment[] }) {
  const ids = new Set(items.flatMap((item) => item.evidenceRows.map((row) => row.txnId)));
  const silent = items.some((item) => item.signals.includes("silent_hike"));
  const announced = items.some((item) => item.hasPriceChangeNotice && item.previousAmount !== undefined && item.amount > item.previousAmount);
  const unused = items.some((item) => item.signals.includes("zombie"));
  return <section className="challenge-verdict"><h4>{title}</h4><p>{items.length === 0 ? "No recurring payment detected from these charges." : `${items.length} recurring ${items.length === 1 ? "payment" : "payments"} · ${ids.size} original charges grouped`}</p>
    {items.length > 0 && <ul><li>{silent ? "Price increase: no matching notice found" : announced ? "Price increase: matching notice found" : "No unannounced price increase flagged"}</li><li>{unused ? "Unused-service warning remains" : "No unused-service warning"}</li>{items.some((item) => item.signals.includes("trial_converted")) && <li>Trial-to-paid finding remains</li>}{items.some((item) => item.signals.includes("new")) && <li>New payment permission remains</li>}<li>{items.every((item) => item.inDictionary) ? "Merchant recognised by the reference list" : "Merchant still needs identification"}</li><li>Yearly estimate: {formatINR(items.reduce((sum, item) => sum + item.annualCost, 0))}</li></ul>}
    <p>These outcomes describe the supplied evidence, not confirmation from a bank or service.</p>
  </section>;
}
