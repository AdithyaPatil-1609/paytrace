/**
 * The page background: a 3D globe of linked nodes, a ring of gold coins
 * orbiting it, and drifting particles at different depths.
 *
 * It is the evidence graph as texture, not as data; the real graph is on
 * Screen 05. The globe turns on its own and tilts toward the pointer; nodes
 * in front are larger and glow, nodes behind fade. Coins pass in front of
 * the globe and behind it. Plain canvas with a perspective projection, no
 * 3D library. No red: on this page dark red means a problem.
 *
 * It stops when the tab is hidden, holds one still frame for anyone who
 * prefers reduced motion, and steps back on narrow screens.
 */
"use client";

import { useEffect, useRef } from "react";

type Point = { x: number; y: number; z: number };
type Particle = Point & { r: number; color: string };

const GLOBE_POINTS = 160;
const COINS = 14;
const PARTICLES = 70;
const VIOLET = "#8b5cf6";
const INDIGO = "#6366f1";
const CYAN = "#06b6d4";
const GOLD = "#f59e0b";
const LINE = "#5b21b6";

/** Seeded, so the scene is the same on every load and in every screenshot. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(alpha, 1))})`;
}

/** Evenly spread points on a unit sphere. */
function fibonacciSphere(count: number): Point[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = golden * i;
    return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius };
  });
}

export function GraphBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;

    const next = random(20261121);
    const globe = fibonacciSphere(GLOBE_POINTS);
    const nodeColors = globe.map((_, i) => (i % 9 === 0 ? GOLD : i % 4 === 0 ? CYAN : i % 3 === 0 ? INDIGO : VIOLET));
    // Link each node to its nearest neighbours: rotation keeps distances, so once is enough.
    const edges: [number, number][] = [];
    globe.forEach((a, i) => {
      globe
        .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) }))
        .filter(({ j }) => j > i)
        .sort((p, q) => p.d - q.d)
        .slice(0, 3)
        .forEach(({ j, d }) => d < 0.42 && edges.push([i, j]));
    });
    const particles: Particle[] = Array.from({ length: PARTICLES }, () => ({
      x: next() * 2 - 1,
      y: next() * 2 - 1,
      z: next() * 2 - 1,
      r: 0.8 + next() * 2.2,
      color: [VIOLET, CYAN, GOLD, INDIGO][Math.floor(next() * 4)]
    }));

    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let time = 0;
    const tilt = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };

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
      const ctx = context!;
      ctx.clearRect(0, 0, width, height);
      const narrow = width < 760;
      // Full strength at the top of a screen, where it frames the headline;
      // it recedes to a third while the person reads the cards below.
      const reading = Math.max(0.35, 1 - window.scrollY / 700);
      const quiet = (narrow ? 0.45 : 1) * reading;
      // On a phone the globe peeks in from the bottom-right corner, clear of the headline.
      const radius = narrow ? width * 0.55 : Math.min(width, height) * 0.31;
      const cx = width * (narrow ? 0.92 : 0.8);
      const cy = height * (narrow ? 0.9 : 0.5);
      const yaw = time * 0.12 + tilt.x;
      const pitch = 0.42 + tilt.y;
      const sy = Math.sin(yaw), cyw = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);

      const project = (p: Point, r: number, ox = cx, oy = cy) => {
        const x1 = p.x * cyw - p.z * sy;
        const z1 = p.x * sy + p.z * cyw;
        const y1 = p.y * cp - z1 * sp;
        const z2 = p.y * sp + z1 * cp;
        const depth = 3 / (3 + z2); // nearer is larger
        return { px: ox + x1 * r * depth, py: oy + y1 * r * depth, depth, front: z2 < 0 ? 1 : 0, z: z2 };
      };

      // Ambient particles at many depths, moving with the pointer for parallax.
      for (const particle of particles) {
        const shiftX = -tilt.x * 120 * (particle.z + 1.2);
        const shiftY = -tilt.y * 90 * (particle.z + 1.2);
        const px = ((particle.x + 1) / 2) * width + shiftX + Math.sin(time * 0.4 + particle.z * 6) * 12;
        const py = ((particle.y + 1) / 2) * height + shiftY + Math.cos(time * 0.3 + particle.x * 5) * 10;
        ctx.fillStyle = rgba(particle.color, (0.16 + 0.2 * (1 - particle.z) / 2) * quiet);
        ctx.beginPath();
        ctx.arc(px, py, particle.r * (1.4 - particle.z * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }

      // A soft halo behind the globe, so it reads as a lit object.
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.35);
      halo.addColorStop(0, rgba(VIOLET, 0.16 * quiet));
      halo.addColorStop(0.6, rgba(CYAN, 0.07 * quiet));
      halo.addColorStop(1, rgba(CYAN, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2);
      ctx.fill();

      const nodes = globe.map((point) => project(point, radius));

      // The orbit of coins: a tilted ring around the globe, split into the
      // half behind the globe (drawn first) and the half in front (drawn last).
      const coins = Array.from({ length: COINS }, (_, i) => {
        const angle = (i / COINS) * Math.PI * 2 + time * 0.35;
        const ring = { x: Math.cos(angle) * 1.45, y: Math.sin(angle) * 0.28, z: Math.sin(angle) * 1.45 };
        return { ...project(ring, radius), angle };
      });
      const drawCoins = (front: boolean) => {
        for (const coin of coins) {
          if ((coin.z < 0) !== front) continue;
          const size = 7 * coin.depth * (front ? 1.15 : 0.85);
          // A coin seen at an angle is an ellipse: squash it by its position on the ring.
          const squash = 0.35 + 0.65 * Math.abs(Math.cos(coin.angle));
          ctx.save();
          ctx.translate(coin.px, coin.py);
          ctx.scale(squash, 1);
          const face = ctx.createLinearGradient(-size, -size, size, size);
          face.addColorStop(0, rgba("#fde68a", (front ? 0.95 : 0.4) * quiet));
          face.addColorStop(1, rgba(GOLD, (front ? 0.95 : 0.4) * quiet));
          ctx.fillStyle = face;
          ctx.strokeStyle = rgba("#b45309", (front ? 0.7 : 0.25) * quiet);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      };
      drawCoins(false);

      // Edges: back ones faint, front ones clear.
      ctx.lineWidth = 1;
      for (const [i, j] of edges) {
        const a = nodes[i], b = nodes[j];
        const facing = (a.front + b.front) / 2;
        ctx.strokeStyle = rgba(LINE, (0.05 + 0.24 * facing) * quiet);
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
        ctx.stroke();
      }

      // Nodes, back to front, the front ones larger and glowing.
      nodes
        .map((node, index) => ({ node, color: nodeColors[index] }))
        .sort((p, q) => q.node.z - p.node.z)
        .forEach(({ node, color }) => {
          const size = (node.front ? 3.4 : 1.8) * node.depth;
          if (node.front && !narrow) {
            ctx.shadowColor = rgba(color, 0.9);
            ctx.shadowBlur = 12;
          }
          ctx.fillStyle = rgba(color, (node.front ? 0.85 : 0.25) * quiet);
          ctx.beginPath();
          ctx.arc(node.px, node.py, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        });

      drawCoins(true);
    }

    function tick() {
      time += 1 / 60;
      tilt.x += (target.x - tilt.x) * 0.05;
      tilt.y += (target.y - tilt.y) * 0.05;
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
      target.x = (event.clientX / width - 0.5) * 0.9;
      target.y = (event.clientY / height - 0.5) * 0.6;
    }

    function onLeave() {
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
