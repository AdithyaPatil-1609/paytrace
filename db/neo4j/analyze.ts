import type { Transaction } from "neo4j-driver";
import { commitmentId, describeIssue, describeRecurring, instrumentByMechanism, RULES, statusFor, type Rules } from "@/lib/rules";
import type {
  AmountPattern,
  Bucket,
  Cadence,
  CancelMode,
  Commitment,
  CommitmentKind,
  DateConfidence,
  EvidenceRow,
  Mechanism,
  NoticeRow,
  Signal,
  SpendGroup
} from "@/lib/types";

/**
 * The decisions the screens used to make in TypeScript, asked of the graph.
 * Longest dictionary pattern wins, then the same keep / rhythm / amount / year
 * / signal rules as lib/engine.ts. Every threshold arrives as $rules from
 * lib/rules.ts, the same object the TypeScript engine reads, so the two cannot
 * be tuned apart. The mapper only turns the query's columns into the
 * commitment shape the screens already render.
 */
const ANALYSIS = `
MATCH (p:Payment)-[:ON_ACCOUNT]->(a:Account)
WHERE p.debit_inr IS NOT NULL AND p.debit_inr > 0
OPTIONAL MATCH (pat:Pattern)
WHERE pat.pattern <> '' AND p.narration CONTAINS pat.pattern
WITH p, a, pat
ORDER BY size(coalesce(pat.pattern, '')) DESC
WITH p, a, head(collect(pat)) AS pat
OPTIONAL MATCH (pat)-[:MATCHES]->(m:Merchant)
WITH p, a, pat, m,
     CASE WHEN pat IS NULL THEN p.narration ELSE pat.pattern END AS patternKey
WHERE pat IS NULL OR coalesce(pat.cancel_mode, 'normal') <> 'exclude'
ORDER BY p.date, p.txn_id
WITH patternKey, a, pat, m, collect(p) AS raw
WITH patternKey, a, pat, m,
     [pay IN raw WHERE coalesce(pay.txn_kind, '') <> 'authorisation'] AS charges,
     [pay IN raw WHERE pay.txn_kind = 'authorisation'] AS holds
WHERE size(charges) > 0
OPTIONAL MATCH (md:Mandate)
WHERE (m IS NOT NULL AND md.brand = m.brand) OR md.narration = charges[0].narration
WITH patternKey, a, pat, m, charges, holds, head(collect(DISTINCT md)) AS md
WHERE size(charges) >= 2 OR md IS NOT NULL
WITH patternKey, a, pat, m, charges, holds, md,
     [pay IN charges | pay.debit_inr] AS amounts,
     [i IN range(0, size(charges) - 2) |
       duration.inDays(charges[i].date, charges[i + 1].date).days] AS gaps
WITH patternKey, a, pat, m, charges, holds, md, amounts, gaps,
     reduce(distinct = [], x IN amounts |
       CASE WHEN x IN distinct THEN distinct ELSE distinct + [x] END) AS uniqueAmounts,
     [i IN range(1, size(amounts) - 1)
      WHERE all(x IN amounts[0..i] WHERE x = amounts[0])
        AND all(x IN amounts[i..] WHERE x = amounts[i])
        AND amounts[0] <> amounts[i] | i] AS stepIndexes
CALL (amounts) {
  WITH amounts
  UNWIND amounts AS amount
  WITH amount ORDER BY amount
  WITH collect(amount) AS sorted
  WITH sorted, size(sorted) AS n
  RETURN CASE
    WHEN n % 2 = 1 THEN toFloat(sorted[n / 2])
    ELSE (toFloat(sorted[n / 2 - 1]) + toFloat(sorted[n / 2])) / 2.0
  END AS amountMedian
}
CALL (gaps) {
  WITH gaps
  UNWIND CASE WHEN size(gaps) = 0 THEN [0.0] ELSE gaps END AS gap
  WITH gap ORDER BY gap
  WITH collect(gap) AS sorted
  WITH sorted, size(sorted) AS n
  RETURN CASE
    WHEN n % 2 = 1 THEN toFloat(sorted[n / 2])
    ELSE (toFloat(sorted[n / 2 - 1]) + toFloat(sorted[n / 2])) / 2.0
  END AS gapMedian
}
WITH patternKey, a, pat, m, charges, holds, md, amounts, gaps, uniqueAmounts, stepIndexes, amountMedian, gapMedian,
     CASE
       WHEN size(uniqueAmounts) <= 1 THEN 'fixed'
       WHEN size(stepIndexes) > 0 THEN 'step'
       ELSE 'variable'
     END AS amountPattern,
     CASE WHEN size(gaps) = 0 THEN 0.0
          ELSE sqrt(reduce(s = 0.0, g IN gaps | s + (toFloat(g) - gapMedian) * (toFloat(g) - gapMedian)) / size(gaps))
     END AS gapSpread
WITH patternKey, a, pat, m, charges, holds, md, amounts, gaps, amountMedian, gapMedian, amountPattern, gapSpread,
     size(gaps) >= 2 AND gapMedian > 0 AND gapSpread / gapMedian > $rules.irregularSpread AS irregular
WITH patternKey, a, pat, m, charges, holds, md, amounts, gaps, amountMedian, gapMedian, amountPattern,
     CASE
       WHEN size(gaps) = 0 AND toLower(coalesce(md.frequency, 'monthly')) = 'annual' THEN 'annual'
       WHEN size(gaps) = 0 AND toLower(coalesce(md.frequency, 'monthly')) = 'irregular' THEN 'irregular'
       WHEN size(gaps) = 0 THEN 'monthly'
       WHEN irregular THEN 'irregular'
       WHEN gapMedian <= $rules.weeklyMaxGap THEN 'weekly'
       WHEN gapMedian <= $rules.monthlyMaxGap THEN 'monthly'
       WHEN gapMedian <= $rules.quarterlyMaxGap THEN 'quarterly'
       ELSE 'annual'
     END AS cadence
OPTIONAL MATCH (msg:Message)
WHERE (m IS NOT NULL AND msg.merchant_brand = m.brand)
   OR any(pay IN (charges + holds) WHERE pay.txn_id = msg.related_txn_id)
WITH patternKey, a, pat, m, charges, holds, md, amounts, gaps, amountMedian, gapMedian, amountPattern, cadence,
     [msg IN collect(DISTINCT msg) WHERE msg IS NOT NULL] AS notices
WITH patternKey, a, pat, m, charges, holds, md, amounts, gaps, amountMedian, gapMedian, amountPattern, cadence, notices,
     any(msg IN notices WHERE msg.event_type = 'price_change') AS hasPrice,
     any(msg IN notices WHERE msg.event_type = 'trial_ending') AS hasTrial,
     CASE WHEN m IS NULL OR m.last_opened IS NULL THEN null
          ELSE duration.inDays(m.last_opened, date($asOf)).days END AS openedDays,
     m IS NOT NULL AND m.opens_last_12_months IS NOT NULL AND m.last_opened IS NULL AND m.opens_last_12_months = 0 AS neverOpened,
     toFloat(amounts[size(amounts) - 1]) AS latest,
     CASE WHEN amountPattern = 'step' THEN toFloat(amounts[0]) ELSE null END AS previous
WITH patternKey, a, pat, m, charges, holds, md, amounts, gaps, amountMedian, gapMedian, amountPattern, cadence, notices,
     hasPrice, hasTrial, openedDays, neverOpened, latest, previous,
     coalesce(pat.mechanism, md.mechanism, 'none') AS mechanism,
     coalesce(pat.cancel_mode, 'normal') AS cancelMode,
     (amountPattern = 'step' AND previous IS NOT NULL AND latest > previous AND NOT hasPrice) AS silentHike,
     ((openedDays IS NOT NULL AND openedDays > $rules.zombieDays) OR neverOpened) AS zombie
WITH patternKey, a, pat, m, charges, holds, md, amounts, gaps, amountMedian, gapMedian, amountPattern, cadence, notices,
     hasPrice, hasTrial, openedDays, neverOpened, latest, previous, mechanism, cancelMode, silentHike, zombie,
     [signal IN
       (CASE WHEN silentHike THEN ['silent_hike'] ELSE [] END) +
       (CASE WHEN hasTrial THEN ['trial_converted'] ELSE [] END) +
       (CASE WHEN zombie THEN ['zombie'] ELSE [] END) +
       (CASE WHEN cadence = 'annual' THEN ['annual_next_date'] ELSE [] END) +
       (CASE WHEN amountPattern = 'variable' THEN ['variable_amount'] ELSE [] END) +
       (CASE WHEN cadence = 'irregular' THEN ['irregular_interval'] ELSE [] END) +
       (CASE WHEN cancelMode IN ['warn', 'block'] THEN ['obligation'] ELSE [] END) +
       (CASE WHEN size(charges) = 1 AND md IS NOT NULL THEN ['new'] ELSE [] END)
      WHERE true | signal] AS rawSignals
WITH patternKey, a, pat, m, charges, holds, md, amounts, gaps, amountMedian, gapMedian, amountPattern, cadence, notices,
     hasPrice, hasTrial, openedDays, latest, previous, mechanism, cancelMode, silentHike,
     CASE WHEN size(rawSignals) = 0 THEN ['none'] ELSE rawSignals END AS signals,
     CASE cadence
       WHEN 'weekly' THEN 52
       WHEN 'monthly' THEN 12
       WHEN 'quarterly' THEN 4
       ELSE 1
     END AS multiplier
WITH patternKey, a, pat, m, charges, holds, md, amounts, gaps, amountMedian, gapMedian, amountPattern, cadence, notices,
     hasPrice, openedDays, latest, previous, mechanism, cancelMode, signals, multiplier,
     CASE
       WHEN mechanism = 'emi_ach' THEN 'debt'
       WHEN 'zombie' IN signals THEN 'unused'
       WHEN 'trial_converted' IN signals THEN 'trial'
       WHEN 'silent_hike' IN signals THEN 'silent'
       ELSE 'essential'
     END AS kind,
     CASE
       WHEN cadence = 'irregular' THEN reduce(s = 0.0, x IN amounts | s + toFloat(x))
       WHEN cadence = 'annual' THEN latest
       WHEN amountPattern = 'variable' THEN toFloat(round(amountMedian)) * multiplier
       ELSE latest * multiplier
     END AS annualCost,
     CASE WHEN amountPattern = 'variable' THEN round(amountMedian) ELSE latest END AS headline
RETURN
  coalesce(m.brand, charges[0].narration) AS merchant,
  coalesce(pat.product, 'Not in the dictionary yet') AS product,
  coalesce(pat.category, 'unknown') AS category,
  patternKey AS pattern,
  CASE WHEN m IS NULL THEN 0 ELSE COUNT { (m)<-[:MATCHES]-(:Pattern) } END AS brandPatterns,
  charges[0].narration AS rawNarration,
  a.account_id AS accountId,
  mechanism,
  cadence,
  amountPattern,
  headline AS amount,
  previous AS previousAmount,
  annualCost,
  size(charges) AS debitCount,
  toString(charges[0].date) AS firstCharge,
  coalesce(toString(md.created_on), toString(charges[0].date)) AS startedOn,
  reduce(s = 0.0, x IN amounts | s + toFloat(x)) AS spentToDate,
  toString(charges[size(charges) - 1].date) AS lastCharge,
  CASE
    WHEN cadence = 'irregular' THEN null
    WHEN cadence = 'annual' THEN toString(charges[size(charges) - 1].date + duration({years: 1}))
    ELSE toString(charges[size(charges) - 1].date + duration({days: toInteger(round(CASE WHEN size(gaps) = 0 THEN toFloat($rules.defaultGapDays) ELSE gapMedian END))}))
  END AS nextCharge,
  CASE WHEN m IS NULL OR m.last_opened IS NULL THEN null ELSE toString(m.last_opened) END AS lastOpened,
  openedDays,
  CASE WHEN m IS NULL OR m.opens_last_12_months IS NULL THEN null ELSE m.opens_last_12_months END AS opensLast12Months,
  kind,
  CASE
    WHEN mechanism = 'emi_ach' THEN 'debt'
    WHEN mechanism IN ['enach', 'bbps', 'neft_standing'] THEN 'bills'
    WHEN kind = 'unused' THEN 'unused'
    WHEN kind = 'trial' THEN 'review'
    ELSE 'used'
  END AS bucket,
  CASE
    WHEN mechanism = 'emi_ach' THEN 'debt'
    WHEN mechanism = 'enach' OR pat.category = 'insurance' THEN 'insurance'
    WHEN mechanism IN ['bbps', 'neft_standing'] THEN 'utilities'
    ELSE 'subscriptions'
  END AS spendGroup,
  CASE
    WHEN cadence = 'irregular' THEN 'unknown'
    WHEN amountPattern = 'variable' THEN 'estimated'
    ELSE 'confirmed'
  END AS dateConfidence,
  signals,
  hasPrice AS hasPriceChangeNotice,
  pat IS NOT NULL AS inDictionary,
  coalesce(pat.one_liner, 'This string is not in the dictionary yet. Name it by hand.') AS plainDescription,
  coalesce(pat.cancel_mode, 'normal') AS cancelMode,
  coalesce(pat.stop_the_service, 'Not in the dictionary yet.') AS stopService,
  coalesce(pat.stop_the_money, 'Not in the dictionary yet.') AS stopMoney,
  coalesce(pat.if_they_stay_silent, 'Not in the dictionary yet.') AS ifSilent,
  pat.trap AS trap,
  md.mandate_ref AS mandateRef,
  md.status AS mandateStatus,
  CASE WHEN size(gaps) = 0 THEN 0 ELSE round(gapMedian) END AS gapCentre,
  CASE WHEN size(gaps) = 0 THEN null ELSE reduce(lo = gaps[0], g IN gaps | CASE WHEN g < lo THEN g ELSE lo END) END AS gapMin,
  CASE WHEN size(gaps) = 0 THEN null ELSE reduce(hi = gaps[0], g IN gaps | CASE WHEN g > hi THEN g ELSE hi END) END AS gapMax,
  md IS NOT NULL AS hasMandate,
  [pay IN charges | {
    txnId: pay.txn_id,
    date: toString(pay.date),
    narration: pay.narration,
    amount: pay.debit_inr,
    reference: pay.reference,
    channel: pay.channel
  }] AS evidence,
  [pay IN holds | {
    txnId: pay.txn_id,
    date: toString(pay.date),
    narration: pay.narration,
    amount: pay.debit_inr,
    reference: pay.reference,
    channel: pay.channel
  }] AS holdRows,
  [msg IN notices | {
    noticeId: msg.notice_id,
    sentOn: toString(msg.sent_on),
    channel: msg.channel,
    sender: msg.sender,
    eventType: msg.event_type,
    amount: msg.amount_inr,
    text: msg.raw_text
  }] AS noticeRows
ORDER BY annualCost DESC, merchant
`;

