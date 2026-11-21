"""Generates the synthetic dataset for Job 4: commitment or everyday spending.

    ml/.venv/bin/python ml/gen_recurring.py

Each row is one group of repeating debits, built from a merchant, a payment
rail and a pattern of dates and amounts. Its label comes from what built it,
so no label is a guess. All data is invented: no real statement, person,
account or reference is used.

The split is by merchant. Every test merchant is absent from training, so the
test score shows whether a model learned what a commitment is rather than a
list of names. The hard cases are deliberate: a supermarket on the same day
every month with similar amounts, fuel in round amounts, a metro card topped
up with the same sum, against bills whose amount changes and subscriptions
with a price rise. ml/data/recurring_dev.jsonl (hand-written) is a second,
independent test set and is never trained on.

Writes:
  ml/data/recurring_test.jsonl          held-out test set, in the scorer's format
  ml/data/mlx_recurring/train.jsonl     training rows, MLX-LM chat format
  ml/data/mlx_recurring/valid.jsonl     validation rows (training merchants, unseen rows)
  ml/data/mlx_recurring/test.jsonl      the test set again, in chat format
"""
import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from recurring import SYSTEM_PROMPT, render  # noqa: E402

HERE = Path(__file__).parent
SEED = 20261122
TRAIN_PER_MERCHANT = 9
TEST_PER_MERCHANT = 4

