/**
 * Was this email really sent by the domain in its From line? (DKIM and DMARC,
 * plan card G5.) Gmail checks every incoming email and records the result in an
 * "Authentication-Results: mx.google.com; dkim=pass header.i=@spotify.com ...;
 * dmarc=pass ... header.from=spotify.com" header. Only Google's own header is
 * trusted: a sender can add fake Authentication-Results lines of their own, but
 * they sit below Google's, and they never carry Google's name.
 *
 * Result: "pass" (DMARC passed, or a DKIM signature from the From domain),
 * "fail" (Gmail says the domain did not send it), or "unknown" (no verdict).
 * Only "fail" is dropped, so a missing header never hides a real receipt.
 */
type Header = { name: string; value: string };
export type SenderCheck = "pass" | "fail" | "unknown";

const GOOGLE = /^\s*mx\.google\.com\s*;/i;

/** The domain of a From header: "Spotify <no-reply@spotify.com>" → "spotify.com". */
export function fromDomain(from: string) {
  const match = from.match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\s*>?\s*$/);
  return match ? match[1].toLowerCase() : null;
}

/** True when one domain is the other or a subdomain of it (mail.spotify.com ↔ spotify.com). */
function aligned(a: string, b: string) {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export function senderAuthentication(headers: Header[] | undefined, from: string): SenderCheck {
  const domain = fromDomain(from);
  const verdict = headers?.find(h => h.name.toLowerCase() === "authentication-results" && GOOGLE.test(h.value))?.value;
  if (!domain || !verdict) return "unknown";
  const text = verdict.toLowerCase();
  const dmarc = text.match(/\bdmarc=(\w+)/)?.[1];
  if (dmarc === "pass") return "pass";
  const dkimDomains = [...text.matchAll(/\bdkim=pass\b[^;]*?header\.(?:i=@?|d=)([a-z0-9.-]+)/g)].map(m => m[1]);
  if (dkimDomains.some(d => aligned(d, domain))) return "pass";
  if (dmarc === "fail") return "fail";
  const dkim = text.match(/\bdkim=(\w+)/)?.[1], spf = text.match(/\bspf=(\w+)/)?.[1];
  if ((dkim === "fail" || dkim === "none" || dkim === undefined) && (spf === "fail" || spf === "softfail")) return "fail";
  return "unknown";
}
