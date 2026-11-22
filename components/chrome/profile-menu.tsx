"use client";

/**
 * The demo person's menu in the top-right corner. The header shows only the
 * avatar and first name; the email address and the way into a personal
 * account appear when the menu is opened, so neither crowds the screen.
 */
import Link from "next/link";
import { useEffect, useRef } from "react";

const DEMO_PERSON = { name: "Priya Desai", first: "Priya", email: "priya.demo@example.com" };

export function ProfileMenu() {
  const menu = useRef<HTMLDetailsElement>(null);
  useCloseOnOutsideClick(menu);
  return (
    <details className="profile-menu" ref={menu}>
      <summary>
        <b aria-hidden="true">{DEMO_PERSON.first[0]}</b>
        <span>{DEMO_PERSON.first}<span className="issues-sr-only">, account menu</span></span>
        <Chevron />
      </summary>
      <div className="profile-panel">
        <p className="profile-eyebrow">DEMO PROFILE</p>
        <strong>{DEMO_PERSON.name}</strong>
        <p className="profile-email">{DEMO_PERSON.email}</p>
        <p className="profile-note">
          A made-up person. Every payment, message and mandate on these screens is synthetic.
        </p>
        <hr />
        <Link className="profile-action" href="/account">
          Use my own account →
        </Link>
      </div>
    </details>
  );
}

/** Closes an open details menu when the person clicks outside it or presses Esc. */
export function useCloseOnOutsideClick(menu: React.RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    function close(event: Event) {
      const element = menu.current;
      if (!element?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        element.open = false;
        element.querySelector("summary")?.focus();
        return;
      }
      if (!element.contains(event.target as Node)) element.open = false;
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);
}

export function Chevron() {
  return (
    <svg className="profile-chevron" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
