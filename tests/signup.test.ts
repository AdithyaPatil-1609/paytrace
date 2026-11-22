import test from "node:test";
import assert from "node:assert/strict";
import { cleanFullName } from "../lib/accounts/security";
import { toE164 } from "../lib/accounts/phone-number";
import { createFlow, authorizationUrl } from "../lib/accounts/google";

test("sign-up full names are checked", () => {
  assert.equal(cleanFullName("  Adhyay   Ravishankar "), "Adhyay Ravishankar");
  assert.equal(cleanFullName("अध्याय"), "अध्याय");
  assert.equal(cleanFullName("<script>"), null);
  assert.equal(cleanFullName("A"), null);
  assert.equal(cleanFullName(42), null);
});

test("phone numbers become E.164", () => {
  assert.equal(toE164("98765 43210"), "+919876543210");
  assert.equal(toE164("09876543210"), "+919876543210");
  assert.equal(toE164("+44 7700 900123"), "+447700900123");
  assert.equal(toE164("12345"), null);
  assert.equal(toE164("5876543210"), null);
});

test("'add another Gmail' lets the person pick any account; the normal link pins the sign-in one", () => {
  const env = { ...process.env };
  process.env.GOOGLE_WEB_CLIENT_ID = "id"; process.env.GOOGLE_WEB_CLIENT_SECRET = "s";
  process.env.PAYTRACE_AUTH_KEY = "a".repeat(64); process.env.PAYTRACE_APP_URL = "http://localhost:3000";
  try {
    const identity = { sub: "sub-1", session: "x".repeat(43) };
    const own = new URL(authorizationUrl(createFlow("link", identity, { signup: true }), "me@gmail.com"));
    assert.equal(own.searchParams.get("login_hint"), "me@gmail.com");
    assert.equal(own.searchParams.get("prompt"), "consent");
    const other = new URL(authorizationUrl(createFlow("link", identity, { signup: true, other: true }), "me@gmail.com"));
    assert.equal(other.searchParams.get("login_hint"), null);
    assert.equal(other.searchParams.get("prompt"), "select_account consent");
    // A sign-in flow never carries "other", and a link flow never carries a typed name.
    assert.equal(createFlow("login", undefined, { other: true }).other, undefined);
    assert.equal(createFlow("link", identity, { fullName: "X Y" }).fullName, undefined);
  } finally { process.env = env; }
});
