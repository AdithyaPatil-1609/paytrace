/**
 * Cards tilt in 3D toward the pointer, with a soft light that follows it.
 *
 * One listener for the whole page: the cards below are tagged data-tilt
 * (and re-tagged when a screen changes), and the card under the pointer
 * gets its angle through CSS variables. The look lives in refresh.css.
 * Nothing runs on touch screens or for anyone who prefers reduced motion.
 */
"use client";

import { useEffect } from "react";

const SELECTOR = ".annual-figure, .issue-card, .graph-finding, .bucket-card, .renewal-row";
const MAX_TILT = 7; // degrees

export function TiltSurfaces() {
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const touch = window.matchMedia("(hover: none)");
    if (still.matches || touch.matches) return;

    const tag = () => document.querySelectorAll(SELECTOR).forEach((element) => element.setAttribute("data-tilt", ""));
    tag();
    const observer = new MutationObserver(tag);
    observer.observe(document.body, { childList: true, subtree: true });

    let current: HTMLElement | null = null;

    function release() {
      if (!current) return;
      current.removeAttribute("data-tilting");
      current.style.removeProperty("--tilt-x");
      current.style.removeProperty("--tilt-y");
      current = null;
    }

    function onMove(event: PointerEvent) {
      const card = (event.target as Element | null)?.closest<HTMLElement>("[data-tilt]") ?? null;
      if (card !== current) release();
      if (!card) return;
      current = card;
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      // Wide cards tilt less sideways, so a long banner never swings too far.
      const sideways = MAX_TILT * Math.min(1, 420 / box.width);
      card.style.setProperty("--tilt-x", `${((0.5 - y) * MAX_TILT).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${((x - 0.5) * sideways * 2).toFixed(2)}deg`);
      card.style.setProperty("--glow-x", `${(x * 100).toFixed(1)}%`);
      card.style.setProperty("--glow-y", `${(y * 100).toFixed(1)}%`);
      card.setAttribute("data-tilting", "");
    }

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", release);
    return () => {
      observer.disconnect();
      release();
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", release);
    };
  }, []);

  return null;
}