function num(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const candidate = value as { toNumber?: () => number };
  if (typeof candidate.toNumber === "function") return candidate.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function asBool(value: unknown) {
  return value === true;
}

function asStrings(value: unknown): Signal[] {
  if (!Array.isArray(value)) return ["none"];
  return value.map((item) => String(item) as Signal);
}

function rowsOf(value: unknown, account: string): EvidenceRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      txnId: text(item.txnId),
      date: text(item.date),
      narration: text(item.narration),
      amount: num(item.amount) ?? 0,
      reference: text(item.reference),
      channel: text(item.channel),
      account
    };
  });
}

function noticesOf(value: unknown): NoticeRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const item = row as Record<string, unknown>;
      return {
        noticeId: text(item.noticeId),
        sentOn: text(item.sentOn),
        channel: text(item.channel) === "email" ? "email" : "sms",
        sender: text(item.sender),
        eventType: text(item.eventType),
        amount: num(item.amount),
        text: text(item.text)
      } satisfies NoticeRow;
    })
    .sort((a, b) => a.sentOn.localeCompare(b.sentOn));
}

function mechanismOf(value: string): Mechanism {
  const known: Mechanism[] = ["upi_autopay", "card_recurring", "play_store", "enach", "bbps", "neft_standing", "vas", "emi_ach", "none"];
  return known.includes(value as Mechanism) ? (value as Mechanism) : "none";
}

