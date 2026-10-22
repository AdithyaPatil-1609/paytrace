export function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(Date.parse(value)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

export function monthsAgo(value: string | undefined, asOf: string) {
  if (!value) return undefined;
  const delta = Date.parse(asOf) - Date.parse(value);
  return Math.floor(delta / (30 * 24 * 60 * 60 * 1000));
}
