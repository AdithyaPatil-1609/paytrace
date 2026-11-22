/**
 * The landing page's moving backdrop: two banks of soft paper bars, like a
 * ledger's bar chart, with a slow wave passing through them. Pure CSS (no
 * script, no clicks); it stands still for people who ask for reduced motion.
 */
const BARS = 13;

function Bank({ side }: { side: "left" | "right" }) {
  return (
    <div className={`motion-bank motion-bank-${side}`}>
      {Array.from({ length: BARS }, (_, i) => {
        // i = 0 is the outermost bar: tallest at the edge, stepping down toward the middle.
        const height = 94 - i * 4.6;
        return <i key={i} style={{ ["--i" as string]: i, ["--h" as string]: `${height}%` }} />;
      })}
    </div>
  );
}

export function LandingMotion() {
  return (
    <div className="motion-field" aria-hidden="true">
      <Bank side="left" />
      <Bank side="right" />
      <div className="motion-sheen" />
    </div>
  );
}
