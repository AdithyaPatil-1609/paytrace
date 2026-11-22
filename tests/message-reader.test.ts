/**
 * The AI reader (card U1) and its bridge to PaymentEvent. The model is faked,
 * so these run without Ollama. Every message here is made up.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { checkReply, readMessage } from "../ai/assistant/message-reader";
import { MESSAGE_KINDS, READER_JSON_SCHEMA, ReaderFieldsSchema } from "../ai/assistant/reader-shape";
import { amountPaise, eventFromFields, parseDateText } from "../server/ingestion/from-reader";

const message = (text: string) => ({ text, sender: "VM-HDFCBK-S", receivedAt: "2026-11-21T10:00:00.000Z" });
const reply = (fields: Record<string, unknown>) =>
  JSON.stringify({
    is_financial: true,
    kind: "debit",
    merchant: "NETFLIX",
    amount_text: "Rs 649.00",
    date_text: "21-11-26",
    reference: "633012345678",
    account_last4: "4417",
    upi_id: null,
    ...fields
  });
const never = async () => {
  throw new Error("The model must not be called");
};

test("an OTP message never reaches the model", async () => {
  const result = await readMessage(message("123456 is your OTP for txn of Rs 2000 at AMAZON. Do not share."), never);
  assert.deepEqual(result, { status: "dropped", reason: "secret" });
});

test("empty and oversized messages are refused before the model", async () => {
  assert.deepEqual(await readMessage(message("   "), never), { status: "dropped", reason: "empty" });
  assert.deepEqual(await readMessage(message("x".repeat(2001)), never), { status: "dropped", reason: "too_long" });
});

test("the model gets the sender, time and text as data, with the fixed shape", async () => {
  let seen: { messages: { content: string }[]; format: object } | undefined;
  const result = await readMessage(message("Rs 649.00 debited from A/c XX4417 for NETFLIX"), async (messages, format) => {
    seen = { messages, format };
    return reply({});
  });
  assert.equal(result.status, "read");
  assert.equal(seen?.format, READER_JSON_SCHEMA);
  assert.deepEqual(JSON.parse(seen!.messages[1].content), {
    sender: "VM-HDFCBK-S",
    received_at: "2026-11-21T10:00:00.000Z",
    text: "Rs 649.00 debited from A/c XX4417 for NETFLIX"
  });
});

test("a broken or off-shape reply is refused, and a down model is reported", async () => {
  const text = "Rs 649.00 debited for NETFLIX";
  assert.equal((await readMessage(message(text), async () => "not json")).status, "unreadable");
  assert.equal((await readMessage(message(text), async () => reply({ kind: "salary" }))).status, "unreadable");
  assert.equal((await readMessage(message(text), async () => reply({ extra: "x" }))).status, "unreadable");
  assert.deepEqual(await readMessage(message(text), never), { status: "unreadable", reason: "model_down", model: "qwen3:14b" });
});

test("a non-financial reply keeps nothing, and XX4417 becomes 4417", () => {
  const other = checkReply(reply({ is_financial: false, kind: "credit" }))!;
  assert.equal(other.kind, "other");
  assert.equal(other.merchant, null);
  assert.equal(checkReply(reply({ account_last4: "XX4417" }))?.account_last4, "4417");
});

test("the JSON schema sent to Ollama lists the same fields and kinds as the Zod check", () => {
  const schema = READER_JSON_SCHEMA as unknown as { required: string[]; properties: { kind: { enum: string[] } } };
  assert.deepEqual(schema.required.sort(), Object.keys(ReaderFieldsSchema.shape).sort());
  assert.deepEqual(schema.properties.kind.enum, [...MESSAGE_KINDS]);
});

test("amounts are read from the text exactly as written", () => {
  assert.equal(amountPaise("Rs 1,499.00"), 149900);
  assert.equal(amountPaise("INR 649"), 64900);
  assert.equal(amountPaise("₹2,000"), 200000);
  assert.equal(amountPaise("max Rs 199"), 19900);
  assert.equal(amountPaise("Rs 100 or Rs 200"), null);
  assert.equal(amountPaise(null), null);
});

test("Indian date formats become YYYY-MM-DD, day first", () => {
  const at = "2026-11-21T10:00:00.000Z";
  assert.equal(parseDateText("21-11-26", at), "2026-11-21");
  assert.equal(parseDateText("05/11/2026", at), "2026-11-05");
  assert.equal(parseDateText("25 Nov", at), "2026-11-25");
  assert.equal(parseDateText("Nov 21, 2026", at), "2026-11-21");
  assert.equal(parseDateText("2026-11-21", at), "2026-11-21");
  assert.equal(parseDateText("31-02-26", at), null);
  assert.equal(parseDateText("tomorrow", at), null);
});

test("read fields become a PaymentEvent, and the same SMS twice gets one ID", () => {
  const fields = checkReply(reply({}))!;
  const first = eventFromFields(fields, message("Rs 649.00 debited for NETFLIX"), "sms");
  const again = eventFromFields(fields, message("Rs 649.00 debited for NETFLIX"), "sms");
  assert.equal(first.status, "event");
  if (first.status !== "event" || again.status !== "event") return;
  assert.equal(first.event.kind, "debit_posted");
  assert.equal(first.event.amountPaise, 64900);
  assert.equal(first.event.date, "2026-11-21");
  assert.equal(first.event.accountHint, "4417");
  assert.equal(first.event.sourceId, again.event.sourceId);
  assert.ok(!JSON.stringify(first.event).includes("debited"), "the message text is never stored");
});

test("kinds the graph does not track yet are skipped, not guessed", () => {
  assert.deepEqual(eventFromFields(checkReply(reply({ kind: "credit" }))!, message("salary"), "sms"), {
    status: "skipped",
    reason: "not_tracked_yet"
  });
  assert.deepEqual(eventFromFields(checkReply(reply({ merchant: null }))!, message("debit"), "sms"), {
    status: "skipped",
    reason: "missing_fields"
  });
});