/** Anything that can run Cypher: a session, or a transaction Simulate rolls back. */
export type CypherRunner = Pick<Transaction, "run">;

/**
 * Runs the analysis query. Throws if the graph cannot answer it. `rules` is
 * only overridden by tests, to prove the thresholds reach the query.
 */
export async function analyzeCommitments(
  runner: CypherRunner,
  asOf: string,
  rules: Rules = RULES
): Promise<Commitment[]> {
  const result = await runner.run(ANALYSIS, { asOf, rules });
  return result.records.map((record) => {
    const merchant = text(record.get("merchant"));
    const signals = asStrings(record.get("signals"));
    const kind = text(record.get("kind")) as CommitmentKind;
    const cadence = text(record.get("cadence")) as Cadence;
    const amountPattern = text(record.get("amountPattern")) as AmountPattern;
    const mechanism = mechanismOf(text(record.get("mechanism")));
    const account = text(record.get("accountId"));
    const previous = num(record.get("previousAmount"));
    const openedDays = num(record.get("openedDays"));
    const lastOpened = record.get("lastOpened") ? text(record.get("lastOpened")) : undefined;
    const debitCount = num(record.get("debitCount")) ?? 0;
    const evidence = rowsOf(record.get("evidence"), account);
    const issueText = describeIssue(signals, {
      lastOpened,
      previous,
      latest: evidence.at(-1)?.amount ?? num(record.get("amount")) ?? 0,
      openedDaysAgo: openedDays
    });
    const why = describeRecurring({
      count: debitCount,
      cadence,
      pattern: amountPattern,
      gapCentre: num(record.get("gapCentre")) ?? 0,
      gapMin: num(record.get("gapMin")),
      gapMax: num(record.get("gapMax")),
      mandate: asBool(record.get("hasMandate"))
    });
    const cancelMode = (text(record.get("cancelMode")) || "normal") as CancelMode;
    const notices = noticesOf(record.get("noticeRows"));

    return {
      id: commitmentId(merchant, text(record.get("pattern")), account, (num(record.get("brandPatterns")) ?? 0) > 1),
      rawNarration: text(record.get("rawNarration")),
      merchant,
      product: text(record.get("product")),
      category: text(record.get("category")),
      instrument: instrumentByMechanism[mechanism],
      mechanism,
      cadence,
      amountPattern,
      amount: amountPattern === "variable" ? Math.round(num(record.get("amount")) ?? 0) : (num(record.get("amount")) ?? 0),
      previousAmount: previous,
      annualCost: num(record.get("annualCost")) ?? 0,
      debitCount,
      firstCharge: text(record.get("firstCharge")),
      startedOn: text(record.get("startedOn")),
      spentToDate: num(record.get("spentToDate")) ?? 0,
      lastCharge: text(record.get("lastCharge")),
      nextCharge: record.get("nextCharge") ? text(record.get("nextCharge")) : undefined,
      lastOpened,
      lastOpenedMonthsAgo: openedDays === undefined ? undefined : Math.floor(openedDays / 30),
      opensLast12Months: num(record.get("opensLast12Months")),
      kind,
      bucket: text(record.get("bucket")) as Bucket,
      signals,
      whyRecurring: why,
      evidence: issueText ?? why,
      evidenceRows: evidence,
      notices,
      hasPriceChangeNotice: asBool(record.get("hasPriceChangeNotice")),
      holds: rowsOf(record.get("holdRows"), account),
      status: statusFor(signals, kind),
      canCancel: cancelMode !== "block",
      cancelMode,
      cancellationPath: record.get("inDictionary")
        ? `${text(record.get("stopService"))} ${text(record.get("stopMoney"))}`
        : undefined,
      source: notices.some((notice) => notice.channel === "email") ? "SMS and email" : "SMS",
      plainDescription: text(record.get("plainDescription")),
      issue: issueText,
      stopService: text(record.get("stopService")),
      stopMoney: text(record.get("stopMoney")),
      ifSilent: text(record.get("ifSilent")),
      trap: text(record.get("trap")) || undefined,
      mandateRef: text(record.get("mandateRef")) || undefined,
      mandateStatus: text(record.get("mandateStatus")) || undefined,
      spendGroup: text(record.get("spendGroup")) as SpendGroup,
      dateConfidence: text(record.get("dateConfidence")) as DateConfidence,
      priceSeries: evidence.map((row) => ({ date: row.date, amount: row.amount })),
      inDictionary: asBool(record.get("inDictionary"))
    };
  });
}
