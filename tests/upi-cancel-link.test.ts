// Checks which payments the Cancel button sends to NPCI's UPI Help. Made-up payments only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UpiCancelLink, upiRoute } from "../web/components/detail/upi-cancel-link";

const active = { mechanism: "upi_autopay", mandateStatus: "active", canCancel: true, cancelMode: "normal" } as const;
const render = (item: Parameters<typeof UpiCancelLink>[0]["item"]) => renderToStaticMarkup(createElement(UpiCancelLink, { item }));
const NPCI = /href="https:\/\/www\.upihelp\.npci\.org\.in\/"/;

test("UPI AutoPay hands off to NPCI in a new tab, with or without a mandate record", () => {
  for (const mandateStatus of ["active", undefined, ""]) {
    const html = render({ ...active, mandateStatus });
    assert.match(html, NPCI);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
  }
});

test("a subscription found only in Gmail notices goes to NPCI too, since its rail is not confirmed", () => {
  const fromGmail = { mechanism: "card_recurring", mandateStatus: undefined, canCancel: true, cancelMode: "normal", merchant: "Netflix", rawNarration: "NETFLIX", basis: "notices" } as const;
  assert.equal(upiRoute(fromGmail), "possible");
  const html = render(fromGmail);
  assert.match(html, NPCI);
  assert.match(html, /If Netflix is there, choose Revoke/);
  assert.equal(upiRoute({ ...fromGmail, mechanism: "none" }), "possible");
});

test("bank evidence of a card, other rails, stopped mandates and loans stay on the steps", () => {
  const card = { mechanism: "card_recurring", mandateStatus: undefined, canCancel: true, cancelMode: "normal", merchant: "Netflix" } as const;
  assert.equal(render({ ...card, rawNarration: "POS 4111XXXX NETFLIX.COM" }), "");
  assert.equal(render({ ...card, rawNarration: "NETFLIX.COM*MUMBAI" }), "");
  assert.equal(render({ ...card, rawNarration: "NETFLIX", mandateRef: "SI-1234" }), "");
  for (const mechanism of ["enach", "emi_ach", "play_store", "bbps", "vas", "neft_standing"] as const) assert.equal(render({ ...active, mechanism }), "");
  for (const mandateStatus of ["revoked", "cancelled", "Paused"]) assert.equal(render({ ...active, mandateStatus }), "");
  assert.equal(render({ ...active, cancelMode: "block" }), "");
  assert.equal(render({ ...active, canCancel: false }), "");
  assert.equal(render({ ...active, mechanism: "none", rawNarration: "ACH D- DEMO HOME LOAN" }), "");
});

test("iCloud+ opens Apple's guide instead of NPCI", () => {
  const html = render({ ...active, mechanism: "play_store", merchant: "iCloud+" });
  assert.match(html, /href="https:\/\/support\.apple\.com\/108318"/);
  assert.doesNotMatch(html, /npci\.org\.in/);
});
