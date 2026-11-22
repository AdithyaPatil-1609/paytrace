/**
 * Source trust (Task 3): levels come from checks that ran on the server. A
 * client can never send its own level, and older records are never upgraded.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { corroboration, emailProvenance, LEGACY_REASON, readTrust, smsProvenance, statementProvenance } from "../lib/ingestion/trust";
import { validateEvent } from "../lib/ingestion/event";

test("an email is verified only when Gmail's sender check passed", () => {
  assert.equal(emailProvenance("pass").sourceTrust, "verified_origin");
  assert.equal(emailProvenance("pass").verificationMethod, "gmail_dkim_dmarc");
  assert.ok(emailProvenance("pass").verifiedAt);
  assert.equal(emailProvenance("unknown").sourceTrust, "unverified");
  assert.equal(emailProvenance("unknown").verifiedAt, null);
});

test("a signed phone proves the phone, not the bank", () => {
  const signed = smsProvenance("signed_device");
  assert.equal(signed.sourceTrust, "authenticated_source");
  assert.equal(signed.verificationStatus, "channel_verified");
  assert.match(signed.trustReason, /cannot prove the bank/);
  assert.equal(smsProvenance("ios_token").sourceTrust, "authenticated_source");
  assert.equal(smsProvenance("legacy_code").sourceTrust, "unverified");
});

test("an uploaded statement is user-provided, not verified", () => {
  assert.equal(statementProvenance().sourceTrust, "user_provided");
  assert.equal(statementProvenance().verificationStatus, "not_verified");
});

test("a client cannot send a trust level inside an event", () => {
  const base = { source: "sms", kind: "debit_posted", merchant: "TESTFLIX", amountPaise: 100, date: "2026-01-01", reference: "REF123", sourceId: "s-1" };
  assert.doesNotThrow(() => validateEvent(base));
  for (const field of ["sourceTrust", "verificationStatus", "trustReason", "verifiedAt"]) {
    assert.throws(() => validateEvent({ ...base, [field]: "verified_origin" }), /Unexpected event field/);
  }
});

test("older records read as unverified and are not upgraded; unknown values are ignored", () => {
  assert.deepEqual(readTrust({}), { sourceTrust: "unverified", trustReason: LEGACY_REASON });
  assert.deepEqual(readTrust({ sourceTrust: "super_trusted" }), { sourceTrust: "unverified", trustReason: LEGACY_REASON });
  assert.equal(readTrust({ sourceTrust: "verified_origin", trustReason: "x" }).sourceTrust, "verified_origin");
});

test("corroboration counts channels, not copies", () => {
  assert.equal(corroboration([{ id: "1", source: "email" }, { id: "2", source: "email" }]).corroborated, false);
  assert.deepEqual(corroboration([{ id: "1", source: "sms" }, { id: "2", source: "email" }]), { sources: ["email", "sms"], independent: 2, corroborated: true });
});
