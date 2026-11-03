"use client";

import { useEffect, useRef, useState } from "react";
import {
  runOfflineChallenge,
  type ChallengeAction,
  type ChallengeResult
} from "@/lib/scenarios/challenge";
import { challengeChoices, challengeTakeaway } from "@/lib/scenarios/challenge-ui";
import { formatINR } from "@/lib/presentation/format";
import type { Commitment, Dataset } from "@/lib/payments/types";

export function FindingChallenge({
  item,
  dataset,
  live,
  initiallyOpen = false
}: {
  item: Commitment;
  dataset: Dataset;
  live: boolean;
  initiallyOpen?: boolean;
}) {
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [scenario, setScenario] = useState<ChallengeAction>("matching_notice");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const choices = challengeChoices(item);
  async function challenge(action: ChallengeAction) {
    setPending(true);
    setError("");
    setResult(null);
    setScenario(action);
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    let timedOut = false;
    const timeout = live
      ? setTimeout(() => {
          timedOut = true;
          abort.abort();
        }, 20000)
      : undefined;
    try {
      if (live) {
        const response = await fetch("/api/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commitmentId: item.id,
            action,
            merchantName: action === "merchant_correction" ? merchantName : undefined
          }),
          signal: abort.signal
        });
        const body = await response.json();
        if (!response.ok) throw new Error("We couldn't check this scenario. Please try again.");
        if (!abort.signal.aborted) setResult(body as ChallengeResult);
      } else setResult(runOfflineChallenge(dataset, item, action, merchantName));
    } catch (failure) {
      if (timedOut) setError("This is taking too long. Please try again.");
      else if (!abort.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "We couldn't check this scenario. Please try again."
        );
    } finally {
      clearTimeout(timeout);
      if (!abort.signal.aborted || timedOut) setPending(false);
    }
  }
  if (!choices.available) return null;
  return (
    <details className="finding-challenge" open={initiallyOpen || undefined}>
      <summary>Could this finding change?</summary>
      <p className="challenge-demo-label">WHAT-IF DEMO</p>
      <p>Try a different scenario and see the result. This is a preview; nothing is saved.</p>
      <div className="challenge-actions">
        {choices.price && (
          <button disabled={pending} onClick={() => challenge("matching_notice")}>
            What if I received a price notice?
          </button>
        )}
        {choices.usage && (
          <button disabled={pending} onClick={() => challenge("recent_usage")}>
            What if I still use this service?
          </button>
        )}
      </div>
      {choices.merchant && (
        <div className="challenge-merchant">
          <label htmlFor={`challenge-name-${item.id}`}>
            What if I knew who this payment was for?
          </label>
          <input
            id={`challenge-name-${item.id}`}
            value={merchantName}
            maxLength={60}
            onChange={(event) => setMerchantName(event.target.value)}
            placeholder="Enter an example merchant name"
          />
          <button
            disabled={pending || merchantName.trim().length < 2}
            onClick={() => challenge("merchant_correction")}
          >
            Preview with this name
          </button>
          <p>An example name does not verify the company or its cancellation steps.</p>
        </div>
      )}
      <details className="challenge-advanced">
        <summary>More demo checks</summary>
        <div className="challenge-actions">
          {choices.price && (
            <button disabled={pending} onClick={() => challenge("old_notice")}>
              What if the notice was for an older price?
            </button>
          )}
          <button disabled={pending} onClick={() => challenge("descriptor_change")}>
            What if the bank description changed?
          </button>
        </div>
      </details>
      {pending && <p role="status">Checking this scenario…</p>}
      {error && (
        <p role="alert" className="challenge-error">
          {error}
        </p>
      )}
      {result && (
        <div className="challenge-result" role="status">
          <h3>{challengeTakeaway(result, scenario)}</h3>
          <p>
            {result.after.reduce((sum, entry) => sum + entry.annualCost, 0) ===
            result.before.annualCost
              ? "Yearly estimate stays "
              : "Yearly estimate would be "}
            <strong>
              {formatINR(result.after.reduce((sum, entry) => sum + entry.annualCost, 0))}
            </strong>
          </p>
          <details className="challenge-advanced">
            <summary>How this result was checked</summary>
            <ul>
              {result.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
            <div className="challenge-comparison">
              <Verdict title="Original evidence" items={[result.before]} />
              <Verdict title="After this test" items={result.after} />
            </div>
            <p>
              {result.engine === "neo4j"
                ? "Calculated in Neo4j. The transaction rolled back; the stored graph is unchanged."
                : "Calculated by the offline detector against a temporary copy of the synthetic records."}
            </p>
          </details>
          <button
            onClick={() => {
              setResult(null);
              setError("");
              setMerchantName("");
            }}
          >
            Clear preview
          </button>
        </div>
      )}
    </details>
  );
}

function Verdict({ title, items }: { title: string; items: Commitment[] }) {
  const ids = new Set(items.flatMap((item) => item.evidenceRows.map((row) => row.txnId)));
  const silent = items.some((item) => item.signals.includes("silent_hike"));
  const announced = items.some(
    (item) =>
      item.hasPriceChangeNotice &&
      item.previousAmount !== undefined &&
      item.amount > item.previousAmount
  );
  const unused = items.some((item) => item.signals.includes("zombie"));
  return (
    <section className="challenge-verdict">
      <h4>{title}</h4>
      <p>
        {items.length === 0
          ? "No recurring payment detected from these charges."
          : `${items.length} recurring ${items.length === 1 ? "payment" : "payments"} · ${ids.size} original charges grouped`}
      </p>
      {items.length > 0 && (
        <ul>
          <li>
            {silent
              ? "Price increase: no matching notice found"
              : announced
                ? "Price increase: matching notice found"
                : "No unannounced price increase flagged"}
          </li>
          <li>{unused ? "Unused-service warning remains" : "No unused-service warning"}</li>
          {items.some((item) => item.signals.includes("trial_converted")) && (
            <li>Trial-to-paid finding remains</li>
          )}
          {items.some((item) => item.signals.includes("new")) && (
            <li>New payment permission remains</li>
          )}
          <li>
            {items.every((item) => item.inDictionary)
              ? "Merchant recognised by the reference list"
              : "Merchant still needs identification"}
          </li>
          <li>
            Yearly estimate: {formatINR(items.reduce((sum, item) => sum + item.annualCost, 0))}
          </li>
        </ul>
      )}
      <p>These outcomes describe the supplied evidence, not confirmation from a bank or service.</p>
    </section>
  );
}
