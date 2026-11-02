/**
 * The page background: a slow 3D field of nodes and edges, in the palette.
 *
 * It is the evidence graph as texture, not as data — the real graph is on
 * Screen 00. The field turns on its own, tilts toward the pointer, and lights
 * the nodes near it. Plain canvas with a perspective projection, no 3D library.
 * It stops when the tab is hidden and holds one still frame for anyone who
 * prefers reduced motion.
 */
"use client";

import { useEffect, useRef } from "react";

type Node = { x: number; y: number; z: number; r: number; color: string };

const NODE_COUNT = 96;
const LINK_DISTANCE = 0.48; // in the unit cube's coordinates
const PALETTE = ["--marigold", "--plum", "--ember", "--sage", "--ink-faint"];

/** Seeded, so the field is the same shape on every load and in every screenshot. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function rgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const n = parseInt(value.length === 3 ? value.replace(/./g, "$&$&") : value, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function GraphBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;

    const styles = getComputedStyle(document.documentElement);
    const colors = PALETTE.map((name) => styles.getPropertyValue(name).trim() || "#8a7d92");
    const ink = styles.getPropertyValue("--ink-soft").trim() || "#5c4a66";

    const next = random(20261022);
    const nodes: Node[] = Array.from({ length: NODE_COUNT }, (_, index) => ({
      x: next() * 2 - 1,
      y: next() * 2 - 1,
      z: next() * 2 - 1,
      r: 2.2 + next() * 3.4,
      // Mostly marigold and faint ink, with the accents used sparingly.
      color: colors[index % 7 === 0 ? 2 : index % 5 === 0 ? 1 : index % 3 === 0 ? 3 : index % 2 === 0 ? 0 : 4]
    }));
    // Rotation keeps distances, so the edges are found once.
    const edges: [number, number][] = [];
    nodes.forEach((a, i) => {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j];
        if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < LINK_DISTANCE) edges.push([i, j]);
      }
    });

    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let spin = 0.6;
    const tilt = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const pointer = { x: -1e4, y: -1e4 };

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      element!.width = Math.round(width * ratio);
      element!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      // Resizing clears the canvas; a still or hidden page has no next frame to repaint it.
      if (still.matches || document.hidden) draw();
    }

    function draw() {
      context!.clearRect(0, 0, width, height);
      // On a phone the field sits behind body text, so it steps back further.
      const quiet = width < 700 ? 0.5 : 1;
      const scale = Math.min(Math.max(width, height) * 0.36, 620);
      const cx = width * 0.62;
      const cy = height * 0.52;
      const yaw = spin + tilt.x;
      const pitch = 0.35 + tilt.y;
      const [sy, cyaw] = [Math.sin(yaw), Math.cos(yaw)];
      const [sp, cp] = [Math.sin(pitch), Math.cos(pitch)];

      const projected = nodes.map((node) => {
        const x1 = node.x * cyaw - node.z * sy;
        const z1 = node.x * sy + node.z * cyaw;
        const y1 = node.y * cp - z1 * sp;
        const z2 = node.y * sp + z1 * cp;
        const depth = 2.6 / (2.6 + z2); // nearer is larger
        const px = cx + x1 * scale * depth;
        const py = cy + y1 * scale * depth;
        const near = Math.max(0, 1 - Math.hypot(px - pointer.x, py - pointer.y) / 170);
        return { px, py, depth, near, z: z2 };
      });

      context!.lineWidth = 1;
      for (const [i, j] of edges) {
        const a = projected[i];
        const b = projected[j];
        const alpha = 0.07 + 0.13 * Math.min(a.depth, b.depth) + 0.3 * Math.max(a.near, b.near);
        context!.strokeStyle = rgba(ink, Math.min(alpha, 0.42) * quiet);
        context!.beginPath();
        context!.moveTo(a.px, a.py);
        context!.lineTo(b.px, b.py);
        context!.stroke();
      }

      // Back to front, so nearer nodes sit on top.
      projected
        .map((point, index) => ({ point, node: nodes[index] }))
        .sort((a, b) => b.point.z - a.point.z)
        .forEach(({ point, node }) => {
          if (point.near > 0.15) {
            context!.strokeStyle = rgba(node.color, 0.35 * point.near);
            context!.beginPath();
            context!.moveTo(point.px, point.py);
            context!.lineTo(pointer.x, pointer.y);
            context!.stroke();
          }
          const radius = node.r * point.depth * (1 + point.near * 0.9);
          context!.fillStyle = rgba(node.color, (0.26 + 0.28 * point.depth + 0.4 * point.near) * quiet);
          context!.beginPath();
          context!.arc(point.px, point.py, radius, 0, Math.PI * 2);
          context!.fill();
        });
    }

    function tick() {
      spin += 0.0009;
      tilt.x += (target.x - tilt.x) * 0.04;
      tilt.y += (target.y - tilt.y) * 0.04;
      draw();
      frame = requestAnimationFrame(tick);
    }

    function start() {
      cancelAnimationFrame(frame);
      if (still.matches || document.hidden) draw();
      else frame = requestAnimationFrame(tick);
    }

    function onPointer(event: PointerEvent) {
      if (still.matches) return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      target.x = (event.clientX / width - 0.5) * 0.7;
      target.y = (event.clientY / height - 0.5) * 0.45;
    }

    function onLeave() {
      pointer.x = -1e4;
      pointer.y = -1e4;
      target.x = 0;
      target.y = 0;
    }

    resize();
    start();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", start);
    still.addEventListener("change", start);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", start);
      still.removeEventListener("change", start);
    };
  }, []);

  return <canvas ref={canvas} className="graph-backdrop" aria-hidden="true" />;
}
