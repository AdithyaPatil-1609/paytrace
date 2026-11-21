/**
 * The two pictures at the top of the payment drawer: how the price moved
 * over time, and the chain of records that proves the payment repeats
 * (statement debits, the SMS or email about it, and the mandate behind it).
 * Both are drawn only from the records; nothing here is estimated.
 */
import { formatCompactINR, formatDate, formatINR } from "@/lib/presentation/format";
import type { Commitment } from "@/lib/payments/types";

const W = 320;
const H = 150;
const LEFT = 40;
const RIGHT = 8;
const TOP = 10;
const BOTTOM = 24;

function month(value: string) {
  return new Date(Date.parse(value)).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
}

export function PriceHistory({ item, flagged }: { item: Commitment; flagged: boolean }) {
  const points = item.priceSeries.length ? item.priceSeries : item.evidenceRows.map(({ date, amount }) => ({ date, amount }));
  if (points.length < 2) {
    return (
      <section className="drawer-block" aria-labelledby="price-history-title">
        <h3 id="price-history-title">Price history</h3>
        <p className="drawer-note">Only one charge so far, so there is no history to draw yet.</p>
      </section>
    );
  }

  const amounts = points.map((point) => point.amount);
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  // Pad the scale so a flat line sits in the middle, not on the floor.
  const floor = high === low ? low * 0.8 : Math.max(0, low - (high - low) * 0.25);
  const ceil = high === low ? high * 1.2 : high + (high - low) * 0.15;
  const x = (index: number) => LEFT + (index / (points.length - 1)) * (W - LEFT - RIGHT);
  const y = (amount: number) => TOP + (1 - (amount - floor) / (ceil - floor)) * (H - TOP - BOTTOM);
  const line = points.map((point, index) => `${x(index).toFixed(1)},${y(point.amount).toFixed(1)}`).join(" ");
  const area = `${LEFT},${H - BOTTOM} ${line} ${x(points.length - 1).toFixed(1)},${H - BOTTOM}`;
  const grid = [0, 0.5, 1].map((share) => floor + share * (ceil - floor));
  const rises = points
    .map((point, index) => ({ point, index }))
    .filter(({ point, index }) => index > 0 && point.amount > points[index - 1].amount && item.amountPattern !== "variable");
  const labelEvery = Math.max(1, Math.ceil(points.length / 5));

  const firstRise = rises[0];
  const summary =
    item.amountPattern === "variable"
      ? `Changes with use: between ${formatINR(low)} and ${formatINR(high)} across ${points.length} charges.`
      : firstRise
        ? `Went from ${formatINR(points[firstRise.index - 1].amount)} to ${formatINR(firstRise.point.amount)} on ${formatDate(firstRise.point.date)}. ${
            item.hasPriceChangeNotice ? "A price-change notice was found." : "No price-change notice was found."
          }`
        : `Steady at ${formatINR(high)} across ${points.length} charges.`;

  return (
    <section className="drawer-block" aria-labelledby="price-history-title">
      <h3 id="price-history-title">Price history</h3>
      <svg
        className={`price-chart${flagged ? " is-flagged" : ""}`}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Price history. ${summary}`}
      >
        {grid.map((value) => (
          <g key={value}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(value)} y2={y(value)} className="price-grid" />
            <text x={LEFT - 6} y={y(value) + 3.5} textAnchor="end" className="price-axis">
              {formatCompactINR(value)}
            </text>
          </g>
        ))}
        <polygon points={area} className="price-area" />
        <polyline points={line} className="price-line" />
        {rises.map(({ point, index }) => (
          <circle key={point.date} cx={x(index)} cy={y(point.amount)} r={4.5} className="price-rise" />
        ))}
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].amount)} r={3.5} className="price-last" />
        {points.map((point, index) =>
          index % labelEvery === 0 || index === points.length - 1 ? (
            <text key={point.date} x={x(index)} y={H - 6} textAnchor="middle" className="price-axis">
              {month(point.date)}
            </text>
          ) : null
        )}
      </svg>
      <p className={`drawer-note${firstRise ? " is-warning" : ""}`}>{summary}</p>
    </section>
  );
}

type NodeKind = "statement" | "sms" | "email" | "none" | "mandate";
type Node = { kind: NodeKind; title: string; detail: string; tone?: "warning" | "muted" };

function NodeIcon({ kind }: { kind: NodeKind }) {
  if (kind === "sms") {
    return (
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3A2.5 2.5 0 0 1 3 11.5Z" fill="currentColor" />
        <path d="M7 8.5h6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "email") {
    return (
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <rect x="2.5" y="4.5" width="15" height="11" rx="1.6" fill="#fff" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3 5.5 10 11l7-5.5" fill="none" stroke="#c5221f" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "statement") return <span>₹</span>;
  if (kind === "none") return <span>–</span>;
  return null;
}

export function ProofChain({ item, flagged, live }: { item: Commitment; flagged: boolean; live: boolean }) {
  const latest = item.evidenceRows[item.evidenceRows.length - 1];
  const sms = item.notices.filter((notice) => notice.channel.toLowerCase() === "sms");
  const email = item.notices.filter((notice) => notice.channel.toLowerCase() !== "sms");
  const silentHike = item.signals.includes("silent_hike");
  const label = (text: string) => text.replaceAll("_", " ");

  const fromNotices = item.basis === "notices";
  const nodes: Node[] = [
    fromNotices
      ? {
          kind: "email",
          title: "Debit notices",
          detail: latest
            ? `${item.evidenceRows.length} notices · latest ${formatINR(latest.amount)} for ${formatDate(latest.date)} · no bank debit confirms it yet`
            : "No dated notice",
          tone: "muted"
        }
      : {
          kind: "statement",
          title: "Bank statement",
          detail: latest
            ? `${item.evidenceRows.length} debits · latest ${formatINR(latest.amount)} on ${formatDate(latest.date)}`
            : "No dated debit"
        }
  ];
  if (sms.length) nodes.push({ kind: "sms", title: "SMS alert", detail: `${sms.length} · ${label(sms[sms.length - 1].eventType)}` });
  if (email.length) nodes.push({ kind: "email", title: "Email notice", detail: `${email.length} · ${label(email[email.length - 1].eventType)}` });
  if (!item.notices.length) {
    nodes.push({
      kind: "none",
      title: "No SMS or email",
      detail: silentHike ? "No price-change message: that missing link is the warning" : "No message is linked",
      tone: silentHike ? "warning" : "muted"
    });
  }
  if (item.mandateRef) {
    nodes.push({
      kind: "mandate",
      title: "Mandate",
      detail: `${item.mandateRef} · ${item.mandateStatus ?? "status unknown"}`,
      tone: flagged ? "warning" : undefined
    });
  }

  return (
    <section className="drawer-block" aria-labelledby="proof-chain-title">
      <h3 id="proof-chain-title">{live ? "Neo4j evidence path" : "Evidence path"}</h3>
      <ol className="proof-chain">
        {nodes.map((node, index) => (
          <li
            key={node.title}
            className={[`node-${node.kind}`, node.tone ? `is-${node.tone}` : ""].join(" ").trim()}
            style={{ marginLeft: `${Math.min(index, 3) * 26}px` }}
          >
            <span className="proof-node" aria-hidden="true">
              <NodeIcon kind={node.kind} />
            </span>
            <div>
              <strong>{node.title}</strong>
              <span>{node.detail}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
