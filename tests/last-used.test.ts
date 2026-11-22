import assert from "node:assert/strict";
import test from "node:test";
import { detectCommitments } from "@/server/payments/engine";
import { RULES } from "@/server/payments/rules";
import { formatDate } from "@/server/presentation/format";
import { lastUsedLine } from "@/server/presentation/last-used";
import { issueDescription } from "@/server/presentation/issue-cards";
import { phoneReport, usageFor, usageRows } from "@/neo4j/live";
import type { Dataset, StatementRow, UsageRow } from "@/server/payments/types";

const AS_OF = "2026-11-22";
const debit = (merchant: string, date: string, amount: number): StatementRow => ({
  txnId: `${merchant}-${date}`, persona: "p", date, accountId: "acct", accountType: "unknown",
  narration: merchant, debit: amount, reference: "", channel: "sms", txnKind: "debit_purchase"
});
const monthly = (merchant: string, amount = 199) => ["2026-08-10", "2026-09-10", "2026-10-10", "2026-11-10"].map((d) => debit(merchant, d, amount));
const dayBefore = (days: number) => new Date(Date.parse(AS_OF) - days * 86_400_000).toISOString().slice(0, 10);
const run = (usage: UsageRow[], merchant = "IDLEFLIX") => {
  const dataset: Dataset = { asOf: AS_OF, statement: monthly(merchant), notifications: [], mandates: [], usage, dictionary: [] };
  return detectCommitments(dataset).find((item) => item.rawNarration === merchant)!;
};

test("the unused rule is 'more than 2 months' in both engines", () => {
  assert.equal(RULES.zombieDays, 60);
});

test("phone screen time over 2 months ago: card shows the date and the payment is 'Stopped using it'", () => {
  const item = run([{ brand: "IDLEFLIX", lastOpened: dayBefore(75), opensLast12Months: 0, source: "phone" }]);
  assert.equal(item.lastOpened, dayBefore(75));
  assert.equal(item.usageSource, "phone");
  assert.equal(item.kind, "unused");
  assert.equal(item.status, "Stopped using it");
  assert.match(item.issue ?? "", /screen time/);
  assert.equal(lastUsedLine(item), `Last used ${formatDate(dayBefore(75))} · screen time`);
  assert.match(issueDescription(item, "unused"), /phone screen time/);
});

test("used within 2 months: the card shows the date and raises nothing", () => {
  const item = run([{ brand: "IDLEFLIX", lastOpened: dayBefore(20), opensLast12Months: 0, source: "phone" }]);
  assert.equal(item.lastOpened, dayBefore(20));
  assert.notEqual(item.kind, "unused");
  assert.ok(!item.signals.includes("zombie"));
  assert.match(lastUsedLine(item) ?? "", /^Last used /);
});

test("exactly 60 days is not more than 2 months; 61 days is", () => {
  assert.notEqual(run([{ brand: "IDLEFLIX", lastOpened: dayBefore(60), opensLast12Months: 0, source: "phone" }]).kind, "unused");
  assert.equal(run([{ brand: "IDLEFLIX", lastOpened: dayBefore(61), opensLast12Months: 0, source: "phone" }]).kind, "unused");
});

test("not opened at all since the phone's window start counts as unused, with no made-up last use", () => {
  const item = run([{ brand: "IDLEFLIX", notOpenedSince: dayBefore(180), opensLast12Months: 0, source: "phone" }]);
  assert.equal(item.lastOpened, undefined);
  assert.equal(item.notOpenedSince, dayBefore(180));
  assert.equal(item.kind, "unused");
  assert.match(lastUsedLine(item) ?? "", /^Not opened since /);
  assert.match(item.issue ?? "", /Not opened on your phone since at least/);
});

test("no usage record: no line on the card and never 'unused'", () => {
  const item = run([{ brand: "SOMETHINGELSE", lastOpened: dayBefore(200), opensLast12Months: 0, source: "phone" }]);
  assert.equal(item.lastOpened, undefined);
  assert.equal(item.notOpenedSince, undefined);
  assert.equal(lastUsedLine(item), undefined);
  assert.notEqual(item.kind, "unused");
});

test("live usage facts become usage rows only when there is a real date", () => {
  const rows = usageRows([
    { merchant: "IDLEFLIX", lastUsed: "2026-09-01", noUseSince: null, source: "android_usage_stats" },
    { merchant: "GYMPASS", lastUsed: "2026-10-01", noUseSince: null, source: "user_confirmed" },
    { merchant: "QUIETFLIX", lastUsed: null, noUseSince: "2026-05-26", source: "android_usage_stats" },
    { merchant: "NOTHING", lastUsed: null, noUseSince: null, source: null },
    { merchant: "BAD", lastUsed: "yesterday", noUseSince: null, source: "android_usage_stats" }
  ], []);
  assert.deepEqual(rows, [
    { brand: "IDLEFLIX", lastOpened: "2026-09-01", opensLast12Months: 0, source: "phone" },
    { brand: "GYMPASS", lastOpened: "2026-10-01", opensLast12Months: 0, source: "you" },
    { brand: "QUIETFLIX", notOpenedSince: "2026-05-26", opensLast12Months: 0, source: "phone" }
  ]);
});

test("a usage row matches the payment by merchant name when the merchant is not in the dictionary", () => {
  const item = run(usageRows([{ merchant: "Idle Flix", lastUsed: dayBefore(90), noUseSince: null, source: "android_usage_stats" }], []), "IDLE FLIX");
  assert.equal(item.lastOpened, dayBefore(90));
  assert.equal(item.kind, "unused");
});

test("a phone report matches payments by app name and the newest last use wins", () => {
  const stored = [
    ...phoneReport(JSON.stringify([{ merchant: "NETFLIX", lastUsed: "2026-08-01", noUseSince: null }, { merchant: "HOTSTAR", lastUsed: null, noUseSince: "2026-05-26" }])),
    { merchant: "NETFLIX COM", lastUsed: "2026-10-01", noUseSince: null, source: "user_confirmed" }
  ];
  const rows = usageFor(["NETFLIX COM", "JIOHOTSTAR", "SPOTIFY"], stored, []);
  assert.deepEqual(rows, [
    { brand: "NETFLIX COM", lastOpened: "2026-10-01", opensLast12Months: 0, source: "you" },
    { brand: "JIOHOTSTAR", notOpenedSince: "2026-05-26", opensLast12Months: 0, source: "phone" }
  ]);
  assert.deepEqual(phoneReport("not json"), []);
  assert.deepEqual(phoneReport(undefined), []);
});