# kind -> (train merchants, test merchants); each merchant is (statement name, low, high rupees)
COMMITMENTS = {
    "subscription": (
        [("NETFLIX", 149, 649), ("SPOTIFY", 59, 199), ("YOUTUBEPREMIUM", 129, 189), ("GOOGLE ONE", 130, 650), ("JIOHOTSTAR", 149, 499),
         ("CANVA", 499, 999), ("ADOBE SYSTEMS", 1675, 4230), ("AMAZON PRIME", 299, 1499), ("SWIGGY ONE", 99, 149), ("UBER ONE", 149, 149)],
        [("SONYLIV", 299, 999), ("ZEE5", 99, 199), ("APPLE.COM BILL", 59, 749), ("MICROSOFT 365", 489, 619), ("LINKEDIN PREMIUM", 1500, 2700),
         ("ZOMATO GOLD", 99, 149), ("OPENAI CHATGPT", 1999, 1999), ("DUOLINGO", 299, 499)]),
    "bill": (
        [("BESCOM", 600, 3500), ("AIRTEL POSTPAID", 399, 1499), ("ACT FIBERNET", 799, 1499), ("MAHANAGAR GAS", 400, 1400), ("JIO POSTPAID", 299, 899),
         ("APT SOCIETY MAINTENANCE", 2500, 6000)],
        [("TATA POWER", 900, 4200), ("VI POSTPAID", 399, 1099), ("BSNL FTTH", 499, 999), ("HATHWAY BROADBAND", 599, 1199), ("BWSSB WATER", 200, 900)]),
    "loan": (
        [("HDFC BANK LOAN EMI", 4000, 45000), ("BAJAJ FINANCE EMI", 1500, 12000), ("ICICI HOME LOAN", 15000, 60000)],
        [("AXIS PERSONAL LOAN", 3000, 25000), ("TATA CAPITAL EMI", 2000, 15000), ("SBI HOME LOAN", 12000, 55000)]),
    "insurance": (
        [("LIC PREMIUM", 1000, 9000), ("HDFC LIFE", 1200, 6000), ("STAR HEALTH", 800, 4000)],
        [("ICICI LOMBARD", 900, 5000), ("MAX LIFE INSURANCE", 1500, 7000), ("NIVA BUPA", 700, 3500)]),
    "investment": (
        [("HDFC MUTUAL FUND SIP", 500, 15000), ("ZERODHA COIN", 1000, 10000), ("GROWW SIP", 500, 5000)],
        [("SBI MUTUAL FUND", 1000, 12000), ("AXIS MF SIP", 500, 8000), ("NPS TRUST", 2000, 10000)]),
    "rent": (
        [("RENT FLAT 402", 9000, 35000), ("HOUSE RENT", 8000, 30000)],
        [("LANDLORD MONTHLY RENT", 10000, 40000)]),
    "membership": (
        [("CULTFIT", 999, 2999), ("GOLDS GYM", 1500, 3000)],
        [("ANYTIME FITNESS", 1800, 3500), ("PLAYO CLUB MEMBERSHIP", 500, 1500)]),
    "regular_transfer": (
        [("RAMESH KUMAR", 3000, 12000), ("SUNITA DEVI", 2000, 8000)],
        [("MANJU BAI", 2500, 9000)]),
}
EVERYDAY = {
    "groceries": (
        [("DMART", 300, 4000), ("RELIANCE FRESH", 200, 2500), ("MORE SUPERMARKET", 200, 2500), ("SPAR HYPERMARKET", 500, 4500), ("NATURES BASKET", 400, 3000),
         ("BIGBASKET", 300, 3500)],
        [("STAR BAZAAR", 400, 4000), ("RATNADEEP SUPERMARKET", 200, 2500), ("SPENCERS RETAIL", 300, 3000), ("ZEPTO", 150, 1800)]),
    "food": (
        [("SWIGGY", 150, 900), ("ZOMATO", 150, 900), ("DOMINOS PIZZA", 300, 900), ("STARBUCKS", 250, 800), ("CHAAYOS", 120, 450)],
        [("EATSURE", 200, 800), ("BURGER KING", 200, 600), ("THIRD WAVE COFFEE", 200, 700), ("KFC", 250, 800)]),
    "fuel": (
        [("HPCL PETROL PUMP", 500, 3000), ("BPCL FUEL STATION", 500, 3000)],
        [("INDIAN OIL", 500, 3000), ("SHELL INDIA", 600, 3500)]),
    "transport": (
        [("UBER INDIA", 120, 650), ("OLA CABS", 100, 600), ("NAMMA METRO CARD", 200, 1000)],
        [("RAPIDO", 40, 250), ("DMRC METRO CARD", 200, 1000), ("BLUSMART", 200, 700)]),
    "shopping": (
        [("AMAZON PAY INDIA", 200, 5000), ("FLIPKART", 300, 6000), ("MYNTRA", 500, 4000)],
        [("MEESHO", 200, 1500), ("NYKAA", 300, 3000), ("AJIO", 500, 4000)]),
    "pharmacy": (
        [("APOLLO PHARMACY", 150, 2500), ("MEDPLUS", 100, 1800)],
        [("NETMEDS", 200, 2000), ("WELLNESS FOREVER", 150, 1500)]),
    "transfer": (
        [("ANIL SHARMA", 200, 5000), ("PRIYA NAIR", 100, 3000)],
        [("VIKRAM SINGH", 200, 4000)]),
}
# Unclear statement text: a UPI handle or a terminal code. Labelled by pattern only.
UNKNOWN = (["Q83920193@YBL", "PAYTMQR281734", "BHARATPE90021", "POS 4521 MERCH"], ["Q55120846@AXL", "PHONEPEQR77310", "POS 8830 TERMINAL"])

RAILS = {
    "subscription": ["card", "UPI autopay"], "bill": ["BBPS", "NACH", "UPI autopay", "netbanking"], "loan": ["NACH"],
    "insurance": ["NACH", "card"], "investment": ["NACH", "UPI autopay"], "rent": ["UPI", "NEFT"], "membership": ["card", "UPI autopay"],
    "regular_transfer": ["UPI", "IMPS"], "groceries": ["UPI", "card"], "food": ["UPI", "card"], "fuel": ["card", "UPI"],
    "transport": ["UPI", "card"], "shopping": ["card", "UPI"], "pharmacy": ["UPI", "card"], "transfer": ["UPI", "IMPS"],
}
AUTOPAY = {"UPI autopay", "NACH"}
# Share of groups shown as a bare merchant name with an unknown rail, as Gmail and SMS payments are.
BARE_NAME_SHARE = 0.25


