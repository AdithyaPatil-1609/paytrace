/**
 * The landing page's moving backdrop: a row of tall paper doors that swing
 * open from the middle outward, pause, and close again, on a slow loop.
 * Pure CSS (no script, no clicks); it stands still under reduced motion.
 */
const DOORS = 14;
const MIDDLE = (DOORS - 1) / 2;

export function LandingMotion() {
  return (
    <div className="motion-field" aria-hidden="true">
      {Array.from({ length: DOORS }, (_, i) => {
        // Doors nearest the middle move first; each step outward starts a little later.
        const step = Math.abs(i - MIDDLE) - 0.5;
        const side = i < DOORS / 2 ? "left" : "right";
        return <div key={i} className={`motion-door motion-door-${side}`} style={{ ["--step" as string]: step }} />;
      })}
    </div>
  );
}
