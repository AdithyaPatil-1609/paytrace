/**
 * Turns a routed question into facts, worked out in code from the payment
 * records. This is where every number comes from: the model only words
 * these facts (Job 2) and never calculates anything itself.
 *
 * Each handler also returns a fixed sentence built from the same facts. It
 * is shown whenever the model is offline or its wording fails the check.
 */
import { formatDate, formatINR } from "@/server/presentation/format";
import type { Commitment } from "@/server/payments/types";
import type { Intent } from "./prompts";
import { ASSISTANT_WATCH_LIMITS } from "@/server/payments/rules";
import { isCurrent, watchDates, type WatchItem } from "./watchlist";

export type Routed = { intent: Intent; merchant: string | null; amount: number | null; period: string | null };
export type Facts = { found: boolean } & Record<string, unknown>;
/** lines: every payment behind a total, uncapped, for "show me the working". */
export type Grounded = { facts: Facts; ids: string[]; fallback: string; lines?: string[] };

/* ---------------- dates ---------------- */

const DAY = 86_400_000;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => iso(new Date(toDate(value).getTime() + days * DAY));

function addMonths(value: string, months: number) {
  const date = toDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return iso(date);
}

const monthStart = (value: string) => `${value.slice(0, 7)}-01`;
const monthEnd = (value: string) => addDays(addMonths(monthStart(value), 1), -1);
const monthLabel = (value: string) => {
  const date = toDate(value);
  const name = MONTHS[date.getUTCMonth()];
  return `${name[0].toUpperCase()}${name.slice(1)} ${date.getUTCFullYear()}`;
};

export type Period = { label: string; start: string; end: string; note?: string };

/**
 * The time words from the question, as a date range. Questions about what
 * will go out look forward from today; questions about spending look back.
 * Anything it cannot read falls back to 30 days and says so.
 */
