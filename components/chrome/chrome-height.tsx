/**
 * Publishes the header's live height as --chrome-h, so the sidebar can run
 * from just below the header to the bottom of the screen. The header grows
 * when its strip wraps onto a second line, so it is measured, not assumed.
 */
"use client";

import { useEffect } from "react";

export function ChromeHeight() {
  useEffect(() => {
    const chrome = document.querySelector<HTMLElement>(".product-chrome");
    if (!chrome) return;
    const publish = () =>
      document.documentElement.style.setProperty("--chrome-h", `${Math.round(chrome.getBoundingClientRect().height)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(chrome);
    return () => observer.disconnect();
  }, []);

  return null;
}
