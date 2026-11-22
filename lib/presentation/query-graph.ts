/**
 * Turns the rows a graph query returned into a small node-and-relationship
 * picture, so a person sees what Neo4j found instead of only the Cypher.
 * Pure functions: the same rows always give the same drawing (tested).
 */
import type { Evidence, QueryRun } from "@/db/neo4j/warnings";
import type { SimilarLink } from "@/db/neo4j/merchant-links";
import type { Corroborated, TrustRow } from "@/db/neo4j/evidence-trust";
import { TRUST_LABEL, type SourceTrust } from "@/lib/ingestion/trust";

export type NodeKind = "you" | "merchant" | "event" | "channel" | "trust" | "payment";
export type Tone = "ok" | "review" | "muted" | "plain";
export type GraphNode = { id: string; label: string; caption?: string; kind: NodeKind; col: number; tone?: Tone };
export type GraphEdge = { from: string; to: string; label: string; title: string; tone: Tone };
export type QueryGraph = { nodes: GraphNode[]; edges: GraphEdge[]; more: number };

export const GRAPH_LIMITS = { merchants: 6, eventsPerMerchant: 3, payments: 6, similar: 8 } as const;

const words = (value: string) => value.replaceAll("_", " ");
const trustTone = (trust: string): Tone => trust === "unverified" || trust === "legacy" ? "muted" : "ok";
export const trustName = (level: string) => level === "legacy" ? "Older record, not verified" : TRUST_LABEL[level as SourceTrust] ?? words(level);

function eventNode(e: Evidence, col: number): GraphNode {
  return { id: `e:${e.id}`, label: `${e.source.toUpperCase()} · ${words(e.kind)}`, caption: `${e.date} · ${TRUST_LABEL[e.sourceTrust] ?? e.sourceTrust}`, kind: "event", col, tone: trustTone(e.sourceTrust) };
}

/** Warning queries: (you)-[:RECEIVED]->(message)-[:ABOUT]->(merchant), or (you)-[:HAS_PAYMENT]->()-[:PAID_TO]->(merchant) when no message is involved. */
export function recordsGraph(records: QueryRun["records"]): QueryGraph {
  if (!records.length) return { nodes: [], edges: [], more: 0 };
  const byMerchant = new Map<string, Evidence[]>();
  for (const record of records) {
    const list = byMerchant.get(record.merchant) ?? [];
    for (const e of record.evidence) if (!list.some((x) => x.id === e.id)) list.push(e);
    byMerchant.set(record.merchant, list);
  }
  const merchants = [...byMerchant.keys()];
  const shown = merchants.slice(0, GRAPH_LIMITS.merchants);
  const anyEvidence = shown.some((m) => (byMerchant.get(m) ?? []).length > 0);
  const merchantCol = anyEvidence ? 2 : 1;
  const nodes: GraphNode[] = [{ id: "you", label: "You", kind: "you", col: 0 }];
  const edges: GraphEdge[] = [];
  let more = merchants.length - shown.length;
  for (const merchant of shown) {
    const id = `m:${merchant}`;
    nodes.push({ id, label: merchant, kind: "merchant", col: merchantCol });
    const evidence = byMerchant.get(merchant) ?? [];
    if (!evidence.length) {
      edges.push({ from: "you", to: id, label: "PAID_TO", title: "(you)-[:HAS_PAYMENT]->(payment)-[:PAID_TO]->(merchant)", tone: "plain" });
      continue;
    }
    for (const e of evidence.slice(0, GRAPH_LIMITS.eventsPerMerchant)) {
      if (!nodes.some((n) => n.id === `e:${e.id}`)) {
        nodes.push(eventNode(e, 1));
        edges.push({ from: "you", to: `e:${e.id}`, label: "RECEIVED", title: "(you)-[:RECEIVED]->(message)", tone: "plain" });
      }
      edges.push({ from: `e:${e.id}`, to: id, label: "ABOUT", title: "(message)-[:ABOUT]->(merchant)", tone: trustTone(e.sourceTrust) });
    }
    more += Math.max(0, evidence.length - GRAPH_LIMITS.eventsPerMerchant);
  }
  return { nodes, edges, more };
}

/** (merchant)-[:SIMILAR {score}]->(merchant). Confirmed links are solid, ones to review dashed, rejected faded. */
export function similarGraph(links: SimilarLink[]): QueryGraph {
  const shown = links.slice(0, GRAPH_LIMITS.similar);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const place = (m: SimilarLink["a"], col: number) => {
    const id = `m:${m.id}`;
    if (!nodes.some((n) => n.id === id)) nodes.push({ id, label: m.name, caption: `${m.payments} ${m.payments === 1 ? "payment" : "payments"}`, kind: "merchant", col });
    return id;
  };
  for (const link of shown) {
    const a = place(link.a, 0), b = place(link.b, 1);
    const tone: Tone = link.status === "confirmed" ? "ok" : link.status === "rejected" ? "muted" : "review";
    const status = link.status === "candidate" ? "to review" : link.status;
    edges.push({ from: a, to: b, label: `SIMILAR ${link.score.toFixed(2)}`, title: `${words(link.method)}, ${status}. ${link.reason}`, tone });
  }
  return { nodes, edges, more: links.length - shown.length };
}

