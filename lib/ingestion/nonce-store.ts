/**
 * Remembers the one-use number (nonce) of every signed phone request for ten
 * minutes, so the same request sent again (a replay) is refused.
 * One server process on the laptop, so memory is enough; with several servers
 * this moves to Redis (SET key NX PX 600000).
 */
import { DEVICE_LIMITS } from "@/lib/payments/rules";

const seen = new Map<string, number>();

/** True the first time a device uses this nonce; false for a replay. */
export function claimNonce(deviceId: string, nonce: string, now = Date.now()) {
  const key = `${deviceId}:${nonce}`;
  const until = seen.get(key);
  if (until !== undefined && until > now) return false;
  seen.set(key, now + DEVICE_LIMITS.nonceMemoryMs);
  if (seen.size > DEVICE_LIMITS.maxRememberedNonces) forgetOld(now);
  return true;
}

function forgetOld(now: number) {
  for (const [key, until] of seen) if (until <= now) seen.delete(key);
  // Still full: drop the oldest. Their time window has almost closed, so the
  // clock check still refuses a replay of them.
  while (seen.size > DEVICE_LIMITS.maxRememberedNonces) seen.delete(seen.keys().next().value!);
}

/** Test helper. */
export function resetNonces() {
  seen.clear();
}
