/**
 * One entrance for lists and cards: a short rise and fade, staggered and
 * capped so a long list never waits on its last row. No overshoot, which
 * reads as sloppy on data. Under reduced motion it renders the final state.
 */
const STEP = 0.035;
const MAX_DELAY = 0.3;

export function reveal(index: number, reduceMotion: boolean | null) {
  if (reduceMotion) return { initial: false as const };
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const, delay: Math.min(index * STEP, MAX_DELAY) }
  };
}
