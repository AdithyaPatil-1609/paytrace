"use client";
/**
 * Top bar dropdowns (Sync Gmail, Add phone) and the account menu share this:
 * a click or tap anywhere outside the open menu closes it, as does Escape.
 * Panels stay mounted while closed, so a one-time token or pairing code is not lost.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Calls close() on a pointer press outside the returned ref, or on Escape, while open. */
export function useClickAway<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  const latest = useRef(close);
  useEffect(() => { latest.current = close; });
  useEffect(() => {
    if (!open) return;
    const press = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) latest.current(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") latest.current(); };
    document.addEventListener("pointerdown", press);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", press); document.removeEventListener("keydown", key); };
  }, [open]);
  return ref;
}

export function BarMenu({ label, icon, title, className = "", children }: {
  label: ReactNode; icon: ReactNode; title: string; className?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLDivElement>(open, () => setOpen(false));
  return <div ref={ref} className={`bar-menu ${className}`.trim()}>
    <button type="button" className="bar-import bar-menu-trigger" aria-expanded={open} aria-haspopup="true" title={title} onClick={() => setOpen((value) => !value)}>
      {icon}{label}
    </button>
    <div className="personal-menu-panel account-card bar-menu-panel" hidden={!open}>{children}</div>
  </div>;
}

const icon = (path: string) => <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
  <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
</svg>;
export const SyncIcon = icon("M13.5 8a5.5 5.5 0 0 1-9.6 3.7M2.5 8a5.5 5.5 0 0 1 9.6-3.7M12.4 1.8v2.6H9.8M3.6 14.2v-2.6h2.6");
export const PhoneIcon = icon("M5 1.5h6a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1ZM7 12.2h2");
