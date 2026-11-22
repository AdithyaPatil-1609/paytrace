/** 98765 43210 → +919876543210; numbers with their own +country code are kept. Null if not a mobile number. */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  const local = digits.replace(/^(?:91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}
