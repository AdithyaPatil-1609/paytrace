"""Generates the synthetic bank-alert dataset for Job 3.

    python3 ml/gen_alerts.py

Every alert is built from a template plus random values (merchant, amount,
dates, account, reference), and its correct PaymentEvent is computed from
those same values, so no label is a guess. All data is invented: the banks,
account numbers and references do not exist.

The split is by template, not by row. Test templates are worded differently
from every training template, so the test score measures whether a model
learned the rules rather than memorised the phrasing. The 20 hand-written
alerts in alerts_dev.jsonl are a second, fully independent test set and are
never trained on.

Writes:
  ml/data/alerts_test.jsonl     held-out test set, in the scorer's format
  ml/data/mlx/train.jsonl       training rows, MLX-LM chat format
  ml/data/mlx/valid.jsonl       validation rows (training templates, unseen rows)
  ml/data/mlx/test.jsonl        the test set again, in chat format
"""
import json
import random
import re
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from alerts import SYSTEM_PROMPT, has_secret  # noqa: E402

HERE = Path(__file__).parent
SEED = 20261121
PER_TEMPLATE = {"train": 6, "test": 5}
FIELDS = ["kind", "merchantText", "amountPaise", "occurredOn", "dueOn", "reference", "accountHint"]

# name variants as they appear in alerts, and a realistic amount range in rupees
MERCHANTS = [
    (["Netflix", "NETFLIX", "NETFLIX ENTERTAINMENT"], 149, 649),
    (["Spotify", "SPOTIFY", "Spotify AB"], 59, 199),
    (["Amazon Prime", "AMAZON PRIME"], 299, 1499),
    (["YouTube Premium", "GOOGLE*YOUTUBEPREM"], 129, 189),
    (["Google One", "GOOGLE*ONE"], 130, 650),
    (["JioHotstar", "JIOHOTSTAR"], 149, 1499),
    (["ZEE5"], 99, 999),
    (["SonyLIV", "SONYLIV"], 299, 999),
    (["Canva", "CANVA", "CANVA.COM PADDLE.NET"], 499, 3999),
    (["Microsoft 365", "MICROSOFT*365"], 489, 6199),
    (["Adobe", "ADOBE SYSTEMS"], 1675, 4230),
    (["Duolingo", "DUOLINGO"], 299, 4999),
    (["Headspace", "HEADSPACE"], 299, 999),
    (["Cult.fit", "CULTFIT"], 999, 2999),
    (["GYMFITLINE", "FitLine Gym"], 1200, 2500),
    (["Airtel", "AIRTEL POSTPAID"], 399, 1499),
    (["Jio", "JIO PREPAID"], 239, 999),
    (["ACT Fibernet", "ACT FIBERNET"], 799, 1499),
    (["BESCOM"], 600, 3500),
    (["Tata Power", "TATA POWER DDL"], 800, 4000),
    (["HDFC Life", "HDFC LIFE INSURANCE"], 1200, 5000),
    (["LIC", "LIC OF INDIA"], 2000, 9000),
    (["LIC HSG EMI", "HOME LOAN EMI"], 8500, 25000),
    (["Audible", "AUDIBLE"], 199, 199),
    (["Apple", "APPLE.COM/BILL"], 99, 999),
    (["Swiggy", "SWIGGY"], 150, 900),
    (["Zomato", "ZOMATO"], 150, 900),
]
BILLERS = {"BESCOM", "Tata Power", "TATA POWER DDL", "Airtel", "AIRTEL POSTPAID", "ACT Fibernet", "ACT FIBERNET"}
BANKS = ["Arclight Bank", "Northwind Bank", "Kestrel Bank", "Tidewater Bank"]
FREQS = ["monthly", "yearly", "quarterly", "as presented"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
               "October", "November", "December"]


