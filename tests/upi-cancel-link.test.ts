import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UpiCancelLink } from "../components/detail/upi-cancel-link";

const active = { mechanism: "upi_autopay", mandateStatus: "active", canCancel: true, cancelMode: "normal" } as const;
const render = (item: Parameters<typeof UpiCancelLink>[0]["item"]) => renderToStaticMarkup(createElement(UpiCancelLink, { item }));
test("active UPI mandates hand off to NPCI; other rails, missing status and blocked payments do not", () => {
  assert.match(render(active), /href="https:\/\/www\.upihelp\.npci\.org\.in\/"/);
  for (const mechanism of ["card_recurring", "enach", "emi_ach", "play_store"] as const) assert.equal(render({ ...active, mechanism }), "");
  for (const mandateStatus of [undefined, "revoked", "cancelled"]) assert.equal(render({ ...active, mandateStatus }), "");
  assert.equal(render({ ...active, cancelMode: "block" }), "");
  assert.equal(render({ ...active, canCancel: false }), "");
});

test("iCloud+ opens Apple's guide instead of NPCI", () => {
  const html = render({ ...active, mechanism: "play_store", merchant: "iCloud+" });
  assert.match(html, /href="https:\/\/support\.apple\.com\/108318"/);
  assert.doesNotMatch(html, /npci\.org\.in/);
});
