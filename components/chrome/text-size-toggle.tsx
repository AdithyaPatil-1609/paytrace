"use client";

/**
 * Large-text mode. One button, in the corner of every screen, makes all text
 * a quarter larger and remembers the choice in this browser. Every font size
 * in the style sheets is written as a multiple of --text-scale, so the whole
 * app follows, the Family view included. The script in the root layout puts
 * the saved choice back before the first paint, so the page never jumps.
 */
import { useSyncExternalStore } from "react";

export const TEXT_SIZE_KEY = "paytrace:text-size";
const CHANGED = "paytrace:text-size-changed";

/** Runs in <head> before the page paints. Kept tiny and free of imports. */
export const RESTORE_TEXT_SIZE = `try{if(localStorage.getItem(${JSON.stringify(TEXT_SIZE_KEY)})==="large")document.documentElement.dataset.textSize="large"}catch(e){}`;

function isLarge() {
  return document.documentElement.dataset.textSize === "large";
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function setLarge(large: boolean) {
  const root = document.documentElement;
  if (large) root.dataset.textSize = "large";
  else delete root.dataset.textSize;
  try {
    if (large) localStorage.setItem(TEXT_SIZE_KEY, "large");
    else localStorage.removeItem(TEXT_SIZE_KEY);
  } catch {
    // Private windows can refuse storage; the choice still holds for this page.
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function TextSizeToggle() {
  const large = useSyncExternalStore(subscribe, isLarge, () => false);
  return (
    <button
      type="button"
      className="text-size-toggle"
      aria-pressed={large}
      onClick={() => setLarge(!large)}
      title={large ? "Go back to normal text size" : "Make all text larger"}
    >
      <span aria-hidden="true">
        A<b>A</b>
      </span>
      Larger text{large ? ": on" : ""}
    </button>
  );
}