/** Channel → trust level, labelled with how many stored records sit at that level. */
export function trustGraph(rows: TrustRow[]): QueryGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const row of rows) {
    const c = `c:${row.source}`, t = `t:${row.trust}`;
    if (!nodes.some((n) => n.id === c)) nodes.push({ id: c, label: row.source.toUpperCase(), kind: "channel", col: 0 });
    if (!nodes.some((n) => n.id === t)) nodes.push({ id: t, label: trustName(row.trust), kind: "trust", col: 1, tone: trustTone(row.trust) });
    edges.push({ from: c, to: t, label: `${row.events} ${row.events === 1 ? "record" : "records"}`, title: `${row.events} ${row.source} records are ${trustName(row.trust).toLowerCase()}`, tone: trustTone(row.trust) });
  }
  return { nodes, edges, more: 0 };
}

/** (payment)-[:EVIDENCED_BY]->(message) from two or more channels. */
export function corroboratedGraph(list: Corroborated[], rupees: (paise: number) => string): QueryGraph {
  const shown = list.slice(0, GRAPH_LIMITS.payments);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const p of shown) {
    const id = `p:${p.id}`;
    nodes.push({ id, label: p.merchant, caption: `${rupees(p.amountPaise)} · ${p.date}`, kind: "payment", col: 0 });
    for (const e of p.evidence) {
      if (!nodes.some((n) => n.id === `e:${e.id}`)) nodes.push(eventNode(e, 1));
      edges.push({ from: id, to: `e:${e.id}`, label: "EVIDENCED_BY", title: "(payment)-[:EVIDENCED_BY]->(message)", tone: trustTone(e.sourceTrust) });
    }
  }
  return { nodes, edges, more: list.length - shown.length };
}

export const LAYOUT = { width: 760, narrowWidth: 600, nodeWidth: 184, nodeHeight: 44, rowGap: 64, pad: 24 } as const;
export type Placed = GraphNode & { x: number; y: number };
export type Routed = GraphEdge & { path: string; lx: number; ly: number };

/** Columns left to right, nodes spread evenly down each column, curved edges with a label at the middle. */
export function layoutGraph(graph: QueryGraph) {
  const { nodeWidth, nodeHeight, rowGap, pad } = LAYOUT;
  const cols = Math.max(1, ...graph.nodes.map((n) => n.col + 1));
  // A narrower canvas for one or two columns keeps the text near its real size in a narrow panel.
  const width = cols >= 3 ? LAYOUT.width : LAYOUT.narrowWidth;
  const perCol = Array.from({ length: cols }, (_, c) => graph.nodes.filter((n) => n.col === c));
  const tallest = Math.max(1, ...perCol.map((list) => list.length));
  const height = pad * 2 + Math.max(tallest * rowGap, nodeHeight + 40);
  const xOf = (col: number) => cols === 1 ? width / 2 : pad + nodeWidth / 2 + col * (width - 2 * pad - nodeWidth) / (cols - 1);
  const placed: Placed[] = perCol.flatMap((list, col) => list.map((n, i) => ({ ...n, x: xOf(col), y: pad + (i + 0.5) * (height - 2 * pad) / list.length })));
  const at = new Map(placed.map((n) => [n.id, n]));
  const half = nodeWidth / 2;
  const routed: Routed[] = graph.edges.flatMap((e) => {
    const a = at.get(e.from), b = at.get(e.to);
    if (!a || !b) return [];
    if (a.col === b.col) {
      const x = a.x + half, bend = x + 80;
      return [{ ...e, path: `M${x},${a.y} C${bend},${a.y} ${bend},${b.y} ${x},${b.y}`, lx: x + 60, ly: (a.y + b.y) / 2 }];
    }
    const [l, r] = a.x < b.x ? [a, b] : [b, a];
    const x1 = l.x + half, x2 = r.x - half, mid = (x1 + x2) / 2;
    const [s, t] = a.x < b.x ? [[x1, a.y], [x2, b.y]] : [[x2, a.y], [x1, b.y]];
    return [{ ...e, path: `M${s[0]},${s[1]} C${mid},${s[1]} ${mid},${t[1]} ${t[0]},${t[1]}`, lx: mid, ly: (a.y + b.y) / 2 }];
  });
  return { width, height, nodes: placed, edges: routed };
}

/** Long names are cut for the drawing; the full name stays in the tooltip and the list below it. */
export function shorten(text: string, max = 21) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
