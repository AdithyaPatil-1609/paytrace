/** Gmail is linked only with the exact, current consent and the box ticked (DPDP). */
import test from "node:test";
import assert from "node:assert/strict";
import { GMAIL_CONSENT_VERSION, hasGmailConsent } from "../../server/accounts/consent";

const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };

test("consent needs the current version and the ticked box", () => {
  assert.equal(hasGmailConsent(form({ mode: "link", consent: GMAIL_CONSENT_VERSION, agree: "yes" })), true);
  assert.equal(hasGmailConsent(form({ mode: "link", consent: GMAIL_CONSENT_VERSION })), false, "box not ticked");
  assert.equal(hasGmailConsent(form({ mode: "link", consent: "gmail-v0", agree: "yes" })), false, "old consent text");
  assert.equal(hasGmailConsent(form({ mode: "link" })), false, "a bare Connect button");
});
