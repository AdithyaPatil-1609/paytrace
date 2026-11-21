import type { NextConfig } from "next";

/**
 * Headers for every page and API answer, needed now that the app is reachable
 * on paytrace.co.in through the Cloudflare tunnel.
 */
/**
 * Next.js puts small inline scripts in every page to start React, so scripts
 * need 'unsafe-inline' until we move to per-request nonces (logged in
 * docs/security/REMEDIATION.md). Every other source is locked to this site.
 * The dev server also needs 'unsafe-eval' for hot reload; production does not.
 */
function contentSecurityPolicy() {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'"
    // No upgrade-insecure-requests: it would break `next start` on
    // http://localhost. HSTS and Cloudflare's Always Use HTTPS cover the domain.
  ].join("; ");
}

const securityHeaders = [
  // Browsers remember to use HTTPS only. Ignored on plain http://localhost.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Content Security Policy: only our own scripts, styles, images and API
  // calls, plus Google Fonts; forms may post only to us and Google sign-in.
  // No other site may show Paytrace inside a frame (stops click-jacking).
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Keeps other sites' windows from scripting ours through window.opener.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" }
];

/** API answers hold personal data: never cached by the browser or Cloudflare. */
const apiHeaders = [{ key: "Cache-Control", value: "no-store, max-age=0" }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Lets `npm run dev` work when opened through the tunnel. The real public
  // setup uses the production build (npm run start:public), not dev.
  allowedDevOrigins: ["paytrace.co.in", "www.paytrace.co.in"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: apiHeaders }
    ];
  },
  // Google sign-in accepts one address (PAYTRACE_APP_URL). Send www visitors
  // to it, or "Continue with Google" answers Forbidden on www.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.paytrace.co.in" }],
        destination: "https://paytrace.co.in/:path*",
        permanent: true
      }
    ];
  }
};

export default nextConfig;
