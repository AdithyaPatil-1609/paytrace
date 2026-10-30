import type { ReactNode } from "react";
import type { SourceInfo } from "@/db/neo4j/dataset";
import type { GraphFacts } from "@/db/neo4j/graph";
import { formatDate, formatINR } from "@/lib/format";

/** Explain the connected evidence through familiar payments and messages. */
export function EvidenceGraphScreen({ graph, source, onContinue, onReview }: {
  graph?: GraphFacts;
  source: SourceInfo;
  onContinue: () => void;
  onReview: () => void;
}) {
  if (source.kind !== "neo4j" || !graph) {
    return (
      <>
        <header className="screen-header">
          <p>HOW IT WORKS</p>
          <h1>A clearer picture of your payments</h1>
          <div>Paytrace brings bank payments, messages and autopay permissions together to explain recurring charges.</div>
        </header>
        <section className="graph-offline">
          <h2>View your available payments</h2>
          <p>The connected payment data is unavailable, so this example cannot be shown right now.</p>
          <button className="primary-button" onClick={onContinue}>View payments →</button>
        </section>
      </>
    );
  }

  const focusHike = graph.focus
    ? graph.silentHikes.rows.find((row) => row.brand === graph.focus?.brand)
    : undefined;
  const unopenedPaid = graph.unopened.rows.reduce((sum, row) => sum + row.paid, 0);
  const hasFindings = graph.silentHikes.rows.length + graph.trials.rows.length + graph.unopened.rows.length > 0;

  return (
    <>
      <header className="screen-header">
        <p>HOW IT WORKS</p>
        <h1>Your payments, explained</h1>
        <div>
          Paytrace connects each payment to the service, its messages and its autopay permission.
          This helps you see what changed and what you may want to stop.
        </div>
      </header>
      <button className="primary-button graph-intro-action" onClick={onContinue}>View all payments →</button>

      {graph.focus && focusHike && (
        <section className="payment-story" aria-labelledby="payment-story-title">
          <header>
            <span>HOW A PRICE CHANGE IS FOUND</span>
            <h2 id="payment-story-title">Why we flagged {graph.focus.brand}</h2>
          </header>
          <ol className="payment-story-steps">
            <li>
              <span className="story-step">1</span>
              <h3>Check the payments</h3>
              <strong>{formatINR(focusHike.from)} → {formatINR(focusHike.to)}</strong>
              <p>{graph.focus.payments.length} recorded payments show the price went up on {formatDate(focusHike.since)}.</p>
            </li>
            <li>
              <span className="story-step">2</span>
              <h3>Check the messages</h3>
              <strong>No price-change notice found</strong>
              <p>We found {focusHike.messages} messages for {graph.focus.brand}, but none explained the increase.</p>
            </li>
            <li className="story-result">
              <span className="story-step">3</span>
              <h3>See what changed</h3>
              <strong>{formatINR(focusHike.to - focusHike.from)} more per charge</strong>
              <p>The price rose without a notice in the available messages. You can decide whether to keep paying.</p>
            </li>
          </ol>
          <p className="story-explanation">
            This brings different records about the same service together to tell one clear story.
          </p>
        </section>
      )}

      <h2 className="viz-heading">What we found</h2>
      <div className="graph-findings">
        <Finding title="Price increases without a notice" count={graph.silentHikes.rows.length} tone="ember">
          {graph.silentHikes.rows.map((row) => (
            <li key={row.brand}>
              <strong>{row.brand}</strong>
              <span>{formatINR(row.from)} became {formatINR(row.to)} on {formatDate(row.since)}. No price-change notice was found.</span>
            </li>
          ))}
        </Finding>
        <Finding title="Trials that became paid" count={graph.trials.rows.length} tone="plum">
          {graph.trials.rows.map((row) => (
            <li key={row.brand}>
              <strong>{row.brand}</strong>
              <span>
                A trial reminder arrived on {formatDate(row.noticeOn)}, followed by a {formatINR(row.amount)} payment on {formatDate(row.paidOn)}.
                {row.hold !== undefined && ` The ${formatINR(row.hold)} card check is separate from the subscription price.`}
              </span>
            </li>
          ))}
        </Finding>
        <Finding title="Still charging, no recent use" count={graph.unopened.rows.length} tone="marigold">
          {graph.unopened.rows.map((row) => (
            <li key={row.brand}>
              <strong>{row.brand}</strong>
              <span>
                {row.lastOpened ? `Last used ${formatDate(row.lastOpened)}.` : "No use recorded."}{" "}
                {row.charges} payments totaling {formatINR(row.paid)} {row.lastOpened ? "since then" : "in the available records"}.
              </span>
            </li>
          ))}
          {graph.unopened.rows.length > 0 && (
            <li className="graph-total">
              <strong>{formatINR(unopenedPaid)} paid in total</strong>
              <span>Charges recorded after the last use, or for services with no use recorded. Autopay is still active.</span>
            </li>
          )}
        </Finding>
      </div>

      <section className="graph-handoff">
        <p>Open a payment to see the charges and messages behind it. You choose what to keep or cancel.</p>
        <div className="graph-actions">
          <button className="primary-button" onClick={hasFindings ? onReview : onContinue}>
            {hasFindings ? "Review flagged payments" : "View all payments"} →
          </button>
          {hasFindings && <button className="secondary-button" onClick={onContinue}>View all payments</button>}
        </div>
      </section>
    </>
  );
}

function Finding({ title, count, tone, children }: {
  title: string;
  count: number;
  tone: "ember" | "plum" | "marigold";
  children: ReactNode;
}) {
  return (
    <article className={`graph-finding ${tone}`}>
      <header>
        <span className="finding-count">{count} {count === 1 ? "service" : "services"}</span>
        <h3>{title}</h3>
      </header>
      <ul>{count > 0 ? children : <li className="empty">None found in the available records.</li>}</ul>
    </article>
  );
}
