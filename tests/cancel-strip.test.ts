// The Cancel paths strip must name where each payment is actually stopped,
// not repeat the same three generic steps on every row.
import test from "node:test";
import assert from "node:assert/strict";
import { cancelStrip } from "../server/presentation/cancel-strip";
import type { Mechanism } from "../server/payments/types";

const base = { merchant: "Example", rawNarration: "EXAMPLE" };

test("UPI AutoPay points at the app and UPI Help", () => {
  const steps = cancelStrip({ ...base, merchant: "Spotify", mechanism: "upi_autopay" });
  assert.deepEqual(steps.map((s) => s.label), ["Cancel in Spotify app", "Revoke on UPI Help", "Keep the revoke SMS"]);
});

test("a card names the bank when the statement does", () => {
  const steps = cancelStrip({ ...base, merchant: "Netflix", mechanism: "card_recurring", rawNarration: "AXIS BANK CARD NETFLIX" });
  assert.equal(steps[1].label, "Axis Bank e-mandate page");
  const unknownBank = cancelStrip({ ...base, mechanism: "card_recurring" });
  assert.equal(unknownBank[1].label, "Call your card's bank");
});

test("bills keep the reminder to pay; loans settle first", () => {
  assert.match(cancelStrip({ ...base, mechanism: "bbps" })[1].label, /pay the bill/i);
  assert.match(cancelStrip({ ...base, mechanism: "emi_ach" })[0].label, /settle/i);
});

test("rows on different rails get different strips", () => {
  const rails: Mechanism[] = ["upi_autopay", "card_recurring", "play_store", "vas", "bbps", "neft_standing", "enach", "none"];
  const strips = new Set(rails.map((mechanism) => cancelStrip({ ...base, mechanism }).map((s) => s.label).join("|")));
  assert.equal(strips.size, rails.length);
  for (const mechanism of rails)
    for (const step of cancelStrip({ ...base, mechanism })) assert.ok(step.hint.length > 10, mechanism);
});