def indian(value, decimals):
    """Indian digit grouping, as banks print it: 109868 is 1,09,868."""
    whole, _, paise = f"{value:.2f}".partition(".")
    head, tail = whole[:-3], whole[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    grouped = ",".join(([head] if head else []) + groups + [tail])
    return f"{grouped}.{paise}" if decimals else grouped


class Ctx:
    """Random values for one alert, and how to write them."""

    def __init__(self, rng):
        self.rng = rng
        self.received = date(2026, 1, 5) + timedelta(days=rng.randint(0, 350))
        variants, low, high = rng.choice(MERCHANTS)
        self.merchant = rng.choice(variants)
        rupees = rng.randint(low, high)
        self.rupees = rupees + (rng.choice([0, 0, 0.5, 0.25, 0.75]) if self.merchant in BILLERS else 0)
        self.paise = round(self.rupees * 100)
        self.acct4 = f"{rng.randint(1000, 9999)}"
        self.bank = rng.choice(BANKS)

    # --- amounts
    def amount(self, rupees=None):
        value = self.rupees if rupees is None else rupees
        whole = indian(value, decimals=False)
        decimals = indian(value, decimals=True)
        style = self.rng.randint(0, 6)
        if style == 0:
            return f"Rs.{decimals}"
        if style == 1:
            return f"Rs {whole}" if value == int(value) else f"Rs {decimals}"
        if style == 2:
            return f"Rs. {decimals}"
        if style == 3:
            return f"INR {decimals}"
        if style == 4:
            return f"INR{decimals.replace(',', '')}"
        if style == 5:
            return f"₹{whole}" if value == int(value) else f"₹{decimals}"
        return f"₹ {decimals}"

    # --- dates
    def past(self, most=4):
        return self.received - timedelta(days=self.rng.randint(0, most))

    def future(self, least=2, most=25):
        return self.received + timedelta(days=self.rng.randint(least, most))

    def fmt(self, d):
        """A date in one of the formats Indian banks use. Formats without a year are
        only used when the year matches the received date, as the prompt promises."""
        styles = ["d-Mon-yy", "dd/mm/yyyy", "dd-mm-yy", "dd/mm/yy", "d Mon yyyy", "ddMonyy", "Mon d, yyyy",
                  "d Month yyyy", "dd.mm.yyyy", "dd-mm-yyyy", "d-Mon-yyyy"]
        if d.year == self.received.year:
            styles += ["d Mon", "d Mon"]
        style = self.rng.choice(styles)
        yy, mon = d.strftime("%y"), MONTHS[d.month - 1]
        return {
            "d-Mon-yy": f"{d.day:02d}-{mon}-{yy}",
            "dd/mm/yyyy": d.strftime("%d/%m/%Y"),
            "dd-mm-yy": d.strftime("%d-%m-%y"),
            "dd/mm/yy": d.strftime("%d/%m/%y"),
            "d Mon yyyy": f"{d.day} {mon} {d.year}",
            "ddMonyy": f"{d.day:02d}{mon}{yy}",
            "Mon d, yyyy": f"{mon} {d.day}, {d.year}",
            "d Month yyyy": f"{d.day} {MONTHS_LONG[d.month - 1]} {d.year}",
            "dd.mm.yyyy": d.strftime("%d.%m.%Y"),
            "dd-mm-yyyy": d.strftime("%d-%m-%Y"),
            "d-Mon-yyyy": f"{d.day:02d}-{mon}-{d.year}",
            "d Mon": f"{d.day} {mon}",
        }[style]

    # --- accounts and cards
    def account(self):
        return self.rng.choice([f"A/c XX{self.acct4}", f"A/c no. XX{self.acct4}", f"a/c **{self.acct4}",
                                f"A/c ending {self.acct4}", f"Acct XX{self.acct4}"])

    def card(self):
        return self.rng.choice([f"card XX{self.acct4}", f"Card ending {self.acct4}", f"credit card xx{self.acct4}",
                                f"{self.bank} Credit Card XX{self.acct4}"])

    # --- references (the label is always the code alone)
    def umn(self):
        code = self.rng.choice([
            "".join(self.rng.choice("0123456789abcdef") for _ in range(10)),
            f"{re.sub(r'[^a-z0-9]', '', self.merchant.split()[0].lower())[:8]}-{self.rng.randint(100, 9999)}",
            f"{''.join(self.rng.choice('abcdefghjk') for _ in range(5))}{self.rng.randint(10, 99)}@upi",
        ])
        return self.rng.choice([f"UMN {code}", f"UMN: {code}"]), code

    def umrn(self):
        code = f"{self.bank[:4].upper()}{self.rng.randint(10 ** 9, 10 ** 10 - 1)}"
        return self.rng.choice([f"UMRN {code}", f"UMRN: {code}"]), code

    def txn_ref(self):
        code = str(self.rng.randint(10 ** 11, 10 ** 12 - 1))
        return self.rng.choice([f"Ref {code}", f"UPI Ref No {code}", f"Ref no. {code}"]), code


def event(kind, ctx=None, merchant=None, paise=None, occurred=None, due=None, reference=None, account=None):
    return {
        "kind": kind,
        "merchantText": merchant,
        "amountPaise": paise,
        "occurredOn": occurred.isoformat() if occurred else None,
        "dueOn": due.isoformat() if due else None,
        "reference": reference,
        "accountHint": account,
    }


# ------------------------------------------------------------------ templates
# Each returns (message, PaymentEvent). Names ending in _t are test-only.

def ds1(c):
    due = c.future(); ref, code = c.umn()
    return (f"Pre-debit alert: {c.amount()} will be debited from {c.account()} on {c.fmt(due)} towards {c.merchant} "
            f"under UPI Autopay. {ref}", event("debit_scheduled", merchant=c.merchant, paise=c.paise, due=due,
                                                 reference=code, account=c.acct4))


def ds2(c):
    due = c.future(); ref, code = c.umn()
    return (f"Dear Customer, {c.merchant} autopay of {c.amount()} is due on {c.fmt(due)}. Please keep sufficient "
            f"balance in {c.account()}. {ref} -{c.bank}",
            event("debit_scheduled", merchant=c.merchant, paise=c.paise, due=due, reference=code, account=c.acct4))


def ds3(c):
    due = c.future()
    return (f"Upcoming debit: {c.merchant} | {c.amount()} | {c.fmt(due)} | {c.account()}",
            event("debit_scheduled", merchant=c.merchant, paise=c.paise, due=due, account=c.acct4))


def ds4(c):
    due = c.future()
    return (f"Subject: Your {c.merchant} plan renews soon. Hi, your subscription will renew on {c.fmt(due)} and "
            f"{c.amount()} will be charged to your {c.card()}. You can manage it in your account settings.",
            event("debit_scheduled", merchant=c.merchant, paise=c.paise, due=due, account=c.acct4))


def ds5(c):
    due = c.future(); bill = str(c.rng.randint(10 ** 6, 10 ** 7 - 1))
    return (f"{c.merchant} bill of {c.amount()} (Bill no {bill}) will be auto-paid from {c.account()} on "
            f"{c.fmt(due)} via BBPS.",
            event("debit_scheduled", merchant=c.merchant, paise=c.paise, due=due, reference=bill, account=c.acct4))


def ds_t(c):
    due = c.future(); _, code = c.umn()
    return (f"Heads up! {c.amount()} for {c.merchant} gets auto-debited on {c.fmt(due)} from {c.account()}. "
            f"Mandate ref {code}.",
            event("debit_scheduled", merchant=c.merchant, paise=c.paise, due=due, reference=code, account=c.acct4))


def dp1(c):
    on = c.past(); umn, code = c.umn(); ref, _ = c.txn_ref()
    return (f"{c.account()} debited by {c.amount()} on {c.fmt(on)} for UPI Autopay to {c.merchant}. {umn}. {ref}.",
            event("debit_posted", merchant=c.merchant, paise=c.paise, occurred=on, reference=code, account=c.acct4))


def dp2(c):
    on = c.past()
    return (f"{c.amount()} spent on your {c.card()} at {c.merchant} on {c.fmt(on)}. Avl limit "
            f"{c.amount(c.rng.randint(20000, 150000))}.",
            event("debit_posted", merchant=c.merchant, paise=c.paise, occurred=on, account=c.acct4))


def dp3(c):
    on = c.past(); ref, code = c.txn_ref()
    return (f"Dear Customer, {c.amount()} has been debited from {c.account()} towards {c.merchant} on "
            f"{c.fmt(on)}. {ref}. -{c.bank}",
            event("debit_posted", merchant=c.merchant, paise=c.paise, occurred=on, reference=code, account=c.acct4))


def dp4(c):
    on = c.past(); code = str(c.rng.randint(10000, 99999))
    rupees = int(c.rupees)
    stamp = f"{on.day:02d}{MONTHS[on.month - 1].lower()}{on.strftime('%y')}"
    return (f"acct xx{c.acct4} dr rs {rupees} on {stamp} {c.merchant.lower()} ref {code}",
            event("debit_posted", merchant=c.merchant.lower(), paise=rupees * 100, occurred=on, reference=code,
                  account=c.acct4))


def dp5(c):
    on = c.past(); ref, code = c.umrn()
    return (f"NACH debit of {c.amount()} for {c.merchant} from {c.account()} on {c.fmt(on)}. {ref}.",
            event("debit_posted", merchant=c.merchant, paise=c.paise, occurred=on, reference=code, account=c.acct4))


def dp6(c):
    on = c.past()
    return (f"Subject: Payment received. Thank you! We've received {c.amount()} for your {c.merchant} "
            f"subscription on {c.fmt(on)}, charged to your {c.card()}.",
            event("debit_posted", merchant=c.merchant, paise=c.paise, occurred=on, account=c.acct4))


def dp7(c):
    on = c.past(); ref, code = c.txn_ref()
    return (f"Sent {c.amount()} from {c.account()} to {c.merchant} on {c.fmt(on)}. {ref}.",
            event("debit_posted", merchant=c.merchant, paise=c.paise, occurred=on, reference=code, account=c.acct4))


def dp_t(c):
    on = c.past(); ref, code = c.txn_ref()
    return (f"Txn alert: {c.merchant} charged {c.amount()} to your {c.card()} on {c.fmt(on)} (recurring "
            f"payment). {ref}.",
            event("debit_posted", merchant=c.merchant, paise=c.paise, occurred=on, reference=code, account=c.acct4))


def df1(c):
    on = c.past(); ref, code = c.umn()
    return (f"Your UPI Autopay of {c.amount()} to {c.merchant} failed on {c.fmt(on)} due to insufficient funds "
            f"in {c.account()}. {ref}.",
            event("debit_failed", merchant=c.merchant, paise=c.paise, occurred=on, reference=code, account=c.acct4))


def df2(c):
    on = c.past()
    return (f"Transaction of {c.amount()} at {c.merchant} on your {c.card()} was declined on {c.fmt(on)}. "
            f"Reason: card expired.",
            event("debit_failed", merchant=c.merchant, paise=c.paise, occurred=on, account=c.acct4))


def df3(c):
    on = c.past(); ref, code = c.umrn()
    return (f"NACH debit of {c.amount()} for {c.merchant} returned unpaid on {c.fmt(on)} ({c.account()}). {ref}. "
            f"Return charges may apply.",
            event("debit_failed", merchant=c.merchant, paise=c.paise, occurred=on, reference=code, account=c.acct4))


def df_t(c):
    on = c.past()
    return (f"Could not process {c.merchant} recurring payment of {c.amount()} on {c.fmt(on)}: limit exceeded "
            f"on your {c.card()}.",
            event("debit_failed", merchant=c.merchant, paise=c.paise, occurred=on, account=c.acct4))


def rf1(c):
    on = c.past(); ref, code = c.txn_ref()
    return (f"Refund of {c.amount()} from {c.merchant} has been credited to {c.account()} on {c.fmt(on)}. {ref}.",
            event("refund", merchant=c.merchant, paise=c.paise, occurred=on, reference=code, account=c.acct4))


def rf2(c):
    on = c.past()
    return (f"{c.amount()} reversed to your {c.card()} for txn at {c.merchant} on {c.fmt(on)}.",
            event("refund", merchant=c.merchant, paise=c.paise, occurred=on, account=c.acct4))


def rf_t(c):
    on = c.past(); code = f"RFD{c.rng.randint(10000, 99999)}"
    return (f"Good news! {c.merchant} sent you a refund of {c.amount()}. It reached your {c.account()} on "
            f"{c.fmt(on)}. Refund ID {code}.",
            event("refund", merchant=c.merchant, paise=c.paise, occurred=on, reference=code, account=c.acct4))


def mr1(c):
    return (f"{c.merchant} has requested a UPI Autopay mandate of up to {c.amount()} ({c.rng.choice(FREQS)}). "
            f"Approve in your UPI app using your UPI PIN.",
            event("mandate_request", merchant=c.merchant, paise=c.paise))


def mr2(c):
    return (f"Action needed: approve the autopay request from {c.merchant} for {c.amount()} "
            f"{c.rng.choice(FREQS)} in your UPI app.",
            event("mandate_request", merchant=c.merchant, paise=c.paise))


def mr_t(c):
    return (f"New mandate request: {c.merchant}, max {c.amount()}, {c.rng.choice(FREQS)}. Open BHIM to accept or "
            f"reject. Do not share your UPI PIN with anyone.",
            event("mandate_request", merchant=c.merchant, paise=c.paise))


def mc1(c):
    ref, code = c.umn()
    return (f"UPI Autopay set up successfully for {c.merchant}. Amount: up to {c.amount()}, {c.rng.choice(FREQS)}. "
            f"{ref}. {c.account()}",
            event("mandate_created", merchant=c.merchant, paise=c.paise, reference=code, account=c.acct4))


def mc2(c):
    ref, code = c.umrn()
    return (f"Your e-mandate for {c.merchant} with {ref} for max {c.amount()} has been registered on "
            f"{c.account()}.",
            event("mandate_created", merchant=c.merchant, paise=c.paise, reference=code, account=c.acct4))


def mc3(c):
    on = c.past(); ref, code = c.umn()
    return (f"Mandate registered on {c.fmt(on)}: {c.merchant}, {c.amount()} {c.rng.choice(FREQS)}. {ref}",
            event("mandate_created", merchant=c.merchant, paise=c.paise, occurred=on, reference=code))


def mc_t(c):
    _, code = c.umn()
    return (f"Success! Autopay for {c.merchant} is now active. Limit {c.amount()}. Mandate ID {code}.",
            event("mandate_created", merchant=c.merchant, paise=c.paise, reference=code))


def mp1(c):
    ref, code = c.umn()
    return (f"Your autopay for {c.merchant} ({ref}) has been paused. No debits will happen until you resume it.",
            event("mandate_paused", merchant=c.merchant, reference=code))


def mp2(c):
    on = c.past()
    return (f"Mandate paused on {c.fmt(on)}: {c.merchant}. Resume anytime from your UPI app.",
            event("mandate_paused", merchant=c.merchant, occurred=on))


def mp_t(c):
    on = c.past(); until = c.future(10, 60); _, code = c.umn()
    return (f"{c.merchant} autopay is on hold from {c.fmt(on)} till {c.fmt(until)} as requested. UMN {code}.",
            event("mandate_paused", merchant=c.merchant, occurred=on, reference=code))


def mx1(c):
    ref, code = c.umn()
    return (f"Your UPI Autopay mandate for {c.merchant} has been revoked. {ref}. No further debits will be made.",
            event("mandate_cancelled", merchant=c.merchant, reference=code))


def mx2(c):
    on = c.past(); ref, code = c.umrn()
    return (f"{ref} for {c.merchant} cancelled successfully on {c.fmt(on)} as per your request.",
            event("mandate_cancelled", merchant=c.merchant, occurred=on, reference=code))


def mx_t(c):
    on = c.past()
    return (f"Done: the standing instruction to pay {c.merchant} from your {c.account()} was cancelled on "
            f"{c.fmt(on)}.",
            event("mandate_cancelled", merchant=c.merchant, occurred=on, account=c.acct4))


def np1(c):
    return (f"Flat {c.rng.choice([10, 15, 20, 25])}% off on {c.merchant} with your {c.bank} Credit Card! Use code "
            f"SAVE{c.rng.randint(10, 99)}. T&C apply.", event("not_payment"))


def np2(c):
    return (f"Balance update: {c.account()} has {c.amount(c.rng.randint(2000, 90000))} available as of "
            f"{c.fmt(c.past())}.", event("not_payment"))


def np3(c):
    return (f"{c.amount(c.rng.randint(30000, 150000))} credited to {c.account()} on {c.fmt(c.past())} by NEFT from "
            f"EMPLOYER PVT LTD.", event("not_payment"))


def np4(c):
    return (f"Never share your OTP or UPI PIN with anyone. {c.bank} will never ask for it.", event("not_payment"))


def np_t(c):
    return (f"Reward points update: you earned {c.rng.randint(40, 900)} points on your {c.card()} this month.",
            event("not_payment"))


TRAIN = [ds1, ds2, ds3, ds4, ds5, dp1, dp2, dp3, dp4, dp5, dp6, dp7, df1, df2, df3, rf1, rf2,
         mr1, mr2, mc1, mc2, mc3, mp1, mp2, mx1, mx2, np1, np2, np3, np4]
TEST = [ds_t, dp_t, df_t, rf_t, mr_t, mc_t, mp_t, mx_t, np_t]


def secret_rows(rng):
    """Alerts holding a secret. They exist to test the filter; the model never sees them."""
    rows = []
    for text in [
        "{code} is your OTP to approve {m} autopay of Rs {amt}. Valid for 10 mins.",
        "OTP for mandate setup with {m} is {code}. Never share it with anyone.",
        "Your UPI PIN reset OTP is {code}.",
        "Use {code} as one-time password for card XX{acct} transaction of Rs.{amt}.00 at {m}.",
    ]:
        c = Ctx(rng)
        message = text.format(code=rng.randint(100000, 999999), m=c.merchant, amt=int(c.rupees), acct=c.acct4)
        rows.append({"tag": "secret", "received": c.received.isoformat(), "msg": message, "dropped": True})
    return rows


def build(templates, per_template, rng):
    rows = []
    for template in templates:
        for _ in range(per_template):
            c = Ctx(rng)
            message, label = template(c)
            # A generated alert that trips the secret filter would never reach the model.
            assert not has_secret(message), f"{template.__name__} trips the secret filter: {message}"
            rows.append({"template": template.__name__, "received": c.received.isoformat(), "msg": message,
                         "label": label})
    return rows


def chat(row):
    return {"messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Received {row['received']}. {row['msg']}"},
        {"role": "assistant", "content": json.dumps(row["label"], separators=(",", ":"))},
    ]}


