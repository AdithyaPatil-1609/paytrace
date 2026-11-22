/**
 * The public sandbox: every synthetic message goes through the real checks,
 * the four warnings appear, hostile cases are refused, signed-phone attacks are
 * blocked, and two visitors never see each other's sandbox. The AI reader is
 * replaced by a stand-in that copies values from the text, like Qwen does.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ReadResult } from "../../ai/assistant/message-reader";
import { processSandboxMessage } from "../../server/sandbox/pipeline";
import { sandboxView, knownMerchant } from "../../server/sandbox/dataset";
import { runSignedAttack } from "../../server/sandbox/attacks";
import { clearSandboxes, getSandbox, openSandbox } from "../../server/sandbox/store";
import { ATTACKS, EMAIL_TEMPLATES, SMS_TEMPLATES, datesAfter } from "../../server/sandbox/templates";
import { detectCommitments } from "../../server/payments/engine";
import { loadFixtures } from "../../data/fixtures";

/** A stand-in for Qwen: copies merchant, amount and date straight from the text. */
async function fakeReader(message: IncomingMessage): Promise<ReadResult> {
  const t = message.text;
  const amount = t.match(/Rs\.?\s?[\d,]+(?:\.\d{2})?/)?.[0] ?? null;
  const date = t.match(/\b\d{2}-\d{2}-\d{2}\b/)?.[0] ?? t.match(/\b\d{1,2} [A-Z][a-z]{2} \d{4}\b/)?.[0] ?? null;
  const merchant = t.match(/SPOTIFY STOCKHOLM|UPI\/GYMFITLINE\/\d+|NETFLIX\.COM|HDFC LIFE|Google One|GOOGLE\*YOUTUBEPREM|HEADSPACE|CANVA\.COM PADDLE\.NET|Spotify|Netflix|Canva Pro|Amazon Prime|YouTube Premium/)?.[0] ?? null;
  const kind = /cashback|offer/i.test(t) ? "other" : /cancelled/i.test(t) ? "mandate_cancelled" : /mandate created/i.test(t) ? "mandate_created"
    : /will be debited|will be renewed/i.test(t) ? "upcoming_debit" : /price is changing|plan price|will cost/i.test(t) ? "price_change" : /trial/i.test(t) ? "trial_ending" : "debit";
  if (kind === "other") return { status: "read", model: "fake", fields: { is_financial: false, kind: "other", merchant: null, amount_text: null, date_text: null, reference: null, account_last4: null, upi_id: null } };
  return { status: "read", model: "fake", fields: { is_financial: true, kind, merchant, amount_text: kind === "mandate_cancelled" ? null : amount, date_text: date, reference: null, account_last4: null, upi_id: null } };
}

const send = (id: string, channel: "sms" | "email", sender: string, text: string, read = fakeReader) =>
  processSandboxMessage(openSandbox(id), { channel, sender, text }, read);
const template = (list: typeof SMS_TEMPLATES, id: string) => list.find(t => t.id === id)!;
const sendTemplate = async (box: string, list: typeof SMS_TEMPLATES, id: string) => {
  const t = template(list, id);
  return send(box, t.channel, t.sender, t.text(datesAfter(sandboxView(getSandbox(box)).asOf)));
};

test.beforeEach(() => clearSandboxes());

test("a price-rise SMS is read, saved, and makes Netflix a silent hike on the screens", async () => {
  const outcome = await sendTemplate("a".repeat(32), SMS_TEMPLATES, "sms-price");
  assert.equal(outcome.accepted, true, outcome.steps.map(s => s.detail).join(" | "));
  const view = sandboxView(getSandbox("a".repeat(32)));
  assert.ok(view.alerts.some(a => a.kind === "price_rise" && a.title.includes("Netflix")));
  const netflix = detectCommitments(view.dataset).find(c => c.rawNarration === "NETFLIX.COM");
  assert.equal(netflix?.amount, 799);
  assert.equal(netflix?.previousAmount, 649);
  assert.ok(netflix?.signals.includes("silent_hike"), String(netflix?.signals));
});

