/** The preview picture shown when a PayTrace link is shared (1200 × 630). */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = SITE.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const mark = await readFile(path.join(process.cwd(), "public/brand/paytrace-mark.svg"));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f6f1e7", color: "#1c1a17" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* ImageResponse embeds local artwork directly in the share card. */}
          <img src={`data:image/svg+xml;base64,${mark.toString("base64")}`} width={84} height={84} alt="" />
          <div style={{ display: "flex", fontSize: 60, fontWeight: 700, letterSpacing: -2 }}>
            <span style={{ color: "#1E2A6E" }}>Pay</span><span style={{ color: "#4A5BE0" }}>Trace</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>See every auto debit clearly.</div>
          <div style={{ fontSize: 32, marginTop: 28, color: "#4b463f" }}>UPI AutoPay · card mandates · eNACH · subscriptions</div>
        </div>
        <div style={{ fontSize: 26, color: "#4b463f" }}>paytrace.co.in</div>
      </div>
    ),
    size
  );
}
