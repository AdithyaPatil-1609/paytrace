"use client";
/**
 * Warnings from the person's own payment graph (Phase 4), shown on the Issues
 * screen. Each says what happened, why, how much money, which evidence, and
 * what to do next. Unknowns stay unknown: the person can add what only they
 * know (last real use, a cancellation), which becomes user-confirmed evidence.
 */
import { useCallback, useEffect, useState } from "react";
import { TrustBadge } from "@/components/personal-graph-panel";
import type { CancelWarning, Evidence, GraphWarnings, MandateWarning, PriceAheadWarning, PriceWarning, UnusedWarning, UpcomingWarning } from "@/db/neo4j/warnings";

const inr = (paise: number | null | undefined) =>
  paise == null ? "Amount unknown" : `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const PRICE_LABEL: Record<PriceWarning["classification"], string> = {
  NOTIFIED_PRICE_INCREASE: "Price rise, announced",
  POSSIBLE_SILENT_PRICE_INCREASE: "Possible silent price rise",
  INSUFFICIENT_EVIDENCE: "Price rise, notice unknown"
};
const PRICE_NEXT: Record<PriceWarning["classification"], string> = {
  NOTIFIED_PRICE_INCREASE: "Decide if it is still worth the new price. If not, use Cancel paths.",
  POSSIBLE_SILENT_PRICE_INCREASE: "Look for a price notice in the merchant's app or email. If there is none, ask the merchant why you were charged more.",
  INSUFFICIENT_EVIDENCE: "Check the merchant's app or email for a price notice."
};
const MANDATE_LABEL: Record<MandateWarning["kind"], string> = {
  LIMIT_EXCEEDED: "Debit above mandate limit",
  UPCOMING_OVER_LIMIT: "Upcoming debit above mandate limit",
  HIGH_LIMIT: "Mandate limit much higher than usual"
};
const CANCEL_LABEL: Record<CancelWarning["kind"], string> = {
  UNEXPECTED_AFTER_CANCELLATION: "Charged after cancellation",
  FINAL_BILLING: "Final bill after cancelling",
  UNCONFIRMED_CANCELLATION: "Cancellation not confirmed"
};

function EvidenceList({ items }: { items: Evidence[] }) {
  if (!items.length) return <small>Evidence: estimated from payment history; no message confirms it yet.</small>;
  const channels = new Set(items.filter((e) => ["sms", "email", "statement"].includes(e.source)).map((e) => e.source));
  return <small>Evidence: {items.map((e, i) => <span key={`${e.id}-${i}`}>{i ? "; " : ""}{e.source.toUpperCase()} {e.kind.replaceAll("_", " ")} · {e.date} <TrustBadge evidence={e}/></span>)}{channels.size >= 2 ? ` · confirmed by ${channels.size} channels` : ""}</small>;
}

function Row({ title, money, why, evidence, next, children }: { title: string; money: string; why: string; evidence: Evidence[]; next: string; children?: React.ReactNode }) {
  return <div>
    <span>
      <strong>{title}</strong>
      <small>{why}</small>
      <EvidenceList items={evidence}/>
      <small>What you can do: {next}</small>
      {children}
    </span>
    <strong>{money}</strong>
  </div>;
}

function Fact({ subscriptionId, onSaved }: { subscriptionId: string; onSaved: () => void }) {
  const [kind, setKind] = useState<"used" | "cancelled">("used");
  const [date, setDate] = useState("");
  const [state, setState] = useState("");
  async function save() {
    if (!date) return;
    setState("Saving…");
    const body = kind === "used" ? { subscriptionId, usedOn: date } : { subscriptionId, cancelRequestedOn: date, cancelEffectiveOn: date, cancelConfirmed: true };
    const response = await fetch("/api/account/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setState(response?.ok ? "Saved" : "Could not save; retry");
    if (response?.ok) onSaved();
  }
  return <small className="graph-fact">
    <select aria-label="What happened" value={kind} onChange={(e) => setKind(e.target.value as "used" | "cancelled")}>
      <option value="used">I last used it on</option>
      <option value="cancelled">I cancelled it on</option>
    </select>
    <input aria-label="Date" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)}/>
    <button type="button" className="link-button" disabled={!date} onClick={() => void save()}>Save</button>
    {state && <em role="status"> {state}</em>}
  </small>;
}

export function GraphWarningsPanel() {
  const [data, setData] = useState<GraphWarnings | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/account/warnings", { cache: "no-store" });
      if (!response.ok) throw Error();
      setData(await response.json()); setError("");
    } catch { setError("Warnings could not be loaded. Retry in a moment."); }
  }, []);
  useEffect(() => { const first = setTimeout(() => void load(), 0); return () => clearTimeout(first); }, [load]);

  if (error) return <section className="personal-activity"><p role="alert">{error}</p></section>;
  if (!data) return <section className="personal-activity"><p>Checking your payment graph…</p></section>;

  const unused = data.unused.filter((w) => w.status === "UNUSED");
  const unknownUsage = data.unused.filter((w) => w.status === "USAGE_UNAVAILABLE");
  const mandateViolations = data.mandate.filter((w) => w.violation);
  const mandateRisks = data.mandate.filter((w) => !w.violation);
  const count = data.price.length + data.priceAhead.length + data.mandate.length + unused.length + data.upcoming.length + data.cancellation.length;

  return <>
  {data.headsUp.length > 0 && <section className="heads-up" aria-label="Heads-up: before money leaves">
    <p className="account-eyebrow">HEADS-UP · BEFORE MONEY LEAVES</p>
    {data.headsUp.map((h) => <div key={h.id} className={`heads-up-item heads-up-${h.kind}`}>
      <strong>{h.title}</strong>
      <span>{h.body}</span>
    </div>)}
    <small>Your paired Android phone gets these as notifications too.</small>
  </section>}
  <details className="personal-activity graph-warnings" open>
    <summary>Warnings from your payment graph <small>{count} {count === 1 ? "warning" : "warnings"} · as of {data.asOf}</small></summary>
    <p>Found by Neo4j from your own payments and messages. Where Paytrace cannot see enough, it says so instead of guessing.</p>
    {data.incomplete && <p role="alert">A graph query failed this time, so some warnings may be missing. The Evidence graph screen shows which one.</p>}
    <div className="account-table">
      {data.cancellation.map((w: CancelWarning) => <Row key={`c-${w.payment.id}`} title={`${CANCEL_LABEL[w.kind]} · ${w.merchant}`} money={inr(w.payment.amountPaise)} why={w.why} evidence={[...w.cancellationEvidence, ...w.payment.evidence]} next={w.kind === "FINAL_BILLING" ? "Nothing, unless more charges follow." : w.kind === "UNCONFIRMED_CANCELLATION" ? "Ask the merchant to confirm the cancellation in writing." : "Revoke the mandate in your bank or UPI app, then ask the merchant or your bank for a refund."}/>)}
      {mandateViolations.map((w) => <Row key={`m-${w.kind}-${w.date}`} title={`${MANDATE_LABEL[w.kind]} · ${w.merchant}`} money={`${inr(w.amountPaise)} of ${inr(w.limitPaise)}`} why={w.why} evidence={w.evidence} next="Ask your bank to dispute the amount above the limit, and review the mandate."/>)}
      {data.priceAhead.map((w: PriceAheadWarning) => <Row key={`a-${w.subscriptionId}`} title={`Price rise coming · ${w.merchant}`} money={`${inr(w.currentPaise)} → ${inr(w.newPaise)} (+${w.pctChange}%)`} why={w.why} evidence={w.evidence} next={w.chargeOn ? `Not charged yet. If it is not worth the new price, cancel before ${w.chargeOn}: Cancel paths shows how.` : "Not charged yet. If it is not worth the new price, cancel before the next renewal."}/>)}
      {data.price.map((w) => <Row key={`p-${w.latest.id}`} title={`${PRICE_LABEL[w.classification]} · ${w.merchant}`} money={`+${inr(w.deltaPaise)} (+${w.pctChange}%)`} why={w.why} evidence={[...w.notices, ...w.previous.evidence, ...w.latest.evidence]} next={PRICE_NEXT[w.classification]}/>)}
      {data.upcoming.map((w: UpcomingWarning) => <Row key={`u-${w.merchant}-${w.expectedOn}`} title={`Debit ${w.daysRemaining === 0 ? "today" : `in ${w.daysRemaining} ${w.daysRemaining === 1 ? "day" : "days"}`} · ${w.merchant}`} money={inr(w.amountPaise)} why={`${w.why} ${w.confirmed ? "Date confirmed by a notice." : `Date estimated (${w.confidence} confidence, ${w.frequency}).`}`} evidence={w.evidence} next={w.daysRemaining === 0 ? "It may be taken today: keep enough in the account. If you no longer want it, cancel now and check the next statement." : `Keep enough in the account, or cancel before ${w.expectedOn} if you no longer want it.`}/>)}
      {mandateRisks.map((w) => <Row key={`r-${w.kind}-${w.merchant}-${w.date}`} title={`${MANDATE_LABEL[w.kind]} · ${w.merchant}`} money={`Limit ${inr(w.limitPaise)}`} why={w.why} evidence={w.evidence} next="Lower the mandate limit or revoke it in your bank or UPI app."/>)}
      {unused.map((w: UnusedWarning) => <Row key={`n-${w.subscriptionId}`} title={`Unused for ${w.daysSinceLastUsage} days · ${w.merchant}`} money={w.annualSavingsPaise == null ? inr(w.amountPaise) : `${inr(w.annualSavingsPaise)} a year`} why={w.why} evidence={[]} next="Cancel it if you no longer need it. Cancel paths shows how."/>)}
      {count === 0 && <div><span><strong>No warnings right now</strong><small>Your payment graph shows no price rises, limit problems, upcoming debits in the next 7 days or charges after cancelling.</small></span><strong>—</strong></div>}
    </div>
    {(unknownUsage.length > 0 || data.mandateUnknown.length > 0) && <>
      <p>Not enough evidence yet. Paytrace will not guess these:</p>
      <div className="account-table">
        {unknownUsage.map((w) => <Row key={`q-${w.subscriptionId}`} title={`Review subscription usage · ${w.merchant}`} money={`${inr(w.amountPaise)} ${w.frequency === "unknown" ? "" : w.frequency}`} why={w.why} evidence={[]} next="If you know, tell Paytrace when you last used it or when you cancelled it."><Fact subscriptionId={w.subscriptionId} onSaved={() => void load()}/></Row>)}
        {data.mandateUnknown.length > 0 && <div><span><strong>Mandate limit unknown</strong><small>{data.mandateUnknown.join(", ")}: no mandate message was found, so the most these merchants may debit is unknown.</small></span><strong>Unknown</strong></div>}
      </div>
    </>}
  </details>
  </>;
}