test("the four warnings: price rise, unused, upcoming, charged after cancelling", async () => {
  const box = "b".repeat(32);
  for (const id of ["sms-price", "sms-unused", "sms-upcoming", "sms-cancel", "sms-after-cancel"]) {
    const outcome = await sendTemplate(box, SMS_TEMPLATES, id);
    assert.equal(outcome.accepted, true, `${id}: ${outcome.steps.map(s => s.detail).join(" | ")}`);
  }
  const kinds = new Set(sandboxView(getSandbox(box)).alerts.map(a => a.kind));
  for (const kind of ["price_rise", "unused", "upcoming", "after_cancel"] as const) assert.ok(kinds.has(kind), kind);
});

test("a price-change email turns the next price rise into an announced one", async () => {
  const box = "c".repeat(32);
  assert.equal((await sendTemplate(box, EMAIL_TEMPLATES, "mail-price")).accepted, true);
  await sendTemplate(box, SMS_TEMPLATES, "sms-price");
  const rise = sandboxView(getSandbox(box)).alerts.find(a => a.kind === "price_rise");
  assert.match(rise!.detail, /a price notice was received/);
});

test("a promotion is read and not stored", async () => {
  const outcome = await sendTemplate("d".repeat(32), EMAIL_TEMPLATES, "mail-promo");
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.summary, "Read: not a payment");
});

test("hostile messages are refused at the right step, without the AI for the cheap checks", async () => {
  let asked = 0;
  const counting = async (m: IncomingMessage) => { asked++; return fakeReader(m); };
  const d = datesAfter("2026-10-22");
  const expected: Record<string, string> = { "fake-sender": "Sender check", otp: "Secret filter", injection: "Instruction filter", "mail-injection": "Instruction filter", huge: "Size check" };
  for (const [id, step] of Object.entries(expected)) {
    const attack = ATTACKS.find(a => a.id === id)!;
    if (attack.kind !== "message") throw new Error("message attack expected");
    const outcome = await send("e".repeat(32), attack.channel, attack.sender, attack.text(d), counting);
    assert.equal(outcome.accepted, false, id);
    assert.equal(outcome.steps.at(-1)!.name, step, id);
  }
  assert.equal(asked, 0, "none of these reach the AI");
});

test("the same SMS twice is saved once", async () => {
  const text = "Rs 499.00 spent on card XX2291 on 23-10-26 for CANVA.COM PADDLE.NET. Ref X1. -ARCLIGHT BANK";
  assert.equal((await send("f".repeat(32), "sms", "AX-ARCBNK-S", text)).accepted, true);
  const again = await send("f".repeat(32), "sms", "AX-ARCBNK-S", text);
  assert.equal(again.accepted, false);
  assert.equal(again.steps.at(-1)!.name, "Duplicate check");
});

test("when Qwen is down, nothing is guessed", async () => {
  const outcome = await send("1".repeat(32), "sms", "AX-ARCBNK-S", "Rs 99.00 debited for NETFLIX.COM on 23-10-26.", async () => ({ status: "unreadable", reason: "model_down", model: "qwen" }));
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.summary, "Could not read");
  assert.equal(getSandbox("1".repeat(32))!.events.length, 0);
});

test("every signed-phone attack is blocked by the real signature check", async () => {
  const box = openSandbox("2".repeat(32));
  for (const attack of ["replay", "tamper", "stale", "unknown"] as const) {
    const entry = await runSignedAttack(box, attack);
    assert.equal(entry.accepted, true, `${attack}: ${entry.steps.map(s => s.detail).join(" | ")}`);
  }
});

test("two visitors never see each other's sandbox, and an empty sandbox is the plain demo", async () => {
  await sendTemplate("3".repeat(32), SMS_TEMPLATES, "sms-price");
  const other = sandboxView(getSandbox("4".repeat(32)));
  assert.equal(other.alerts.length, 0);
  assert.equal(other.dataset.statement.length, loadFixtures().statement.length);
});

test("merchant names in messages map to the demo person's known merchants", () => {
  const dictionary = loadFixtures().dictionary;
  assert.equal(knownMerchant("GOOGLE*YOUTUBEPREM", dictionary)?.brand, "YouTube");
  assert.equal(knownMerchant("Netflix", dictionary)?.brand, "Netflix");
  assert.equal(knownMerchant("UPI/GYMFITLINE/9845128891", dictionary)?.brand, "FitLine Gym");
  assert.equal(knownMerchant("SWIGGY", dictionary), undefined);
});