export function parsePeriod(text: string | null, asOf: string, direction: "future" | "past"): Period {
  const fallback: Period =
    direction === "future"
      ? { label: "the next 30 days", start: asOf, end: addDays(asOf, 30) }
      : { label: "the last 30 days", start: addDays(asOf, -30), end: asOf };
  const words = (text ?? "").toLowerCase().trim();
  if (!words) return fallback;

  const weekday = (toDate(asOf).getUTCDay() + 6) % 7; // Monday is 0
  const thisMonday = addDays(asOf, -weekday);

  if (/\btoday\b/.test(words)) return { label: "today", start: asOf, end: asOf };
  if (/\btomorrow\b/.test(words)) return { label: "tomorrow", start: addDays(asOf, 1), end: addDays(asOf, 1) };
  if (/\byesterday\b/.test(words)) return { label: "yesterday", start: addDays(asOf, -1), end: addDays(asOf, -1) };

  if (/\bsalary\b/.test(words)) {
    return {
      label: `before salary, up to ${formatDate(monthEnd(asOf))}`,
      start: asOf,
      end: monthEnd(asOf),
      note: "Salary day is taken as the 1st of next month."
    };
  }

  const span = words.match(/\b(next|coming|last|past|previous)\s+(\d{1,3})\s+(day|week|month)s?\b/);
  if (span) {
    const count = Number(span[2]);
    const unit = span[3];
    const forward = span[1] === "next" || span[1] === "coming";
    const label = `the ${forward ? "next" : "last"} ${count} ${unit}${count === 1 ? "" : "s"}`;
    const move = (value: string, sign: number) =>
      unit === "month" ? addMonths(value, sign * count) : addDays(value, sign * count * (unit === "week" ? 7 : 1));
    return forward ? { label, start: asOf, end: move(asOf, 1) } : { label, start: move(asOf, -1), end: asOf };
  }

  if (/\bnext week\b/.test(words)) return { label: "next week", start: addDays(thisMonday, 7), end: addDays(thisMonday, 13) };
  if (/\b(last|previous) week\b/.test(words)) return { label: "last week", start: addDays(thisMonday, -7), end: addDays(thisMonday, -1) };
  if (/\bthis week\b/.test(words)) {
    return direction === "future"
      ? { label: "the rest of this week", start: asOf, end: addDays(thisMonday, 6) }
      : { label: "this week so far", start: thisMonday, end: asOf };
  }

  if (/\bnext month\b/.test(words)) {
    const start = addMonths(monthStart(asOf), 1);
    return { label: monthLabel(start), start, end: monthEnd(start) };
  }
  if (/\b(last|previous) month\b/.test(words)) {
    const start = addMonths(monthStart(asOf), -1);
    return { label: monthLabel(start), start, end: monthEnd(start) };
  }
  if (/\bthis month\b/.test(words)) {
    return direction === "future"
      ? { label: `the rest of ${monthLabel(asOf)}`, start: asOf, end: monthEnd(asOf) }
      : { label: `${monthLabel(asOf)} so far`, start: monthStart(asOf), end: asOf };
  }

  const year = asOf.slice(0, 4);
  // "since January", "since 5 march", "from august": from that day up to today.
  const since = words.match(/\b(?:since|from)\s+(?:the\s+)?(?:(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?)?([a-z]{3,})\b/);
  const sinceMonth = since ? MONTHS.findIndex((name) => name.startsWith(since[2].slice(0, 3))) : -1;
  if (since && sinceMonth >= 0 && direction === "past") {
    let start = `${year}-${String(sinceMonth + 1).padStart(2, "0")}-${String(Math.min(Number(since[1] ?? 1), 28)).padStart(2, "0")}`;
    if (start > asOf) start = `${Number(year) - 1}${start.slice(4)}`;
    return { label: `since ${formatDate(start)}`, start, end: asOf };
  }
  if (/\bnext year\b/.test(words)) return { label: String(Number(year) + 1), start: `${Number(year) + 1}-01-01`, end: `${Number(year) + 1}-12-31` };
  if (/\b(last|previous) year\b/.test(words)) return { label: String(Number(year) - 1), start: `${Number(year) - 1}-01-01`, end: `${Number(year) - 1}-12-31` };
  if (/\bthis year\b/.test(words)) {
    return direction === "future"
      ? { label: `the rest of ${year}`, start: asOf, end: `${year}-12-31` }
      : { label: `${year} so far`, start: `${year}-01-01`, end: asOf };
  }

  /** The date for "the 15th [of november]": a named month, else the next time that day comes round. */
  const dayIn = (day: number, monthWord: string | undefined, from: string) => {
    const named = monthWord ? MONTHS.findIndex((month) => month.startsWith(monthWord.slice(0, 3))) : -1;
    let target: string;
    if (named >= 0) {
      const sameYear = `${year}-${String(named + 1).padStart(2, "0")}-01`;
      target = sameYear < monthStart(from) ? `${Number(year) + 1}${sameYear.slice(4)}` : sameYear;
    } else {
      target = day > Number(from.slice(8)) ? monthStart(from) : addMonths(monthStart(from), 1);
    }
    if (day < 1 || day > Number(monthEnd(target).slice(8))) return null;
    return `${target.slice(0, 8)}${String(day).padStart(2, "0")}`;
  };

  // "between the 1st and 15th november", "from 5 to 20 dec"
  const range = words.match(
    /\b(?:between|from)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+([a-z]{3,}))?\s+(?:and|to|till|until|-)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:of\s+)?([a-z]{3,}))?/
  );
  if (range) {
    const monthWord = range[4] ?? range[2];
    const start = dayIn(Number(range[1]), range[2] ?? monthWord, asOf);
    const end = start && dayIn(Number(range[3]), monthWord, start);
    if (start && end && end >= start) return { label: `${formatDate(start)} to ${formatDate(end)}`, start, end };
  }

  // "before the 15th", "by 15 nov", "until 3 december"
  const before = words.match(/\b(before|by|until|till)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:of\s+)?([a-z]{3,}))?/);
  if (before) {
    const date = dayIn(Number(before[2]), before[3], asOf);
    if (date && date > asOf) return { label: `before ${formatDate(date)}`, start: asOf, end: addDays(date, -1) };
  }

  // A month by name: "in november", "for december"
  const month = MONTHS.findIndex((name) => new RegExp(`\\b${name}\\b|\\b${name.slice(0, 3)}\\b`).test(words));
  if (month >= 0) {
    let start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    if (direction === "future" && start < monthStart(asOf)) start = `${Number(year) + 1}${start.slice(4)}`;
    if (direction === "past" && start > asOf) start = `${Number(year) - 1}${start.slice(4)}`;
    return { label: monthLabel(start), start, end: monthEnd(start) };
  }

  return { ...fallback, note: `"${text}" was read as ${fallback.label}.` };
}

/* ---------------- which payment ---------------- */

const STOP = new Set([
  "the", "my", "a", "an", "app", "apps", "thing", "things", "people", "guys", "one", "that", "this",
  "subscription", "subscriptions", "sub", "payment", "payments", "autopay", "autopays", "plan", "service",
  "charge", "charges", "debit", "account", "from", "for", "of", "to", "on", "and", "wala", "vala"
]);

const words = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

const close = (a: string, b: string) =>
  a.length >= 4 && b.length >= 4 && editDistance(a, b) <= (Math.max(a.length, b.length) >= 7 ? 2 : 1);

/** Every payment that best matches the user's words for a business; [] when none does. */
export function findPayments(text: string | null, items: Commitment[]): Commitment[] {
  const query = words(text ?? "").filter((word) => word.length >= 3 && !STOP.has(word));
  if (!query.length) return [];
  const scored = items.map((item) => {
    const name = words(item.merchant);
    const product = words(`${item.product} ${item.rawNarration}`);
    const kind = words(`${item.category} ${item.plainDescription}`);
    let score = words(text ?? "").join(" ").includes(name.join(" ")) ? 6 : 0;
    for (const word of query) {
      if (name.includes(word)) score += 4;
      else if (product.includes(word)) score += 3;
      else if (name.some((part) => part.length >= 5 && word.length >= 5 && (part.includes(word) || word.includes(part)))) score += 3;
      else if (name.some((part) => close(part, word)) || product.some((part) => close(part, word))) score += 2;
      else if (kind.includes(word)) score += 1;
    }
    return { item, score };
  });
  const best = Math.max(...scored.map((entry) => entry.score));
  return best > 0 ? scored.filter((entry) => entry.score === best).map((entry) => entry.item) : [];
}

