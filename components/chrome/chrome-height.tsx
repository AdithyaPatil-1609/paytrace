/**
 * Publishes the header's live height as --chrome-h, so the sidebar can run
 * from just below the header to the bottom of the screen. The header grows
 * when its strip wraps onto a second line, so it is measured, not assumed.
 */
"use client";

import { useLayoutEffect } from "react";

export function ChromeHeight() {
  useLayoutEffect(() => {
    const chrome = document.querySelector<HTMLElement>(".product-chrome");
    const shell = chrome?.closest<HTMLElement>(".paytrace-shell");
    if (!chrome || !shell) return;
    const publish = () =>
      shell.style.setProperty("--chrome-h", `${chrome.getBoundingClientRect().height}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(chrome);
    return () => { observer.disconnect(); shell.style.removeProperty("--chrome-h"); };
  }, []);

  return null;
}