def narration(name, rail, rng):
    ref = rng.randint(10**9, 10**10 - 1)
    if rail.startswith("UPI"):
        return rng.choice([f"UPI/{name}/{ref}", f"UPI-{name}-{ref}", f"UPI/P2M/{ref}/{name}"])
    if rail == "card":
        return rng.choice([f"POS {name} BANGALORE", f"{name.replace(' ', '')}*{ref % 100000}", f"CARD {name} MUMBAI"])
    if rail == "NACH":
        return rng.choice([f"NACH/{name}/{ref}", f"ACH D- {name}-{ref}"])
    if rail == "BBPS":
        return f"BBPS/{name}/{ref}"
    if rail == "netbanking":
        return f"NETBANKING {name} {ref}"
    if rail in ("NEFT", "IMPS"):
        return f"{rail}/{name}/{ref}"
    return name


def start_day(rng):
    return date(2025, 11, 1) + timedelta(days=rng.randint(0, 120))


def monthly_dates(rng, count, jitter, every=30.44, skip=0.0):
    first = start_day(rng)
    dates, step = [], 0
    while len(dates) < count:
        if rng.random() >= skip or not dates:
            dates.append(first + timedelta(days=round(step * every) + rng.randint(-jitter, jitter)))
        step += 1
    return dates


def commitment_rows(kind, low, high, rng):
    """Dates and amounts for a commitment: a steady cycle, a fixed price (bills vary)."""
    count = rng.randint(3, 10)
    cycle = rng.random()
    if kind == "insurance" and cycle < 0.3:
        dates = [start_day(rng) - timedelta(days=365), start_day(rng)]
        dates = [dates[0], dates[0] + timedelta(days=365 + rng.randint(-3, 3))]
    elif kind in ("insurance", "investment") and cycle < 0.45:
        dates = monthly_dates(rng, min(count, 4), 2, every=91.3)
    else:
        dates = monthly_dates(rng, count, 3 if kind != "bill" else 5, skip=0.12 if kind in ("investment", "loan") else 0.0)
    base = round(rng.uniform(low, high) / 10) * 10 - (1 if kind == "subscription" and rng.random() < 0.6 else 0)
    if kind == "bill":
        amounts = [round(base * rng.uniform(0.6, 1.45), 2) for _ in dates]
    elif kind == "subscription" and rng.random() < 0.3 and len(dates) >= 3:
        cut = rng.randint(1, len(dates) - 1)
        raised = base + round(base * rng.uniform(0.1, 0.35) / 10) * 10
        amounts = [float(base)] * cut + [float(raised)] * (len(dates) - cut)
    else:
        amounts = [float(base)] * len(dates)
    return list(zip(dates, amounts))


def everyday_rows(kind, low, high, rng):
    """Dates and amounts for everyday spending. Some look deceptively regular."""
    style = rng.random()
    count = rng.randint(3, 12)
    if style < 0.35:
        # The hard case: the monthly shop, the same week every month, similar amounts.
        dates = monthly_dates(rng, count, 4)
        centre = rng.uniform(low, high)
        amounts = [round(centre * rng.uniform(0.85, 1.15), 2) for _ in dates]
    elif style < 0.55 and kind in ("fuel", "transport", "transfer"):
        # Round top-ups: the same amount, every week or two or month.
        every = rng.choice([7, 10, 14, 21, 30])
        dates = monthly_dates(rng, count, 3, every=every)
        amounts = [float(rng.choice([200, 500, 1000, 1500, 2000, 2500]))] * len(dates)
    else:
        first, dates = start_day(rng), []
        day = first
        for _ in range(count):
            dates.append(day)
            day += timedelta(days=rng.randint(1, 20))
        amounts = [round(rng.uniform(low, high), 2) for _ in dates]
    return list(zip(dates, amounts))


def unknown_rows(rng):
    """Unclear text with uneven dates and amounts: honestly unsure."""
    first, dates = start_day(rng), []
    day = first
    for _ in range(rng.randint(2, 5)):
        dates.append(day)
        day += timedelta(days=rng.randint(3, 50))
    return [(d, round(rng.uniform(80, 4000), 2)) for d in dates]


def unknown_fixed_rows(rng):
    """Unclear text, one fixed amount on a steady monthly cycle: a commitment by pattern."""
    dates = monthly_dates(rng, rng.randint(4, 8), 2)
    amount = float(rng.choice([199, 299, 499, 999, 1500, 2000, 5000]))
    return list(zip(dates, [amount] * len(dates)))