/** Every email-only subscription that best matches the user's words; [] when none does. */
export function findWatch(text: string | null, watch: WatchItem[]): WatchItem[] {
  const query = words(text ?? "").filter((word) => word.length >= 3 && !STOP.has(word));
  if (!query.length || !watch.length) return [];
  const scored = watch.map((item) => {
    const name = words(item.name);
    let score = 0;
    for (const word of query) {
      if (name.includes(word)) score += 4;
      else if (name.some((part) => close(part, word))) score += 2;
    }
    return { item, score };
  });
  const best = Math.max(...scored.map((entry) => entry.score));
  return best > 0 ? scored.filter((entry) => entry.score === best).map((entry) => entry.item) : [];
}

/* ---------------- shared wording ---------------- */

const CADENCE: Record<Commitment["cadence"], string> = {
  weekly: "every week",
  monthly: "every month",
  quarterly: "every three months",
  annual: "once a year",
  irregular: "on uneven dates"
};

const money = (item: Commitment) => `${item.amountPattern === "variable" ? "about " : ""}${formatINR(item.amount)}`;

const nextDate = (item: Commitment) =>
  item.nextCharge && item.dateConfidence !== "unknown" ? formatDate(item.nextCharge) : "not known yet";

/** Loans and insurance: never suggest stopping them. */
function caution(item: Commitment) {
  if (item.cancelMode === "block") return "This is a loan repayment. Stopping the debit does not end the loan.";
  if (item.cancelMode === "warn") return "This is insurance. Lapsing it is not the same as cancelling an app.";
  if (item.cancelMode === "explain") return "This is a bill. Autopay can stop, but the amount due remains.";
  return undefined;
}

