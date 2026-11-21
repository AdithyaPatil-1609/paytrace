/**
 * Cross-site request check (CSRF) for the browser-only POST routes that also
 * serve the open demo: Ask AI, Simulate and Challenge.
 * Browsers mark every request with Sec-Fetch-Site and, on POST, Origin.
 * A request another website makes a visitor's browser send is refused.
 * Non-browser clients send neither header and cannot ride on a visitor's
 * cookies, so they are left to the request limits.
 */
import { accountConfig } from "@/lib/accounts/security";

/** The configured public address, or null on a local demo without accounts. */
function configuredOrigin() {
  try {
    return accountConfig().origin;
  } catch {
    return null;
  }
}

export function fromOurSite(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return !site || site === "same-origin";
  const expected = configuredOrigin();
  if (expected) return origin === expected;
  // Local demo: the page and the API share one host.
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export function forbidden() {
  return Response.json(
    { error: "This request must come from the Paytrace site." },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  );
}
