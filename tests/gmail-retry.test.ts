/**
 * How long Gmail sync waits after Gmail says "slow down". The old sync waited
 * 1 and 2 seconds and then dropped the whole rescan; Gmail often asks for more.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { gmailRetryDelayMs } from "../server/accounts/sync";

const NOW = Date.parse("2026-11-21T12:00:00.000Z");

test("backs off 2, 4, 8 seconds when Gmail gives no time", () => {
  assert.equal(gmailRetryDelayMs(0, null, {}, NOW, 0.5), 2000);
  assert.equal(gmailRetryDelayMs(1, null, {}, NOW, 0.5), 4000);
  assert.equal(gmailRetryDelayMs(2, null, {}, NOW, 0.5), 8000);
});

test("waits as long as the Retry-After header asks", () => {
  assert.equal(gmailRetryDelayMs(0, "45", {}, NOW, 0.5), 45000);
});

test("waits until the time written in Gmail's error text", () => {
  const body = { error: { message: "User-rate limit exceeded.  Retry after 2026-11-21T12:01:30.000Z" } };
  assert.equal(gmailRetryDelayMs(0, null, body, NOW, 0.5), 90000);
});

test("stops when Gmail asks for longer than one sync should wait", () => {
  const body = { error: { message: "User-rate limit exceeded.  Retry after 2026-11-21T12:10:00.000Z" } };
  assert.equal(gmailRetryDelayMs(0, null, body, NOW, 0.5), null);
  assert.equal(gmailRetryDelayMs(0, "600", {}, NOW, 0.5), null);
});

test("jitter spreads retries so two devices do not retry in step", () => {
  assert.equal(gmailRetryDelayMs(0, null, {}, NOW, 0), 1500);
  assert.equal(gmailRetryDelayMs(0, null, {}, NOW, 1), 2500);
});
