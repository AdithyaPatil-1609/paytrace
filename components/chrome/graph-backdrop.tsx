/**
 * The page background: small dots drifting at different depths.
 *
 * Near dots are a little larger and move further when the pointer moves,
 * far dots are smaller and fainter, which gives the page quiet depth. They
 * are kept faint so they stay behind the content. No red: on this page red
 * means a problem. It stops when the tab is hidden and holds one still
 * frame for anyone who prefers reduced motion.
 */
"use client";

import { useEffect, useRef } from "react";

type Dot = { x: number; y: number; z: number; r: number; color: string; phase: number };

const DOTS = 110;
// Ink, olive and brass: the Cream Ledger palette, never red.
const COLORS = ["#151513", "#46433c", "#6f7f3a", "#b7791f"];

/** Seeded, so the dots sit in the same places on every load. */
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

export function GraphBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;

    const next = random(20261121);
    // z runs from 0 (far) to 1 (near).
    const dots: Dot[] = Array.from({ length: DOTS }, () => ({
      x: next(),
      y: next(),
      z: next(),
      r: 0.8 + next() * 1.6,
      color: COLORS[Math.floor(next() * COLORS.length)],
      phase: next() * Math.PI * 2
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
      const quiet = width < 760 ? 0.6 : 1;
      for (const dot of dots) {
        // Near dots move further with the pointer than far ones: parallax depth.
        const depth = 0.3 + dot.z;
        const x = dot.x * width - tilt.x * 60 * depth + Math.sin(time * 0.35 + dot.phase) * 10 * depth;
        const y = dot.y * height - tilt.y * 45 * depth + Math.cos(time * 0.28 + dot.phase) * 8 * depth;
        ctx.fillStyle = rgba(dot.color, (0.1 + 0.24 * dot.z) * quiet);
        ctx.beginPath();
        ctx.arc(x, y, dot.r * (0.7 + dot.z * 0.9), 0, Math.PI * 2);
        ctx.fill();
      }
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
      target.x = event.clientX / width - 0.5;
      target.y = event.clientY / height - 0.5;
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
