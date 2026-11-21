/**
 * POST /api/ingest/sms and the live SMS pipeline behind it. The model and
 * Neo4j are faked, so nothing leaves the test. Every message is made up.
 */
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { POST } from "../app/api/ingest/sms/route";
import { checkSmsBody, processSms, processSmsWithRetry } from "../lib/ingestion/sms-message";
import { resetRateLimits } from "../lib/security/rate-limit";
import type { ReadResult } from "../lib/assistant/message-reader";
import type { PaymentEvent } from "../lib/ingestion/event";

const CODE = "test-pairing-code-123";
const URL = "http://localhost/api/ingest/sms";
const NOW = Date.parse("2026-11-21T12:00:00.000Z");

function send(body: string, code?: string, headers: Record<string, string> = {}) {
  const all: Record<string, string> = { "Content-Type": "application/json", ...headers };
  if (code) all["x-paytrace-device"] = code;
  return POST(new Request(URL, { method: "POST", headers: all, body }));
}

const sms = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    sender: "VM-HDFCBK-S",
    text: "Rs 649.00 debited from A/c XX4417 on 21-11-26 for UPI Autopay NETFLIX. UPI Ref 633012345678",
    receivedAt: new Date().toISOString(),
    ...overrides
  });

beforeEach(() => {
  resetRateLimits();
  process.env.PAYTRACE_DEVICE_CODE = CODE;
  delete process.env.PAYTRACE_LIVE_ENABLED;
});

test("ingest/sms refuses a missing, wrong or unconfigured device code", async () => {
  assert.equal((await send(sms())).status, 401);
  assert.equal((await send(sms(), "wrong-code")).status, 401);
  delete process.env.PAYTRACE_DEVICE_CODE;
  assert.equal((await send(sms(), CODE)).status, 401);
});

test("ingest/sms refuses a large body before checking the device", async () => {
  assert.equal((await send("x", undefined, { "content-length": "5000" })).status, 413);
  assert.equal((await send("x".repeat(5000), CODE)).status, 413);
});

test("ingest/sms refuses broken JSON and the old field-only body", async () => {
  assert.equal((await send("not json", CODE)).status, 400);
  const oldShape = JSON.stringify({ source: "sms", kind: "debit_posted", merchant: "DEMOFLIX", amountPaise: 19900, date: "2026-11-15", reference: "7712003344" });
  assert.equal((await send(oldShape, CODE)).status, 400);
});

test("ingest/sms refuses a normal phone number posing as a bank", async () => {
  assert.equal((await send(sms({ sender: "+919812345678" }), CODE)).status, 400);
});

test("ingest/sms checks the body, then refuses when live storage is off", async () => {
  assert.equal((await send(sms(), CODE)).status, 503);
});

test("ingest/sms limits one address to 30 messages a minute", async () => {
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await send("not json", CODE, { "cf-connecting-ip": "203.0.113.9" })).status;
  assert.equal(last, 429);
});

test("the body check accepts only the phone's exact shape and a sane time", () => {
  const ok = checkSmsBody({ sender: "vm-hdfcbk-s", text: "Rs 1 debited", receivedAt: "2026-11-21T11:59:00Z" }, NOW);
  assert.deepEqual(ok, { ok: true, message: { sender: "VM-HDFCBK-S", text: "Rs 1 debited", receivedAt: "2026-11-21T11:59:00.000Z" } });
  const base = { sender: "VM-HDFCBK-S", text: "Rs 1 debited", receivedAt: "2026-11-21T11:59:00Z" };
  assert.equal(checkSmsBody({ ...base, extra: 1 }, NOW).ok, false);
  assert.equal(checkSmsBody({ ...base, sender: "HDFCBK" }, NOW).ok, false);
  assert.equal(checkSmsBody({ ...base, text: "" }, NOW).ok, false);
  assert.equal(checkSmsBody({ ...base, text: "x".repeat(2001) }, NOW).ok, false);
  assert.equal(checkSmsBody({ ...base, receivedAt: "yesterday" }, NOW).ok, false);
  assert.equal(checkSmsBody({ ...base, receivedAt: "2026-11-21T12:30:00Z" }, NOW).ok, false, "30 minutes in the future");
  assert.equal(checkSmsBody({ ...base, receivedAt: "2026-11-01T12:00:00Z" }, NOW).ok, false, "20 days old");
});

const message = { sender: "VM-HDFCBK-S", text: "Rs 649.00 debited for NETFLIX", receivedAt: "2026-11-21T11:59:00.000Z" };
const debit: ReadResult = {
  status: "read",
  model: "qwen3:14b",
  fields: { is_financial: true, kind: "debit", merchant: "NETFLIX", amount_text: "Rs 649.00", date_text: "21-11-26", reference: "633012345678", account_last4: "4417", upi_id: null }
};

test("a read debit is stored in Neo4j as a PaymentEvent, without the text", async () => {
  const stored: PaymentEvent[] = [];
  const outcome = await processSms("p1", message, { read: async () => debit, store: async (_p, event) => stored.push(event) });
  assert.equal(outcome.status, "stored");
  assert.equal(stored[0].kind, "debit_posted");
  assert.equal(stored[0].amountPaise, 64900);
  assert.ok(!JSON.stringify(stored).includes("debited"));
});

test("dropped and non-financial messages never reach Neo4j", async () => {
  const store = async () => assert.fail("must not store");
  assert.deepEqual(await processSms("p1", message, { read: async () => ({ status: "dropped", reason: "secret" }), store }), { status: "dropped", reason: "secret" });
  const promo: ReadResult = { ...debit, fields: { ...debit.fields, is_financial: false, kind: "other" } } as ReadResult;
  assert.deepEqual(await processSms("p1", message, { read: async () => promo, store }), { status: "skipped", reason: "not_financial" });
});

test("Qwen down and Neo4j down are retried; a bad reply is not", async () => {
  let reads = 0;
  const flaky = async (): Promise<ReadResult> => (++reads < 3 ? { status: "unreadable", reason: "model_down", model: "qwen3:14b" } : debit);
  const noSleep = async () => undefined;
  const outcome = await processSmsWithRetry("p1", message, { read: flaky, store: async () => ({}) }, [1, 1, 1], noSleep);
  assert.equal(outcome.status, "stored");
  assert.equal(reads, 3);

  let badReads = 0;
  const bad = async (): Promise<ReadResult> => (badReads++, { status: "unreadable", reason: "bad_reply", model: "qwen3:14b" });
  await processSmsWithRetry("p1", message, { read: bad, store: async () => ({}) }, [1, 1, 1], noSleep);
  assert.equal(badReads, 1);

  let stores = 0;
  const down = async () => {
    stores++;
    throw new Error("Neo4j unreachable");
  };
  assert.equal((await processSmsWithRetry("p1", message, { read: async () => debit, store: down }, [1, 1], noSleep)).status, "store_failed");
  assert.equal(stores, 3);
});