function list(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function notFound(searched: string | null): Grounded {
  return {
    facts: { found: false, ...(searched ? { searched } : { asked_about: "a payment, without naming the business" }) },
    ids: [],
    fallback: searched
      ? `I could not find a payment matching "${searched}". Try the name as it appears on your statement.`
      : "Which payment do you mean? Name the service as it appears on your statement."
  };
}

function ambiguous(searched: string | null, matches: Commitment[]): Grounded {
  const names = matches.slice(0, 4).map((item) => item.merchant);
  return {
    facts: { found: false, searched, possible_matches: names },
    ids: matches.slice(0, 4).map((item) => item.id),
    fallback: `"${searched}" could mean ${list(names)}. Which one do you mean?`
  };
}

/** The one payment a merchant question is about, or a not-found / which-one reply. */
function onePayment(routed: Routed, items: Commitment[]): Commitment | Grounded {
  let matches = findPayments(routed.merchant, items);
  // "what is this 1500 debit": no usable name, but the amount points to one payment.
  if (!matches.length && routed.amount) {
    const byAmount = items.filter((item) => Math.round(item.amount) === Math.round(routed.amount!));
    if (byAmount.length) matches = byAmount;
  }
  if (!matches.length) return notFound(routed.merchant);
  if (matches.length > 1) return ambiguous(routed.merchant, matches);
  return matches[0];
}

/* ---------------- forward: what will go out ---------------- */

function chargesBetween(item: Commitment, start: string, end: string) {
  if (!item.nextCharge || item.dateConfidence === "unknown") return [];
  const months = { weekly: 0, monthly: 1, quarterly: 3, annual: 12, irregular: -1 }[item.cadence];
  const dates: string[] = [];
  let date = item.nextCharge;
  for (let guard = 0; guard < 400 && date <= end; guard += 1) {
    if (date >= start) dates.push(date);
    if (months < 0) break;
    date = months === 0 ? addDays(date, 7) : addMonths(date, months);
  }
  return dates;
}

/** "in December 2026", but "before salary" and "today" take no "in". */
const during = (label: string) => (/^(?:before|today|tomorrow|yesterday)\b/.test(label) ? label : `in ${label}`);

const watchMoney = (item: WatchItem) => (item.amount === null ? "amount unknown" : formatINR(item.amount));

function upcoming(routed: Routed, items: Commitment[], asOf: string, setAside: boolean, watch: WatchItem[]): Grounded {
  const period = parsePeriod(routed.period, asOf, "future");
  const matches = routed.merchant ? findPayments(routed.merchant, items) : [];
  const watchMatches = routed.merchant ? findWatch(routed.merchant, watch) : [];
  const named = matches.length > 0 || watchMatches.length > 0;
  const pool = named ? matches : items;
  // Subscriptions seen only in emails: counted apart, never as confirmed.
  const watchPool = named ? watchMatches : watch;
  const maybe = watchPool
    .flatMap((item) => watchDates(item, period.start, period.end, asOf).map((date) => ({ item, date })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const older = watchPool.filter((item) => item.frequency && !isCurrent(item, asOf)).slice(0, ASSISTANT_WATCH_LIMITS.olderNamed);
  const watchUndated = watchPool.filter((item) => isCurrent(item, asOf) && !item.lastRenewal).map((item) => item.name);
  const due = pool
    .flatMap((item) => chargesBetween(item, period.start, period.end).map((date) => ({ item, date })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = due.reduce((sum, entry) => sum + entry.item.amount, 0);
  const undated = [...pool.filter((item) => !item.nextCharge || item.dateConfidence === "unknown").map((item) => item.merchant), ...watchUndated];
  const maybeTotal = maybe.reduce((sum, entry) => sum + (entry.item.amount ?? 0), 0);
  const estimated = due.some((entry) => entry.item.amountPattern === "variable");

  const facts: Facts = {
    found: true,
    period: period.label,
    total: formatINR(total),
    number_of_payments: due.length,
    payments: due.slice(0, 8).map((entry) => ({ name: entry.item.merchant, amount: money(entry.item), date: formatDate(entry.date) })),
    ...(due.length > 8 ? { more_payments_not_listed: due.length - 8 } : {}),
    ...(estimated ? { note_variable: "Some amounts vary, so the total is an estimate." } : {}),
    ...(undated.length ? { payments_with_no_fixed_date: undated } : {}),
    ...(period.note ? { note_period: period.note } : {}),
    ...(setAside ? { what_this_is: "the total that will go out by autopay in this period" } : {}),
    ...(maybe.length
      ? {
          seen_only_in_emails_not_confirmed: maybe.map((entry) => ({ name: entry.item.name, amount: watchMoney(entry.item), date: formatDate(entry.date) })),
          ...(maybeTotal > 0 ? { total_if_these_also_go_out: formatINR(total + maybeTotal) } : {}),
          note_emails: "These were seen only in receipt or renewal emails. No bank or card charge for them has been seen yet, so they are not in the total."
        }
      : {}),
    ...(older.length
      ? { older_subscriptions_not_counted: older.map((item) => `${item.name}, last email ${formatDate(item.lastEmail)}`), note_older: "No recent email, so they may have stopped. They are not counted." }
      : {})
  };
  const lines = due.map((entry) => `${entry.item.merchant} ${money(entry.item)} on ${formatDate(entry.date)}`);
  const maybeNames = maybe.map((entry) => `${entry.item.name} ${watchMoney(entry.item)} on ${formatDate(entry.date)}`);
  const maybeSentence = !maybe.length
    ? ""
    : due.length
      ? ` ${list(maybeNames)} may also go out; ${maybe.length === 1 ? "it was" : "they were"} seen only in emails, not yet as a charge${maybeTotal > 0 ? `, so the total would be ${formatINR(total + maybeTotal)}` : ""}.`
      : ` ${list(maybeNames)} ${maybe.length === 1 ? "is" : "are"} expected, seen only in emails; no charge for ${maybe.length === 1 ? "it" : "them"} has been seen yet.`;
  const olderSentence = older.length ? ` Not counted: ${list(older.map((item) => item.name))}, with no recent email, so they may have stopped.` : "";
  if (!due.length) {
    // An empty period still has an answer worth giving: when the next one is.
    const next = pool
      .flatMap((item) => chargesBetween(item, addDays(period.end, 1), addDays(period.end, 400)).slice(0, 1).map((date) => ({ item, date })))
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (next) facts.next_payment_after_this_period = { name: next.item.merchant, amount: money(next.item), date: formatDate(next.date) };
    const undatedNote = matches.length && undated.length ? ` ${list(undated)} has no fixed date, so I cannot say when it goes out.` : "";
    const nothing = maybe.length ? `No confirmed payment is due ${during(period.label)}.` : `Nothing is due by autopay ${during(period.label)}.`;
    const fallback = `${nothing}${maybeSentence}${undatedNote || (next && !maybe.length ? ` The next is ${next.item.merchant}, ${money(next.item)} on ${formatDate(next.date)}.` : "")}${olderSentence}`;
    return { facts, ids: next ? [next.item.id] : [], fallback, lines };
  }
  const shown = due.slice(0, 3).map((entry) => `${entry.item.merchant} ${money(entry.item)} on ${formatDate(entry.date)}`);
  const fallback = `${setAside ? "Keep" : "About"} ${formatINR(total)} ${setAside ? "for" : "goes out"} ${setAside ? period.label : during(period.label)}${setAside ? `: ${due.length} autopay${due.length === 1 ? " is" : "s are"} due` : ` across ${due.length} payment${due.length === 1 ? "" : "s"}`}, including ${list(shown)}${due.length > 3 ? `, and ${due.length - 3} more` : ""}.${maybeSentence}${olderSentence}`;
  return { facts, ids: [...new Set(due.map((entry) => entry.item.id))], fallback, lines };
}

/* ---------------- backward: what went out ---------------- */

/** "in total", "ever", "so far": the whole record, not the last 30 days. */
const ALL_TIME = /\b(?:total|ever|all time|so far|till now|until now|altogether|overall)\b/i;

function spent(routed: Routed, items: Commitment[], asOf: string, question = ""): Grounded {
  const matches = routed.merchant ? findPayments(routed.merchant, items) : [];
  // A named payment with no time words ("how much have I paid for iCloud in total") means everything so far.
  const allTime = ALL_TIME.test(routed.period ?? "") || (!routed.period && (matches.length > 0 || ALL_TIME.test(question)));
  const period = allTime ? { label: "everything so far", start: "0000-01-01", end: asOf } : parsePeriod(routed.period, asOf, "past");
  const pool = matches.length ? matches : items;
  const rows = pool.flatMap((item) =>
    item.evidenceRows.filter((row) => row.date >= period.start && row.date <= period.end).map((row) => ({ item, row }))
  );
  const total = rows.reduce((sum, entry) => sum + entry.row.amount, 0);
  const byPayment = new Map<string, { name: string; amount: number }>();
  for (const { item, row } of rows) {
    const entry = byPayment.get(item.id) ?? { name: item.merchant, amount: 0 };
    entry.amount += row.amount;
    byPayment.set(item.id, entry);
  }
  const biggest = [...byPayment.values()].sort((a, b) => b.amount - a.amount);
  const facts: Facts = {
    found: true,
    period: period.label,
    total_recurring_spend: formatINR(total),
    number_of_debits: rows.length,
    ...(byPayment.size > 1 ? { biggest: biggest.slice(0, 5).map((entry) => ({ name: entry.name, amount: formatINR(entry.amount) })) } : {}),
    covers: "recurring payments and autopays only, not one-off shopping",
    ...(period.note ? { note_period: period.note } : {})
  };
  const fallback = rows.length
    ? `${formatINR(total)} went out on ${matches.length === 1 ? matches[0].merchant : "recurring payments"} ${allTime ? "so far" : `in ${period.label}`}, across ${rows.length} debit${rows.length === 1 ? "" : "s"}.${byPayment.size > 1 ? ` The biggest was ${biggest[0].name} at ${formatINR(biggest[0].amount)}.` : ""}`
    : `No recurring payments went out ${allTime ? "so far" : `in ${period.label}`}.`;
  return { facts, ids: [...byPayment.keys()], fallback };
}

/* ---------------- one email-only subscription ---------------- */

function watchAnswer(intent: Intent, item: WatchItem, asOf: string): Grounded {
  const next = watchDates(item, asOf, addDays(asOf, 400), asOf)[0];
  const current = isCurrent(item, asOf);
  const often = item.frequency ? CADENCE[item.frequency] : "how often is not known";
  const cancel = "No cancel steps are known for it yet. Cancel it in the account or app store where you subscribed.";
  const facts: Facts = {
    found: true,
    name: item.name,
    amount: watchMoney(item),
    how_often: often,
    seen_in: `${item.emails} email${item.emails === 1 ? "" : "s"}, the latest on ${formatDate(item.lastEmail)}`,
    ...(item.lastRenewal ? { renewal_date_in_latest_email: formatDate(item.lastRenewal) } : {}),
    ...(next ? { next_expected: formatDate(next) } : {}),
    status: current ? "seen in emails; no bank or card charge for it has been seen yet" : "no recent email, so it may have stopped",
    ...(intent === "how_to_cancel" ? { cancel } : {})
  };
  const summary = `${item.name} is seen only in your emails, not yet as a bank or card charge: ${watchMoney(item)} ${often}${next ? `, next expected on ${formatDate(next)}` : ""}.${current ? "" : ` Its last email was on ${formatDate(item.lastEmail)}, so it may have stopped.`}`;
  return { facts, ids: [], fallback: intent === "how_to_cancel" ? `${cancel} ${summary}` : summary };
}

/* ---------------- one payment ---------------- */

/**
 * Everything the records hold about one payment, each amount next to its own
 * date. "amount" alone was ambiguous: asked about the first payment, the model
 * paired the first date with today's price (₹69 instead of ₹59).
 */
/** The first payment of the unbroken run at today's price: when the new price really started. */
function currentPriceSince(rows: { date: string; amount: number }[], current: number) {
  let index = rows.length;
  while (index > 0 && Math.abs(rows[index - 1].amount - current) < 0.005) index -= 1;
  return index < rows.length && index > 0 ? { current_price_since: { date: formatDate(rows[index].date), amount: formatINR(current) } } : {};
}

const CYCLE_DAYS: Record<Commitment["cadence"], number> = { weekly: 7, monthly: 30.44, quarterly: 91.3, annual: 365.25, irregular: 0 };

/**
 * Stretches with no payment where the cycle expected some, found in code so
 * "did it ever skip?" is never answered from a glance at a list of dates.
 * "No payment seen" can also mean a missing email or SMS, so it is worded that way.
 */
function gapsIn(rows: { date: string }[], cadence: Commitment["cadence"]) {
  const cycle = CYCLE_DAYS[cadence];
  if (!cycle || rows.length < 2) return {};
  const gaps: string[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const days = (Date.parse(rows[index].date) - Date.parse(rows[index - 1].date)) / DAY;
    const missed = Math.round(days / cycle) - 1;
    if (missed >= 1 && days > cycle * 1.5) gaps.push(`${missed} expected payment${missed === 1 ? "" : "s"} not seen between ${formatDate(rows[index - 1].date)} and ${formatDate(rows[index].date)}`);
  }
  return gaps.length
    ? { gaps_in_payments: gaps, gaps_note: "Not seen means no debit, email or SMS for it reached Paytrace. The payment may have been skipped, or its message may be missing." }
    : { gaps_in_payments: "none: a payment was seen for every expected date" };
}

const PER_YEAR: Record<Commitment["cadence"], number> = { weekly: 52, monthly: 12, quarterly: 4, annual: 1, irregular: 0 };

/** What a price rise adds over a year, worked out here so the model never multiplies. */
function extraPerYear(item: Commitment) {
  const times = PER_YEAR[item.cadence];
  if (!times || item.previousAmount === undefined || item.amount <= item.previousAmount) return {};
  return { price_rise_per_payment: formatINR(item.amount - item.previousAmount), price_rise_per_year: formatINR((item.amount - item.previousAmount) * times) };
}

export function record(item: Commitment, full = true) {
  const rows = [...item.evidenceRows].sort((a, b) => a.date.localeCompare(b.date));
  const first = rows[0];
  const latest = rows[rows.length - 1];
  const paid = (row: { date: string; amount: number }) => ({ date: formatDate(row.date), amount: formatINR(row.amount) });
  return {
    name: item.merchant,
    current_amount: money(item),
    how_often: CADENCE[item.cadence],
    ...(first ? { first_payment: paid(first) } : {}),
    ...(latest && rows.length > 1 ? { latest_payment: paid(latest) } : {}),
    next_payment: nextDate(item),
    number_of_payments: rows.length,
    total_paid_so_far: formatINR(item.spentToDate),
    cost_per_year: formatINR(item.annualCost),
    ...(item.previousAmount !== undefined && item.previousAmount !== item.amount
      ? { price_before: formatINR(item.previousAmount), price_now: formatINR(item.amount), price_change_notice_found: item.hasPriceChangeNotice ? "yes" : "no", ...extraPerYear(item) }
      : {}),
    ...currentPriceSince(rows, rows[rows.length - 1]?.amount ?? item.amount),
    ...(item.basis === "notices" ? { based_on: "emails about the payment; no bank debit seen yet" } : {}),
    ...gapsIn(rows, item.cadence),
    ...(full ? { every_payment: rows.slice(-24).map((row) => `${formatDate(row.date)}: ${formatINR(row.amount)}`) } : {})
  };
}

function whyDebit(item: Commitment, routed: Routed): Grounded {
  const amounts = [...new Set(item.priceSeries.map((point) => point.amount))];
  const facts: Facts = {
    found: true,
    ...record(item),
    product: item.product,
    paid_by: item.instrument,
    why_it_repeats: item.whyRecurring,
    ...(routed.amount !== null && !amounts.includes(routed.amount)
      ? { asked_amount: formatINR(routed.amount), recorded_amounts: amounts.map(formatINR) }
      : {}),
    ...(item.issue ? { flagged_issue: item.issue } : {})
  };
  const price =
    item.previousAmount !== undefined && item.previousAmount !== item.amount
      ? ` The price went from ${formatINR(item.previousAmount)} to ${formatINR(item.amount)}${item.hasPriceChangeNotice ? "" : " with no notice found"}.`
      : "";
  return {
    facts,
    ids: [item.id],
    fallback: `${item.merchant} charges ${money(item)} ${CADENCE[item.cadence]} through ${item.instrument}, last on ${formatDate(item.lastCharge)}.${price}`
  };
}

function mandateStatus(item: Commitment, asOf: string): Grounded {
  const cancelled = item.notices.find((notice) => /cancel|revok/i.test(notice.eventType));
  const status = cancelled ? "cancelled" : item.mandateStatus ?? (item.lastCharge >= addDays(asOf, -45) ? "active" : "unclear");
  const facts: Facts = {
    found: true,
    ...record(item),
    status,
    ...(cancelled ? { cancelled_message_date: formatDate(cancelled.sentOn) } : {}),
    ...(caution(item) ? { caution: caution(item) } : {})
  };
  return {
    facts,
    ids: [item.id],
    fallback: `${item.merchant} is ${status}. It last charged ${money(item)} on ${formatDate(item.lastCharge)}${item.nextCharge && item.dateConfidence !== "unknown" ? `, and the next charge is ${nextDate(item)}` : ""}.`
  };
}

function chargedAfterCancel(item: Commitment): Grounded {
  const cancelled = item.notices.find((notice) => /cancel|revok/i.test(notice.eventType));
  const after = cancelled ? item.evidenceRows.filter((row) => row.date > cancelled.sentOn) : [];
  const facts: Facts = {
    found: true,
    name: item.merchant,
    cancellation_message_found: cancelled ? formatDate(cancelled.sentOn) : "no cancellation message in the records",
    charges_after_cancelling: after.length,
    ...(after.length ? { amount_after_cancelling: formatINR(after.reduce((sum, row) => sum + row.amount, 0)) } : {}),
    last_charged: formatDate(item.lastCharge),
    what_to_do: item.ifSilent
  };
  return {
    facts,
    ids: [item.id],
    fallback: cancelled
      ? `${item.merchant} was cancelled on ${formatDate(cancelled.sentOn)}, and ${after.length} charge${after.length === 1 ? "" : "s"} came after that. ${item.ifSilent}`
      : `No cancellation message for ${item.merchant} is in the records, and it last charged on ${formatDate(item.lastCharge)}. ${item.ifSilent}`
  };
}

function byMerchant(item: Commitment): Grounded {
  const facts: Facts = {
    found: true,
    ...record(item),
    since: formatDate(item.startedOn)
  };
  return {
    facts,
    ids: [item.id],
    fallback: `You pay ${item.merchant} ${money(item)} ${CADENCE[item.cadence]}, ${formatINR(item.annualCost)} a year. ${formatINR(item.spentToDate)} has gone to it since ${formatDate(item.startedOn)}.`
  };
}

function howToCancel(item: Commitment): Grounded {
  const warning = caution(item);
  const facts: Facts = {
    found: true,
    name: item.merchant,
    ...(warning ? { caution: warning } : {}),
    stop_the_service: item.stopService,
    stop_the_money: item.stopMoney,
    ...(item.cancellationPath ? { steps: item.cancellationPath } : {})
  };
  return {
    facts,
    ids: [item.id],
    fallback: warning
      ? `${warning} ${item.stopMoney}`
      : `First stop the service: ${item.stopService} Then stop the money: ${item.stopMoney}`
  };
}

/** Matches questions about price rises, which Job 1 has no intent for. */
export const PRICE_QUESTION = /\b(?:price|prices|cost|costs|fee|fees)\b.*\b(?:hike|hikes|increase|increased|went up|gone up|rise|rose|raised|change|changed)\b|\bhikes?\b|\bcostlier\b|\bmehe?nga\b/i;

/** Every payment whose price went up, with whether a notice was found. */
export function priceChanges(items: Commitment[]): Grounded {
  const raised = items.filter((item) => item.previousAmount !== undefined && item.amount > item.previousAmount);
  const facts: Facts = {
    found: true,
    number_of_price_rises: raised.length,
    price_rises: raised.map((item) => ({
      name: item.merchant,
      price_before: formatINR(item.previousAmount!),
      price_now: formatINR(item.amount),
      ...extraPerYear(item),
      price_change_notice_found: item.hasPriceChangeNotice ? "yes" : "no"
    }))
  };
  const described = raised.map((item) => {
    const extra = extraPerYear(item);
    return `${item.merchant} went from ${formatINR(item.previousAmount!)} to ${formatINR(item.amount)}${extra.price_rise_per_year ? `, ${extra.price_rise_per_year} more a year` : ""}, ${item.hasPriceChangeNotice ? "and a price notice was found" : "with no notice found"}`;
  });
  return {
    facts,
    ids: raised.map((item) => item.id),
    fallback: raised.length ? `${list(described)}.` : "None of your recurring payments has gone up in price."
  };
}

/** A question about the person's payments that fits none of Job 1's intents ("when was the first Apple Music payment?"). */
export const ABOUT_PAYMENTS =
  /\b(?:pay|pays|paid|paying|payment|payments|charge|charged|charges|debit|debited|subscription|subscriptions|autopay|mandate|spend|spent|bill|bills|emi|sip|renew|renewal|cost|costs|price|amount|money|first|latest|last|cheapest|costliest|expensive|biggest|smallest)\b|₹|\brs\.?\s*\d/i;

/**
 * Facts for any question about the records: the payments it names, each with
 * its full history, or every payment in brief. The model answers from these;
 * every number it writes is still checked against them.
 */
/**
 * Payments a whole question names by their own name ("apple music", "icloud"),
 * not by a word that happens to sit in a product description ("year").
 */
export function namedIn(question: string, items: Commitment[]) {
  const asked = words(question).filter((word) => word.length >= 3 && !STOP.has(word));
  return items.filter((item) => {
    const name = words(item.merchant).filter((word) => word.length >= 3 && !STOP.has(word));
    return name.length > 0 && name.some((part) => asked.some((word) => word === part || close(word, part) || (part.length >= 5 && word.startsWith(part))));
  });
}

const TYPE: Record<Commitment["spendGroup"], string> = { subscriptions: "subscription", utilities: "bill", insurance: "insurance", debt: "loan", investments: "investment" };

function rankings(items: Commitment[]) {
  const line = (item: Commitment) => `${item.merchant}: ${formatINR(item.annualCost)} a year (${money(item)} ${CADENCE[item.cadence]})`;
  const ranked = (pool: Commitment[]) => [...pool].sort((a, b) => b.annualCost - a.annualCost);
  const out: Record<string, unknown> = {};
  const all = ranked(items);
  if (all.length) Object.assign(out, { costliest_payment_overall: line(all[0]), cheapest_payment_overall: line(all[all.length - 1]) });
  for (const [group, type] of Object.entries(TYPE)) {
    const pool = ranked(items.filter((item) => item.spendGroup === group));
    if (!pool.length) continue;
    out[`${type}s_from_costliest_to_cheapest`] = pool.map(line);
  }
  return out;
}

export function recordsFor(question: string, items: Commitment[], watch: WatchItem[], asOf: string): Grounded {
  const named = namedIn(question, items);
  const seen = named.length ? [] : findWatch(question, watch);
  if (named.length && named.length <= 3) {
    const facts: Facts = { found: true, today: formatDate(asOf), payments: named.map((item) => record(item)) };
    const first = named[0];
    const r = record(first);
    const fallback = `${first.merchant}: ${r.number_of_payments} payment${r.number_of_payments === 1 ? "" : "s"} so far, ${r.total_paid_so_far} in total${r.first_payment ? `. The first was ${r.first_payment.amount} on ${r.first_payment.date}` : ""}${r.latest_payment ? `, the latest ${r.latest_payment.amount} on ${r.latest_payment.date}` : ""}. Next: ${r.next_payment}.`;
    return { facts, ids: named.map((item) => item.id), fallback };
  }
  if (seen.length === 1) return watchAnswer("list_by_merchant", seen[0], asOf);
  const current = watch.filter((item) => isCurrent(item, asOf));
  const facts: Facts = {
    found: true,
    today: formatDate(asOf),
    number_of_recurring_payments: items.length,
    // Ranked in code: the model is unreliable at comparing many numbers.
    // Rankings are worked out here, per type: the model is unreliable at filtering and comparing many numbers.
    ...rankings(items),
    payments: [...items].sort((a, b) => b.annualCost - a.annualCost).map((item) => ({ ...record(item, false), type: TYPE[item.spendGroup] })),
    ...(current.length ? { seen_only_in_emails_not_confirmed: current.map((item) => ({ name: item.name, amount: watchMoney(item), how_often: item.frequency ? CADENCE[item.frequency] : "not known" })) } : {})
  };
  const brief = [...items].sort((a, b) => b.annualCost - a.annualCost).slice(0, 5).map((item) => `${item.merchant} ${money(item)} ${CADENCE[item.cadence]}`);
  const fallback = items.length
    ? `You have ${items.length} recurring payment${items.length === 1 ? "" : "s"}, the largest by yearly cost: ${list(brief)}. Ask about one by name for its full history.`
    : "No recurring payments are in your records yet.";
  return { facts, ids: items.slice(0, 4).map((item) => item.id), fallback };
}

export const OUT_OF_SCOPE =
  "I can answer questions about your recurring payments, such as what is due next month, why a charge happened, or how to cancel one. You can also paste a bank SMS for me to read.";

/** Facts for one routed question, worked out from the records. */
/** "how much is canva per year": a rate, not a time window, so it is a question about one business. */
const RATE = /\b(?:per|a|an|every|each)\s+(?:year|month|week)\b|\b(?:yearly|monthly|weekly|annual|annually)\b/;

/** "how much would I save if I stop iCloud": what that payment costs a year, not a budget question. */
const SAVING = /\b(?:save|saving|savings|bachega|bachenge)\b/i;

export function factsFor(routed: Routed, items: Commitment[], asOf: string, watch: WatchItem[] = [], question = ""): Grounded {
  if (routed.merchant && SAVING.test(question) && routed.intent !== "how_to_cancel" && routed.intent !== "why_debit") {
    routed = { ...routed, intent: "list_by_merchant", period: null };
  }
  if ((routed.intent === "upcoming_total" || routed.intent === "spend_total") && routed.merchant && RATE.test(routed.period ?? "")) {
    routed = { ...routed, intent: "list_by_merchant", period: null };
  }
  switch (routed.intent) {
    case "upcoming_total":
      return upcoming(routed, items, asOf, false, watch);
    case "set_aside":
      return upcoming(routed, items, asOf, true, watch);
    case "spend_total":
      return spent(routed, items, asOf, question);
    case "unknown":
      return { facts: { found: false }, ids: [], fallback: OUT_OF_SCOPE };
    default: {
      const item = onePayment(routed, items);
      if (!("id" in item)) {
        // Not on the table: it may be a subscription seen only in emails.
        const seen = item.facts.possible_matches ? [] : findWatch(routed.merchant, watch);
        return seen.length === 1 ? watchAnswer(routed.intent, seen[0], asOf) : item;
      }
      if (routed.intent === "why_debit") return whyDebit(item, routed);
      if (routed.intent === "mandate_status") return mandateStatus(item, asOf);
      if (routed.intent === "charged_after_cancel") return chargedAfterCancel(item);
      if (routed.intent === "list_by_merchant") return byMerchant(item);
      return howToCancel(item);
    }
  }
}
