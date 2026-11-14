"""Job 1: turn a user's question into intent JSON, using local Qwen through Ollama.

The model only labels the question. Neo4j answers it; the model never does maths.

    python3 ml/intent.py "did i cancel that gym thing"
"""
import json
import sys
import time
import urllib.request

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen3:14b"

INTENTS = [
    "why_debit",
    "upcoming_total",
    "mandate_status",
    "charged_after_cancel",
    "set_aside",
    "list_by_merchant",
    "spend_total",
    "how_to_cancel",
    "unknown",
]

SYSTEM_PROMPT = """You route questions for Paytrace, a tracker for recurring payments and autopays in India.
Reply with JSON only, with exactly these fields: intent, merchant, amount, period.

Intents:
- why_debit: asks why a specific past charge or debit happened.
- upcoming_total: asks how much will go out in a coming period.
- mandate_status: asks whether an autopay or mandate is active, paused or cancelled.
- charged_after_cancel: says they cancelled or stopped something but were still charged.
- set_aside: asks how much money to keep aside before a date or before salary.
- list_by_merchant: asks what they pay one particular business.
- spend_total: asks how much they spent in a past period.
- how_to_cancel: asks how to stop or cancel a payment.
- unknown: anything that is not about their own recurring payments.

Field rules:
- merchant: the user's own words for the business, even if vague or misspelt (gym, music app, spotfy). Otherwise null.
- period: the time words in the question, written in English (yesterday, this week, before salary, last month). Translate Hindi or Hinglish time words into English. Otherwise null.
- amount: a plain number with no currency sign or commas (1,200.00 becomes 1200). Otherwise null.
- If the intent is unknown, every other field is null.

Examples:
"paused my music app?" -> {"intent":"mandate_status","merchant":"music app","amount":null,"period":null}
"kitne paise jayenge is mahine" -> {"intent":"upcoming_total","merchant":null,"amount":null,"period":"this month"}
"got billed 199 by the cloud storage people after cancelling" -> {"intent":"charged_after_cancel","merchant":"cloud storage people","amount":199,"period":null}"""

# Structured output: Ollama constrains the reply to this shape, so the intent
# can only be one of the nine and every field is always present.
SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": INTENTS},
        "merchant": {"type": ["string", "null"]},
        "amount": {"type": ["number", "null"]},
        "period": {"type": ["string", "null"]},
    },
    "required": ["intent", "merchant", "amount", "period"],
}


def route(question, use_schema=True):
    """Returns (parsed JSON or None, raw reply, seconds taken)."""
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": question},
        ],
        "stream": False,
        "think": False,
        "options": {"temperature": 0},
    }
    if use_schema:
        body["format"] = SCHEMA
    request = urllib.request.Request(
        OLLAMA_URL, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
    )
    started = time.time()
    with urllib.request.urlopen(request, timeout=120) as response:
        raw = json.loads(response.read())["message"]["content"].strip()
    seconds = time.time() - started
    try:
        return json.loads(raw), raw, seconds
    except json.JSONDecodeError:
        return None, raw, seconds


if __name__ == "__main__":
    answer, raw, seconds = route(" ".join(sys.argv[1:]) or "did i cancel that gym thing")
    print(raw)
    print(f"({seconds:.1f} s)")
