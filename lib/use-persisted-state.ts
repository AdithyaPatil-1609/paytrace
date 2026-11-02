"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function usePersistedState<Value>(key: string, initial: Value) {
  const serialized = JSON.stringify(initial);
  const snapshot = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) ?? serialized; } catch { return serialized; }
  }, () => serialized);
  let value: Value;
  try {
    const parsed = JSON.parse(snapshot);
    const valid = Array.isArray(initial)
      ? Array.isArray(parsed) && parsed.every((entry: unknown) => typeof entry === "string")
      : parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) &&
        Object.values(parsed).every((entry) => typeof entry === "string");
    value = valid ? parsed as Value : initial;
  } catch { value = initial; }
  function update(next: Value | ((current: Value) => Value)) {
    const updated = typeof next === "function" ? (next as (current: Value) => Value)(value) : next;
    try { localStorage.setItem(key, JSON.stringify(updated)); } catch { return; }
    listeners.forEach((listener) => listener());
  }
  return [value, update] as const;
}
