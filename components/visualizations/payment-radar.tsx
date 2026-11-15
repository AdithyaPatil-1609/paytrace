/**
 * The live radar on the All payments screen.
 *
 * Every recurring payment is a blip. The ones that need a look sit on the
 * inner ring in danger red; everything else sits further out in cream. A
 * beam sweeps round and each blip flares as the beam passes it. Each blip
 * is a button that opens that payment, so the radar is a way in, not
 * decoration. The sweep is CSS only and stops for reduced motion.
 */
import type { CSSProperties } from "react";
import { warningLabel } from "@/components/chrome/warning-tag";
import { formatINR } from "@/lib/presentation/format";
import type { Commitment } from "@/lib/payments/types";

/** One turn of the beam. Blip timing is derived from it, so they stay in step. */
const SWEEP_SECONDS = 6;
const GOLDEN_ANGLE = 137.508;

type Blip = { item: Commitment; flagged: boolean; angle: number; radius: number };

/** Problems spread evenly round the inner ring, the rest round two outer rings. */
function placeBlips(items: Commitment[], flagged: Set<string>): Blip[] {
  const inner = items.filter((item) => flagged.has(item.id));
  const outer = items.filter((item) => !flagged.has(item.id));
  return [
    ...inner.map((item, index) => ({
      item,
      flagged: true,
      angle: (35 + (index * 360) / Math.max(inner.length, 1)) % 360,
      radius: index % 2 ? 0.5 : 0.58
    })),
    ...outer.map((item, index) => ({
      item,
      flagged: false,
      angle: (12 + index * GOLDEN_ANGLE) % 360,
      radius: [0.72, 0.84, 0.94][index % 3]
    }))
  ];
}

function blipLabel({ item, flagged }: Blip) {
  const warning = flagged ? warningLabel(item.kind) : undefined;
  return `${item.merchant}${warning ? `, ${warning.toLowerCase()}` : ""}, ${formatINR(item.annualCost)} a year`;
}

export function PaymentRadar({
  items,
  flagged,
  onOpen
}: {
  items: Commitment[];
  flagged: Set<string>;
  onOpen: (id: string) => void;
}) {
  const blips = placeBlips(items, flagged);
  const debits = items.reduce((sum, item) => sum + item.evidenceRows.length, 0);
  const count = blips.filter((blip) => blip.flagged).length;

  return (
    <figure className="radar" aria-label={`Payment radar: ${count} of ${items.length} payments need a look`}>
      <div className="radar-top">
        <span className="radar-live">
          <i aria-hidden="true" />
          LIVE SCAN
        </span>
        <span>{items.length} AUTOPAYS</span>
      </div>

      <div className="radar-scope">
        <div className="radar-rings" aria-hidden="true" />
        <div className="radar-sweep" aria-hidden="true" />
        <div className="radar-center">
          <span>PAYMENT SCAN</span>
          <strong>{String(count).padStart(2, "0")}</strong>
          <em className={count ? "radar-alarm" : undefined}>
            {count ? (count === 1 ? "NEEDS A LOOK" : "NEED A LOOK") : "ALL CLEAR"}
          </em>
        </div>
        {blips.map((blip) => {
          const radians = (blip.angle * Math.PI) / 180;
          // Rounded, because server and browser trig can differ in the last digit.
          const style = {
            "--x": `${(50 + blip.radius * 50 * Math.sin(radians)).toFixed(2)}%`,
            "--y": `${(50 - blip.radius * 50 * Math.cos(radians)).toFixed(2)}%`,
            // Negative, so every blip is already mid-cycle and flares exactly as the beam reaches it.
            "--delay": `${((blip.angle / 360 - 1) * SWEEP_SECONDS).toFixed(3)}s`
          } as CSSProperties;
          const label = blipLabel(blip);
          // Labels open away from the nearer edge, so they never spill off the panel.
          const side = Math.sin(radians) > 0.35 ? " opens-left" : Math.sin(radians) < -0.35 ? " opens-right" : "";
          return (
            <button
              key={blip.item.id}
              type="button"
              className={`radar-blip${blip.flagged ? " is-flagged" : ""}${side}`}
              style={style}
              aria-label={`${label}. Open details.`}
              data-label={label}
              onClick={() => onOpen(blip.item.id)}
            >
              <i aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <figcaption>
        <span>{debits} DEBITS READ</span>
        <span className="radar-key">
          <i className="key-flagged" aria-hidden="true" /> NEEDS A LOOK
          <i className="key-other" aria-hidden="true" /> OTHER
        </span>
      </figcaption>
    </figure>
  );
}
