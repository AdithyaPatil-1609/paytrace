"use client";

import { useEffect, useRef } from "react";

type Destination = { id: string; label: string };

export function MobileNavigation<T extends string>({
  screens,
  current,
  onSelect
}: {
  screens: (Destination & { id: T })[];
  current: T;
  onSelect: (screen: T) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const toggle = useRef<HTMLElement>(null);

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) {
        menu.current?.removeAttribute("open");
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  return (
    <details
      className="mobile-menu"
      ref={menu}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          menu.current?.removeAttribute("open");
          toggle.current?.focus();
        }
      }}
    >
      <summary ref={toggle} aria-label="Navigation menu" aria-controls="mobile-navigation">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </summary>
      <nav id="mobile-navigation" aria-label="Mobile navigation">
        {screens.map((screen) => (
          <button
            key={screen.id}
            aria-current={current === screen.id ? "page" : undefined}
            onClick={() => {
              onSelect(screen.id);
              menu.current?.removeAttribute("open");
              toggle.current?.focus();
              window.scrollTo({ top: 0, behavior: "instant" });
            }}
          >
            {screen.label}
          </button>
        ))}
      </nav>
    </details>
  );
}
