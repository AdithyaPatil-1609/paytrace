/**
 * Screen 01 — All payments
 * The full book of recurring commitments before any judgement.
 */
import { ScreenHeader } from "@/components/chrome/screen-header";
import { RenewalCalendar } from "@/components/visualizations/renewal-calendar";
import { monthlyCost } from "@/lib/commitment-ui";
import { formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

export function AllPaymentsScreen({
  items,
  total,
  baseline,
  simulated,
  onSimulate,
  onReset,
  onOpen,
  asOf
}: {
  items: Commitment[];
  total: number;
  baseline: number;
  simulated: boolean;
  onSimulate: () => void;
  onReset: () => void;
  onOpen: (id: string) => void;
  asOf: string;
}) {
  return (
    <>
      <ScreenHeader
        number="1"
        eyebrow="ALL OF THEM"
        title="Every periodic payment, on one page"
        copy="This is the whole book before any judgement. Each row shows the bank string and the plain name beside it. Electricity changes amount, and society has uneven dates. Both still belong here."
      />
      <section className="year-banner">
        <div>
          <span>YEAR OF EVERYTHING</span>
          <strong>{formatINR(total)}</strong>
          {simulated && baseline !== total && (
            <p className="year-delta">
              <s>{formatINR(baseline)}</s> → <b>{formatINR(total)}</b> after one new autopay
            </p>
          )}
          <small>{items.length} recurring commitments from statement lines and payment messages.</small>
        </div>
        <div className="year-note">
          <b>{simulated ? "New autopay is included" : "A clear annual total"}</b>
          <p>
            {simulated
              ? "Headspace was detected from one statement line and one live mandate. It is not an issue."
              : "The current Spotify price is shown here. Price history belongs on the issues screen."}
          </p>
        </div>
      </section>

      <section className="data-panel">
        <div className="table-caption">
          <span>WHAT THE MESSAGE PRINTS</span>
          <span>A PERSON READS</span>
          <span>EACH MONTH</span>
          <span>THIS YEAR</span>
          <span>SOURCE</span>
        </div>
        <div className="payment-rows">
          {items.map((item) => (
            <button
              className={["payment-row", item.signals.includes("new") ? "is-new" : ""].join(" ").trim()}
              data-row={item.id}
              key={item.id}
              onClick={() => onOpen(item.id)}
            >
              <strong className="raw-narration">{item.rawNarration}</strong>
              <span className="pay-plain">
                <strong>
                  {item.merchant}
                  {!item.inDictionary && <i className="unknown-tag">unknown</i>}
                </strong>
                <em>{item.plainDescription}</em>
              </span>
              <span className="pay-month">{monthlyCost(item)}</span>
              <b>{formatINR(item.annualCost)}</b>
              <small>{item.source}</small>
            </button>
          ))}
        </div>
      </section>
      <p className="exclusion-note">
        <strong>Not added to this list:</strong> one Swiggy order, a transfer to Rahul, salary credits, the
        credit-card repayment, and YouTube&apos;s ₹1 authorisation. Each is a statement line with no second debit
        and no mandate behind it, so the grouping drops it. Open any row above to see the rule that kept it.
      </p>

      <h2 className="viz-heading">The next two months</h2>
      <RenewalCalendar items={items} asOf={asOf} onOpen={onOpen} />

      <section className="simulation-card">
        <div>
          <p>SIMULATE NEW AUTOPAY</p>
          <h2>{simulated ? "Headspace is now being tracked" : "See what a new autopay looks like"}</h2>
          <span>
            {simulated
              ? "One statement line, one UPI mandate, and two SMS were added to the fixture. Detection found Headspace on its own. A second click will not duplicate it."
              : "One click appends the rows a new mandate leaves behind: ₹299 on 22 Oct 2026, a UPI Autopay mandate, and the SMS. Detection then runs again."}
          </span>
        </div>
        {simulated ? (
          <button className="secondary-button" onClick={onReset}>
            Reset simulation
          </button>
        ) : (
          <button className="primary-button" onClick={onSimulate}>
            Simulate new autopay <i>→</i>
          </button>
        )}
      </section>
    </>
  );
}
