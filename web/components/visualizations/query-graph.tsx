"use client";
/**
 * Draws what one graph query found as nodes and relationships (SVG, no extra
 * library). The layout comes from server/presentation/query-graph.ts; this file
 * only paints it, with the full names and relationship paths in tooltips.
 */
import { useId } from "react";
import { LAYOUT, layoutGraph, shorten, type QueryGraph as Graph } from "@/server/presentation/query-graph";

export function QueryGraph({ graph, label }: { graph: Graph; label: string }) {
  const marker = useId().replaceAll(":", "");
  if (!graph.nodes.length) return null;
  const { width, height, nodes, edges } = layoutGraph(graph);
  const w = LAYOUT.nodeWidth, h = LAYOUT.nodeHeight;
  return <figure className="query-graph">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${nodes.length} nodes and ${edges.length} relationships`}>
      <defs>
        <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="query-graph-arrow"/>
        </marker>
      </defs>
      {edges.map((e, i) => <g key={`${e.from}-${e.to}-${i}`} className={`query-graph-edge tone-${e.tone}`}>
        <title>{e.title}</title>
        <path d={e.path} markerEnd={`url(#${marker})`}/>
        <text x={e.lx} y={e.ly} textAnchor="middle" dominantBaseline="middle">{e.label}</text>
      </g>)}
      {nodes.map((n) => <g key={n.id} className={`query-graph-node kind-${n.kind}${n.tone ? ` tone-${n.tone}` : ""}`}>
        <title>{n.caption ? `${n.label} · ${n.caption}` : n.label}</title>
        <rect x={n.x - w / 2} y={n.y - h / 2} width={w} height={h} rx={n.kind === "you" ? h / 2 : 10}/>
        <text x={n.x} y={n.caption ? n.y - 5 : n.y} textAnchor="middle" dominantBaseline="middle" className="query-graph-label">{shorten(n.label)}</text>
        {n.caption && <text x={n.x} y={n.y + 12} textAnchor="middle" dominantBaseline="middle" className="query-graph-caption">{shorten(n.caption, 30)}</text>}
      </g>)}
    </svg>
    {graph.more > 0 && <figcaption>{graph.more} more not drawn; all are listed below.</figcaption>}
  </figure>;
}
