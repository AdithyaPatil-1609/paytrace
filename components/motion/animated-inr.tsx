"use client";

import { useEffect, useState } from "react";
import { useMotionValueEvent, useReducedMotion, useSpring } from "framer-motion";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0
});
const integer = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function AnimatedValue({ value, currency }: { value: number; currency: boolean }) {
  const reduceMotion = useReducedMotion();
  const spring = useSpring(0, { stiffness: 110, damping: 25, mass: 1 });
  const [displayed, setDisplayed] = useState(0);

  useMotionValueEvent(spring, "change", latest => {
    setDisplayed(Math.round(latest));
  });
  useEffect(() => {
    if (reduceMotion) {
      spring.jump(value);
      setDisplayed(value);
    } else {
      spring.set(value);
    }
  }, [value, reduceMotion, spring]);

  return (
    <span role="text" aria-label={(currency ? inr : integer).format(Math.round(value))}>
      <span aria-hidden="true">{(currency ? inr : integer).format(displayed)}</span>
    </span>
  );
}

export function AnimatedINR({ value }: { value: number }) {
  return <AnimatedValue value={value} currency />;
}
export function AnimatedCount({ value }: { value: number }) {
  return <AnimatedValue value={value} currency={false} />;
}
