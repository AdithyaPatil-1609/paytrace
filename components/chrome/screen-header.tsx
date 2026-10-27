/** Shared title block at the top of each of the four screens. */
export function ScreenHeader({
  number,
  eyebrow,
  title,
  copy
}: {
  number: string;
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <header className="screen-header">
      <p>
        <span>SCREEN {number}</span> · {eyebrow}
      </p>
      <h1>{title}</h1>
      <div>{copy}</div>
    </header>
  );
}
