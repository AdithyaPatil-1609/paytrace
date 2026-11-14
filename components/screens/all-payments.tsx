/**
 * Screen 01 — All payments
 * The full book of recurring commitments before any judgement.
 */
"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ScreenHeader } from "@/components/chrome/screen-header";
import { RenewalCalendar } from "@/components/visualizations/renewal-calendar";
import { AnimatedINR } from "@/components/motion/animated-inr";
import { monthlyCost } from "@/lib/presentation/commitment-ui";
import { formatINR } from "@/lib/presentation/format";
import type { Commitment } from "@/lib/payments/types";

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } }
};
const immediateRows: Variants = {
  hidden: { opacity: 1, y: 0 },
  show: { opacity: 1, y: 0, transition: { duration: 0 } }
};

export function AllPaymentsScreen({
  items,
  total,
  baseline,
  simulated,
  onOpen,
  asOf
}: {
  items: Commitment[];
  total: number;
  baseline: number;
  simulated: boolean;
  onOpen: (id: string) => void;
  asOf: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <>
      <ScreenHeader
        number="1"
        eyebrow="ALL OF THEM"
        title="Every periodic payment, on one page"
        copy="See every recurring payment, its original bank description and its yearly estimate."
        help="Variable bills and payments with uneven dates still belong here. Open a payment to inspect the statement records and messages that explain why it was included. The next-month section shows the dates supported by these records."
      />
      <motion.section
        className="year-banner"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
      >
        <div>
          <span>YEAR OF EVERYTHING</span>
          <strong><AnimatedINR value={total} /></strong>
          {simulated && baseline !== total && (
            <p className="year-delta">
              <s>{formatINR(baseline)}</s> → <b>{formatINR(total)}</b> after one new autopay
            </p>
          )}
          <small>
            {items.length} recurring commitments from statement lines and payment messages.
          </small>
        </div>
        <div className="year-note">
          <b>{simulated ? "New autopay is included" : "A clear annual total"}</b>
          <p>
            {simulated
              ? "Headspace was detected from one statement line and one live mandate. It is not an issue."
              : "The current Spotify price is shown here. Price history belongs on the issues screen."}
          </p>
        </div>
      </motion.section>

      <section className="data-panel">
        <motion.div
          className="table-caption"
          initial={reduceMotion ? false : { opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : 0.12 }}
        >
          <span>WHAT THE MESSAGE PRINTS</span>
          <span>A PERSON READS</span>
          <span>EACH MONTH</span>
          <span>THIS YEAR</span>
          <span>SOURCE</span>
        </motion.div>
        <motion.div
          className="payment-rows"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: {
              transition: {
                delayChildren: reduceMotion ? 0 : 0.21,
                staggerChildren: reduceMotion ? 0 : 0.03
              }
            }
          }}
        >
          {items.map((item) => (
            <motion.button
              className={["payment-row", item.signals.includes("new") ? "is-new" : ""]
                .join(" ")
                .trim()}
              data-row={item.id}
              key={item.id}
              variants={reduceMotion ? immediateRows : rowVariants}
              whileHover={reduceMotion ? undefined : { scale: 1.01, boxShadow: "0 5px 14px -8px rgba(36,18,49,0.24)" }}
              whileTap={reduceMotion ? undefined : { scale: 0.997 }}
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
            </motion.button>
          ))}
        </motion.div>
      </section>
      <p className="exclusion-note">
        <strong>Not added to this list:</strong> one Swiggy order, a transfer to Rahul, salary
        credits, the credit-card repayment, and YouTube&apos;s ₹1 authorisation. One-off debits have
        no second debit or active mandate; credits, card repayments, and authorisation holds are
        excluded separately. Open any row above to see the rule that kept it.
      </p>

      <h2 className="viz-heading">Next month’s payments</h2>
      <RenewalCalendar items={items} asOf={asOf} onOpen={onOpen} />
    </>
  );
}
