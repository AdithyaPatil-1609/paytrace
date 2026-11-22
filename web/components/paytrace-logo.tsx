// PayTrace logo: a vector "P" mark (the arrow traces a payment back, the waves
// mean tap-to-pay) plus the wordmark as live text, so it stays sharp at any size.
import { useId } from "react";

export function PayTraceMark({ size = 34 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="pt-mark" width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`pt-${id}`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2C4A6E" />
          <stop offset="1" stopColor="#1B2433" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#pt-${id})`} />
      <path d="M15 37V11h9.5a8 8 0 0 1 0 16H22" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24.6 23.3 20.9 27l3.7 3.7" stroke="#A9C1E0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M35.5 15.5a6 6 0 0 1 0 7M38.8 13a10 10 0 0 1 0 12" stroke="#A9C1E0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PayTraceLogo({ large = false }: { large?: boolean }) {
  return (
    <b className={large ? "pt-logo pt-logo-lg" : "pt-logo"}>
      <PayTraceMark size={large ? 56 : 34} />
      <b className="pt-word">Pay<i>Trace</i></b>
    </b>
  );
}
