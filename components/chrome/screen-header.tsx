/** Shared title block at the top of each of the four screens. */
export function ScreenHeader({
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
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <div>{copy}</div>
    </header>
  );
}