def scorer_row(row):
    label = row["label"]
    out = {"tag": row["template"], "received": row["received"], "msg": row["msg"]}
    for field in FIELDS:
        value = label[field]
        # strings are compared case-insensitively against a list of acceptable answers
        out[field] = [value] if isinstance(value, str) and field != "kind" and field not in ("occurredOn", "dueOn") else value
    return out


def main():
    rng = random.Random(SEED)
    train_rows = build(TRAIN, PER_TEMPLATE["train"], rng)
    test_rows = build(TEST, PER_TEMPLATE["test"], rng)
    rng.shuffle(train_rows)
    valid_count = len(train_rows) // 10
    valid_rows, train_rows = train_rows[:valid_count], train_rows[valid_count:]

    mlx = HERE / "data" / "mlx"
    mlx.mkdir(parents=True, exist_ok=True)
    for name, rows in [("train", train_rows), ("valid", valid_rows), ("test", test_rows)]:
        (mlx / f"{name}.jsonl").write_text("".join(json.dumps(chat(row), ensure_ascii=False) + "\n" for row in rows))

    scored = [scorer_row(row) for row in test_rows] + secret_rows(rng)
    (HERE / "data" / "alerts_test.jsonl").write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in scored))

    kinds = {}
    for row in train_rows:
        kinds[row["label"]["kind"]] = kinds.get(row["label"]["kind"], 0) + 1
    print(f"train {len(train_rows)} · valid {len(valid_rows)} · test {len(test_rows)} (+{len(scored) - len(test_rows)} secret)")
    print(f"templates: {len(TRAIN)} train, {len(TEST)} test (worded differently)")
    print("train rows per kind:", dict(sorted(kinds.items())))


if __name__ == "__main__":
    main()
