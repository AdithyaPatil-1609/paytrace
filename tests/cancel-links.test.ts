import test from "node:test";
import assert from "node:assert/strict";
import { cancelOptions, missingCancellationGuidance, requiresProviderReview } from "../server/presentation/cancel-links";
import type { Mechanism } from "../server/payments/types";

const unknown = {
  merchant: "Example merchant",
  rawNarration: "EXAMPLE",
  stopService: "Not in the dictionary yet.",
  stopMoney: "Not in the dictionary yet."
};

const mechanisms: Mechanism[] = [
  "upi_autopay", "card_recurring", "play_store", "enach",
  "bbps", "neft_standing", "vas", "emi_ach", "none"
];

test("all mechanisms have usable steps instead of placeholder text", () => {
  for (const mechanism of mechanisms) {
    const options = cancelOptions({ ...unknown, mechanism });
    assert.ok(options.length, mechanism);
    assert.ok(options.every(option => option.steps.length > 0), mechanism);
    assert.doesNotMatch(JSON.stringify(options), /not in the dictionary yet/i);
  }
});

test("unknown rail asks for verification without invented merchant links", () => {
  const options = cancelOptions({ ...unknown, mechanism: "none" });
  assert.match(options[0].title, /identify the payment method/i);
  assert.ok(options.every(option => option.links.length === 0));
});

test("UPI and Google Play use existing official destinations", () => {
  const upi = cancelOptions({ ...unknown, mechanism: "upi_autopay" });
  assert.equal(upi[0].links[0].href, "https://upihelp.npci.org.in");
  assert.match(upi[0].steps[0], /confirm/i);
  const play = cancelOptions({ ...unknown, mechanism: "play_store" });
  assert.equal(play[0].links[0].href, "https://play.google.com/store/account/subscriptions");
});

test("unknown card keeps bank-specific links only if a bank is identified", () => {
  const unnamed = cancelOptions({ ...unknown, mechanism: "card_recurring" });
  assert.ok(unnamed.every(option => option.links.length === 0));
  assert.match(JSON.stringify(unnamed), /card issuer/);
  const known = cancelOptions({ ...unknown, mechanism: "card_recurring", rawNarration: "AXIS BANK EXAMPLE" });
  assert.ok(known.some(option => option.links.some(link => link.href.includes("axisbank"))));
});

test("unknown obligations require provider review and do not link to revocation", () => {
  for (const mechanism of ["emi_ach", "enach", "bbps", "neft_standing"] as const) {
    const item = { ...unknown, mechanism };
    assert.equal(requiresProviderReview(item), true);
    const options = cancelOptions(item);
    assert.match(options[0].title, /review with your provider/i);
    assert.ok(options.every(option => option.links.length === 0));
    assert.match(options[0].steps.join(" "), /do not revoke/i);
  }
  const insurance = cancelOptions({ ...unknown, mechanism: "upi_autopay", spendGroup: "insurance" });
  assert.match(insurance[0].title, /review with your provider/i);
  assert.equal(insurance[0].links.length, 0);
});

test("verified instructions are preserved; blank or partial guidance falls back", () => {
  const known = { ...unknown, mechanism: "none" as const, stopService: "Cancel your plan", stopMoney: "Confirm payment has stopped" };
  assert.equal(missingCancellationGuidance(known), false);
  assert.deepEqual(cancelOptions(known)[0].steps, [known.stopService, known.stopMoney]);
  assert.equal(missingCancellationGuidance({ ...known, stopMoney: "" }), true);
  assert.doesNotMatch(JSON.stringify(cancelOptions({ ...known, stopMoney: "Not in the dictionary yet" })), /not in the dictionary yet/i);
});
