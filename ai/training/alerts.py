"""Job 3: read one bank alert (SMS or email) into PaymentEvent JSON, using local Qwen.

The model only copies facts out of the message. It never guesses, and a
message carrying a secret (OTP, PIN, password, CVV) never reaches it.

    python3 ai/training/alerts.py "Rs.139.00 spent on card XX2291 at SPOTIFY on 11-11-2026"
"""
import json
import re
import sys
import time
import urllib.request

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen3:14b"
# Bump when the prompt, the guardrails or the secret filter change, so results
# are never compared across versions.
# v1: prompt only.  v2: same prompt, plus the guardrails in clean() and a
# secret filter that needs an actual code, not just the word "PIN".
VERSION = "v2"

KINDS = [
    "mandate_request",
    "mandate_created",
    "mandate_paused",
    "mandate_cancelled",
    "debit_scheduled",
    "debit_posted",
    "debit_failed",
    "refund",
    "not_payment",
]

# Checked in code, before the model, so a secret is never sent anywhere.
# Standard warnings ("never share your OTP") are removed first. What is left
# is dropped if it still names a secret AND holds a standalone 4-8 digit code,
# wherever the code sits ("OTP for txn of Rs 649 is 482199"). The word alone is
# not enough: "approve with your UPI PIN" carries no secret. When unsure, drop:
# losing an alert is better than sending an OTP to a model.
_WARNING = re.compile(r"\b(?:never|do not|don't|dont)\s+share\b[^.!]*", re.IGNORECASE)
# Amounts are not codes: "Rs 1499", "INR 2000.00", "₹ 1,500".
_AMOUNT = re.compile(r"(?:\brs\.?|\binr|₹)\s*[\d,]+(?:\.\d+)?", re.IGNORECASE)
_SECRET_WORD = re.compile(r"\b(?:otp|one[- ]time password|pin|password|passcode|cvv)\b", re.IGNORECASE)
# Not part of a masked account (XX9912, **9912), a date (11-11-2026) or an amount (1500.00).
_CODE = re.compile(r"(?<![\w*/.,-])\d{4,8}(?![\w/,-]|\.\d)")

SYSTEM_PROMPT = """You read one Indian bank alert (SMS or email) and extract a PaymentEvent. Reply with JSON only.
Fields: kind, merchantText, amountPaise, occurredOn, dueOn, reference, accountHint.

kind, exactly one of:
- mandate_request: the user is asked to approve a new autopay or mandate.
- mandate_created: an autopay or mandate was set up or registered. Setting one up is not a debit.
- mandate_paused: an autopay or mandate was paused.
- mandate_cancelled: an autopay or mandate was cancelled or revoked.
- debit_scheduled: money will be taken on a future date (pre-debit notice or reminder).
- debit_posted: money was taken (debited, spent, charged, renewed and charged).
- debit_failed: a debit did not go through (failed, declined, insufficient balance).
- refund: money came back to the user.
- not_payment: anything else, such as offers, promotions and balance alerts. Every other field is then null.

Field rules:
- merchantText: the business as written in the message (GYMFITLINE, Spotify AB). Null if none.
- amountPaise: the payment amount in paise, a whole number: rupees x 100 (Rs 1,234.50 is 123450). For a mandate, its amount or maximum amount. Null if none.
- occurredOn: the date the event happened, only if the message states it. Format YYYY-MM-DD. Null otherwise.
- dueOn: the future date money will be taken, for debit_scheduled only. Format YYYY-MM-DD. Null otherwise.
- Dates: if a date has no year, use the year of the received date. A two-digit year like 26 means 2026. Dates like 05-11-26 are day-month-year.
- reference: the mandate reference (UMN or UMRN) if there is one, otherwise the transaction reference or bill number. Copy the code itself, without label words like "UMN", "UMRN:" or "Ref no.". Null if none.
- accountHint: the last four digits of the account or card (XX4417 gives 4417). Null if none.
- Never guess. Anything not in the message is null.

Examples:
Received 2026-03-02. "Rs 999.00 debited from A/c XX1234 on 01-03-26 for UPI/ZEE5/55120. UPI Ref 600123456789" ->
{"kind":"debit_posted","merchantText":"ZEE5","amountPaise":99900,"occurredOn":"2026-03-01","dueOn":null,"reference":"600123456789","accountHint":"1234"}
Received 2026-03-02. "Dear customer, your UPI Autopay for Disney Plus of Rs. 299 is scheduled for 10 Mar. UMN abc123@upi. A/c XX1234" ->
{"kind":"debit_scheduled","merchantText":"Disney Plus","amountPaise":29900,"occurredOn":null,"dueOn":"2026-03-10","reference":"abc123@upi","accountHint":"1234"}"""

SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": KINDS},
        "merchantText": {"type": ["string", "null"]},
        "amountPaise": {"type": ["integer", "null"]},
        "occurredOn": {"type": ["string", "null"]},
        "dueOn": {"type": ["string", "null"]},
        "reference": {"type": ["string", "null"]},
        "accountHint": {"type": ["string", "null"]},
    },
    "required": ["kind", "merchantText", "amountPaise", "occurredOn", "dueOn", "reference", "accountHint"],
}


def has_secret(message):
    rest = _AMOUNT.sub(" ", _WARNING.sub(" ", message))
    return bool(_SECRET_WORD.search(rest) and _CODE.search(rest))


def clean(event):
    """The spec's own rules, enforced in code rather than trusted to the model."""
    if event is None:
        return None
    if event.get("kind") == "not_payment":
        return {field: (event["kind"] if field == "kind" else None) for field in event}
    if event.get("kind") != "debit_scheduled":
        event["dueOn"] = None
    return event


def ask_ollama(messages, use_schema=True):
    """Sends the chat to local Ollama and returns the raw reply."""
    body = {
        "model": MODEL,
        "messages": messages,
        "stream": False,
        "think": False,
        "options": {"temperature": 0},
    }
    if use_schema:
        body["format"] = SCHEMA
    request = urllib.request.Request(
        OLLAMA_URL, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read())["message"]["content"].strip()


def parse_json(raw):
    """The JSON object in a reply, tolerating code fences or stray text around it."""
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(raw[start:end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def extract(message, received_on, use_schema=True, ask=None):
    """Returns (parsed JSON or None, raw reply, seconds). A secret is dropped: (None, "DROPPED", 0).

    `ask` takes the chat messages and returns the model's raw reply. It defaults
    to Ollama; ai/training/mlx_backend.py supplies one for MLX models and adapters. The
    secret filter, the prompt and the guardrails are the same for every backend.
    """
    if has_secret(message):
        return None, "DROPPED", 0.0
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Received {received_on}. {message}"},
    ]
    started = time.time()
    raw = ask(messages) if ask else ask_ollama(messages, use_schema=use_schema)
    seconds = time.time() - started
    event = clean(parse_json(raw))
    if event is None:
        return None, raw, seconds
    return event, json.dumps(event, separators=(",", ":")), seconds


if __name__ == "__main__":
    event, raw, seconds = extract(" ".join(sys.argv[1:]), time.strftime("%Y-%m-%d"))
    print(raw)
    print(f"({seconds:.1f} s)")
