import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/ingest/sms/route";

const CODE = "test-pairing-code-123";
const URL = "http://localhost/api/ingest/sms";

function send(body: string, code?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (code) headers["x-paytrace-device"] = code;
  return POST(new Request(URL, { method: "POST", headers, body }));
}

const event = JSON.stringify({ source: "sms", kind: "debit_posted", merchant: "DEMOFLIX", amountPaise: 19900, date: "2026-11-15", reference: "7712003344" });

test("ingest/sms refuses a request without the pairing code", async () => {
  process.env.PAYTRACE_DEVICE_CODE = CODE;
  assert.equal((await send(event)).status, 401);
});

test("ingest/sms refuses a wrong pairing code", async () => {
  process.env.PAYTRACE_DEVICE_CODE = CODE;
  assert.equal((await send(event, "wrong-code")).status, 401);
});

test("ingest/sms refuses everything when no code is configured", async () => {
  delete process.env.PAYTRACE_DEVICE_CODE;
  assert.equal((await send(event, CODE)).status, 401);
});

test("ingest/sms refuses a message that is too large", async () => {
  process.env.PAYTRACE_DEVICE_CODE = CODE;
  assert.equal((await send("x".repeat(2001), CODE)).status, 413);
});

test("ingest/sms refuses text that is not JSON", async () => {
  process.env.PAYTRACE_DEVICE_CODE = CODE;
  assert.equal((await send("not json", CODE)).status, 400);
});

test("ingest/sms accepts a made-up event from the paired phone", async () => {
  process.env.PAYTRACE_DEVICE_CODE = CODE;
  const response = await send(event, CODE);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});