def anchored(rows, rng):
    """Moves a group so its last debit falls in the weeks before 21 Nov 2026, never in the future."""
    last = max(d for d, _ in rows)
    end = date(2026, 11, 20) - timedelta(days=rng.randint(0, 60))
    return [(d + (end - last), a) for d, a in rows]


def row(name, rail, rows, verdict, kind, rng, mandate_chance=0.0, notice_chance=0.0):
    rows = anchored(rows, rng)
    # Payments read from Gmail or SMS carry only the merchant's name: no rail, no prefix.
    if rng.random() < BARE_NAME_SHARE:
        rail = "unknown"
    candidate = {
        "merchant": narration(name, rail, rng) if rail != "unknown" else rng.choice([name, name.title()]), "rail": rail,
        "mandate": rail in AUTOPAY and rng.random() < mandate_chance,
        "notice": rng.random() < notice_chance,
        "rows": [(d.isoformat(), a) for d, a in rows],
    }
    return {"candidate": candidate, "label": {"verdict": verdict, "kind": kind}, "merchant": name}


def build(side, per_merchant, rng):
    index = 0 if side == "train" else 1
    out = []
    for kind, merchants in COMMITMENTS.items():
        for name, low, high in merchants[index]:
            for _ in range(per_merchant):
                rail = rng.choice(RAILS[kind])
                out.append(row(name, rail, commitment_rows(kind, low, high, rng), "commitment", kind, rng, mandate_chance=0.5,
                               notice_chance=0.35 if kind in ("subscription", "membership") else 0.1))
    for kind, merchants in EVERYDAY.items():
        for name, low, high in merchants[index]:
            for _ in range(per_merchant):
                rail = rng.choice(RAILS[kind])
                out.append(row(name, rail, everyday_rows(kind, low, high, rng), "everyday_spending", kind, rng))
    for name in UNKNOWN[index]:
        for _ in range(per_merchant):
            out.append(row(name, "UPI", unknown_rows(rng), "unsure", "unknown", rng))
            out.append(row(name, "UPI", unknown_fixed_rows(rng), "commitment", "unknown", rng))
    return out


def chat(item):
    return {"messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": render(item["candidate"])},
        {"role": "assistant", "content": json.dumps(item["label"], separators=(",", ":"))},
    ]}


def main():
    rng = random.Random(SEED)
    train = build("train", TRAIN_PER_MERCHANT, rng)
    test = build("test", TEST_PER_MERCHANT, rng)
    rng.shuffle(train)
    valid_count = len(train) // 10
    valid, train = train[:valid_count], train[valid_count:]

    # No merchant crosses the split, and no rendered row repeats inside it.
    train_names = {item["merchant"] for item in train + valid}
    assert not train_names & {item["merchant"] for item in test}, "a test merchant is also in training"
    seen = {render(item["candidate"]) for item in train}
    valid = [item for item in valid if render(item["candidate"]) not in seen]

    out = HERE / "data" / "mlx_recurring"
    out.mkdir(parents=True, exist_ok=True)
    for name, items in [("train", train), ("valid", valid), ("test", test)]:
        (out / f"{name}.jsonl").write_text("".join(json.dumps(chat(item), ensure_ascii=False) + "\n" for item in items))
    (HERE / "data" / "recurring_test.jsonl").write_text(
        "".join(json.dumps({"tag": item["merchant"], **item}, ensure_ascii=False) + "\n" for item in test))

    # The app renders the same text in TypeScript; tests/recurring-check.test.ts compares it with these.
    checks = [{"candidate": item["candidate"], "rendered": render(item["candidate"])} for item in test[::7]]
    (HERE / "data" / "recurring_render_check.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in checks))

    def count(items):
        tally = {}
        for item in items:
            tally[item["label"]["verdict"]] = tally.get(item["label"]["verdict"], 0) + 1
        return dict(sorted(tally.items()))
    print(f"train {len(train)} {count(train)} · valid {len(valid)} · test {len(test)} {count(test)}")


if __name__ == "__main__":
    main()
