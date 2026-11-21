import type { NextConfig } from "next";

/**
 * Headers for every page and API answer, needed now that the app is reachable
 * on paytrace.co.in through the Cloudflare tunnel.
 */
const securityHeaders = [
  // Browsers remember to use HTTPS only. Ignored on plain http://localhost.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // No other site may show Paytrace inside a frame (stops click-jacking).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" }
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Lets `npm run dev` work when opened through the tunnel. The real public
  // setup uses the production build (npm run start:public), not dev.
  allowedDevOrigins: ["paytrace.co.in", "www.paytrace.co.in"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default nextConfig;
