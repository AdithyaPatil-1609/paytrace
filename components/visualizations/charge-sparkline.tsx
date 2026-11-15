/**
 * A small line of one payment's recorded charges, oldest to newest, so a
 * price rise or a gap is visible in the list itself. Danger red only when
 * the row is flagged.
 */
import { formatINR } from "@/lib/presentation/format";
import type { EvidenceRow } from "@/lib/payments/types";

const WIDTH = 168;
const HEIGHT = 34;
const PAD = 4;
const MAX_POINTS = 8;

export function ChargeSparkline({ rows, flagged }: { rows: EvidenceRow[]; flagged: boolean }) {
  const points = [...rows].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_POINTS);
  if (points.length < 2) return <span className="charge-spark is-empty" aria-hidden="true" />;

  const amounts = points.map((row) => row.amount);
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  const step = (WIDTH - PAD * 2) / (points.length - 1);
  // A flat line sits in the middle; any change uses the full height.
  const y = (amount: number) =>
    high === low ? HEIGHT / 2 : HEIGHT - PAD - ((amount - low) / (high - low)) * (HEIGHT - PAD * 2);
  const coords = points.map((row, index) => [PAD + index * step, y(row.amount)] as const);
  const first = amounts[0];
  const last = amounts[amounts.length - 1];

  return (
    <svg
      className={flagged ? "charge-spark is-flagged" : "charge-spark"}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Last ${points.length} charges: ${first === last ? `steady at ${formatINR(last)}` : `${formatINR(first)} to ${formatINR(last)}`}`}
    >
      <line x1={PAD} x2={WIDTH - PAD} y1={HEIGHT - 1} y2={HEIGHT - 1} className="spark-base" />
      <polyline points={coords.map(([x, py]) => `${x},${py}`).join(" ")} />
      {coords.map(([x, py], index) => (
        <circle key={index} cx={x} cy={py} r={index === coords.length - 1 ? 2.6 : 1.6} />
      ))}
    </svg>
  );
}
