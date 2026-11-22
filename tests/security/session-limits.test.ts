/**
 * Sign-in sessions must end within a day, and sooner when nobody uses them.
 * This test stops anyone raising the limits back to multi-day sessions by accident.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SESSION_IDLE_SECONDS, SESSION_ROTATE_SECONDS, SESSION_SECONDS } from "../../server/accounts/security";

const DAY = 24 * 60 * 60;

test("a session ends within 24 hours of sign-in", () => {
  assert.ok(SESSION_SECONDS <= DAY, `session lasts ${SESSION_SECONDS / 3600} hours`);
});

test("an unused session ends sooner than its full lifetime", () => {
  assert.ok(SESSION_IDLE_SECONDS > 0 && SESSION_IDLE_SECONDS < SESSION_SECONDS);
});

test("tokens are replaced before the session ends", () => {
  assert.ok(SESSION_ROTATE_SECONDS < SESSION_SECONDS);
});
