"use client";

import { useEffect, useRef } from "react";
import type { Commitment } from "@/lib/types";
import { CancellationGuide } from "./cancellation-guide";

export function CancellationDrawer({ item, onClose, onComplete }: {
  item: Commitment; onClose: () => void; onComplete: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const closeCallback = useRef(onClose);
  useEffect(() => { closeCallback.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCallback.current();
      }
      if (event.key === "Tab") {
        const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), summary, a[href], input, select, textarea, [tabindex="0"]') ?? []).filter((control) => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      const fallback = Array.from(document.querySelectorAll<HTMLElement>('.side-nav button.active, .mobile-menu summary')).find((element) => element.getClientRects().length > 0);
      const target = previousFocus instanceof HTMLElement && previousFocus !== document.body && previousFocus.isConnected ? previousFocus : document.getElementById(`cancel-trigger-${item.id}`) ?? fallback;
      target?.focus({ preventScroll: true });
    };
  }, [item.id]);
  return <div className="detail-backdrop cancellation-backdrop" role="dialog" aria-modal="true" aria-labelledby={`cancel-title-${item.id}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={panel} tabIndex={-1} className="detail-panel cancellation-drawer">
      <CancellationGuide item={item} onClose={onClose} onComplete={onComplete} />
    </aside>
  </div>;
}
