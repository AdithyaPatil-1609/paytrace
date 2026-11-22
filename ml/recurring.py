"""Job 4: is a repeating debit a real commitment, or a shop the person visits often?

The detection engine groups debits by statement text, so a supermarket visited
every month can look "recurring". This job reads one group, as text built in
code from the statement rows, and says which it is. It never sees names,
account numbers or references: only the merchant text, the payment rail, the
dates and the amounts.

    ml/.venv/bin/python ml/recurring.py   # prints the prompt and one rendered example

lib/payments/recurring-check.ts renders the same text and sends the same prompt;
tests/recurring-check.test.ts fails if the two ever differ.
"""
import json
import urllib.request
from datetime import date

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen3:14b"
# Bump when the prompt, the input format or the guardrails change.
VERSION = "v1"

VERDICTS = ["commitment", "everyday_spending", "unsure"]
COMMITMENT_KINDS = ["subscription", "bill", "loan", "insurance", "investment", "rent", "membership", "regular_transfer"]
EVERYDAY_KINDS = ["groceries", "food", "fuel", "transport", "shopping", "pharmacy", "transfer"]
KINDS = COMMITMENT_KINDS + EVERYDAY_KINDS + ["unknown"]
MAX_ROWS = 12

SYSTEM_PROMPT = """You check one group of repeating debits from an Indian bank statement for Paytrace, a tracker of recurring payments.
The group was found because the same statement text appears more than once. Decide whether it is a commitment or everyday spending at a place the person visits often.
Reply with JSON only, with exactly these fields: verdict, kind.

verdict, exactly one of:
- commitment: a payment the person signed up for and that repeats until stopped: a subscription, a utility or phone bill, a loan EMI, an insurance premium, a SIP or other investment, rent, a gym or club membership, or a fixed transfer to the same person every month. Bills still count when the amount changes each time.
- everyday_spending: purchases the person chooses each time, even at the same place every week or month: groceries and supermarkets, restaurants and food delivery, fuel, cabs and metro top-ups, online shopping, pharmacies, and uneven transfers to people. A similar amount on a similar date does not make a shop a commitment.
- unsure: the statement text does not say what the business is and the dates and amounts do not settle it.

kind: for a commitment, one of subscription, bill, loan, insurance, investment, rent, membership, regular_transfer. For everyday spending, one of groceries, food, fuel, transport, shopping, pharmacy, transfer. For unsure, unknown.

Rules:
- Judge by what the business is first, then by the pattern. A membership or plan sold by a shop or app (Swiggy One, Amazon Prime, Uber One) is a commitment; the same brand's orders, rides or shopping are everyday spending.
- An autopay mandate or a renewal notice means a commitment.
- If the text names no business you can recognise, use the pattern: one fixed amount on a steady cycle is a commitment; uneven amounts on uneven dates are unsure."""

SCHEMA = {
    "type": "object",
    "properties": {"verdict": {"type": "string", "enum": VERDICTS}, "kind": {"type": "string", "enum": KINDS}},
    "required": ["verdict", "kind"],
}


def rupees(amount):
    """Rs 1284, or Rs 1284.50 when there are paise. Plain digits, so both languages render it alike."""
    whole = round(amount * 100)
    return f"Rs {whole // 100}" if whole % 100 == 0 else f"Rs {whole // 100}.{whole % 100:02d}"


def render(candidate):
    """The user message for one group: {merchant, rail, mandate, notice, rows: [(iso date, rupees), ...]}."""
    rows = sorted(candidate["rows"])[-MAX_ROWS:]
    days = [(date.fromisoformat(b[0]) - date.fromisoformat(a[0])).days for a, b in zip(rows, rows[1:])]
    lines = [
        f"Statement text: {candidate['merchant']}",
        f"Paid by: {candidate['rail']}",
        f"Autopay mandate: {'yes' if candidate['mandate'] else 'no'}",
        f"Renewal or price notice: {'yes' if candidate['notice'] else 'no'}",
        f"Debits ({len(rows)}, oldest first): " + "; ".join(f"{d} {rupees(a)}" for d, a in rows),
        "Days between debits: " + (", ".join(str(n) for n in days) if days else "none"),
    ]
    return "\n".join(lines)


def clean(answer):
    """The answer if it is well formed, with kind forced to match the verdict; else None."""
    if not isinstance(answer, dict) or answer.get("verdict") not in VERDICTS:
        return None
    verdict, kind = answer["verdict"], answer.get("kind")
    allowed = {"commitment": COMMITMENT_KINDS, "everyday_spending": EVERYDAY_KINDS, "unsure": ["unknown"]}[verdict]
    return {"verdict": verdict, "kind": kind if kind in allowed else "unknown"}


def parse_json(raw):
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(raw[start:end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def ask_ollama(messages):
    body = {"model": MODEL, "messages": messages, "stream": False, "think": False, "format": SCHEMA, "options": {"temperature": 0}}
    request = urllib.request.Request(OLLAMA_URL, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read())["message"]["content"].strip()


def classify(candidate, ask=None):
    """(clean answer or None, raw reply). `ask` defaults to Ollama; ml/mlx_backend.py supplies MLX."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": render(candidate)}]
    raw = ask(messages) if ask else ask_ollama(messages)
    return clean(parse_json(raw)), raw


if __name__ == "__main__":
    example = {"merchant": "UPI/DEMOMART SUPERMARKET/600112233", "rail": "UPI", "mandate": False, "notice": False,
               "rows": [("2026-08-03", 2140.0), ("2026-09-02", 1985.5), ("2026-10-04", 2302.0)]}
    print(SYSTEM_PROMPT, "\n\n", render(example), sep="")
