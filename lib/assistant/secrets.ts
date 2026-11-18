/**
 * The secret filter: a message holding an OTP, PIN or password must never
 * reach a model. A word-for-word port of has_secret in ml/alerts.py (prompt
 * v2), checked against the same cases in tests/assistant.test.ts.
 *
 * Standard warnings ("never share your OTP") are removed first. What is left
 * is dropped if it still names a secret AND holds a standalone 4-8 digit code.
 * When unsure, drop: losing a message is better than sending an OTP anywhere.
 */
const WARNING = /\b(?:never|do not|don't|dont)\s+share\b[^.!]*/gi;
// Amounts are not codes: "Rs 1499", "INR 2000.00", "₹ 1,500".
const AMOUNT = /(?:\brs\.?|\binr|₹)\s*[\d,]+(?:\.\d+)?/gi;
const SECRET_WORD = /\b(?:otp|one[- ]time password|pin|password|passcode|cvv)\b/i;
// Not part of a masked account (XX9912, **9912), a date (11-11-2026) or an amount (1500.00).
const CODE = /(?<![\w*/.,-])\d{4,8}(?![\w/,-]|\.\d)/;

export function hasSecret(message: string) {
  const rest = message.replace(WARNING, " ").replace(AMOUNT, " ");
  return SECRET_WORD.test(rest) && CODE.test(rest);
}
