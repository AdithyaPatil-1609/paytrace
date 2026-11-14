"""Scores Job 3 (bank alert -> PaymentEvent JSON) against a set in ml/data/.

    python3 ml/eval_alerts.py                    # the 20 hand-written alerts, with the JSON schema
    python3 ml/eval_alerts.py --set alerts_test  # another set
    python3 ml/eval_alerts.py --no-schema        # prompt only, for comparison

An alert counts as correct only when all seven fields match. A row marked
"dropped" (it holds an OTP or PIN) is correct only if it never reaches the
model. Writes ml/results/<set>_<mode>_prompt-<version>.md.
"""
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from alerts import MODEL, PROMPT_VERSION, extract  # noqa: E402

HERE = Path(__file__).parent
FIELDS = ["kind", "merchantText", "amountPaise", "occurredOn", "dueOn", "reference", "accountHint"]


def norm(value):
    return value.strip().lower() if isinstance(value, str) else value


def field_ok(expected, got):
    """Expected is null, a value, or a list of acceptable values."""
    if expected is None:
        return got is None
    if got is None:
        return False
    if isinstance(expected, list):
        return norm(got) in [norm(option) for option in expected]
    if isinstance(expected, int):
        return isinstance(got, int) and not isinstance(got, bool) and got == expected
    return norm(got) == norm(expected)


def main():
    use_schema = "--no-schema" not in sys.argv
    mode = "schema" if use_schema else "prompt-only"
    test_set = sys.argv[sys.argv.index("--set") + 1] if "--set" in sys.argv else "alerts_dev"
    rows = [json.loads(line) for line in (HERE / "data" / f"{test_set}.jsonl").read_text().splitlines() if line.strip()]

    field_hits = defaultdict(int)
    tag_hits = defaultdict(lambda: [0, 0])
    times, misses, correct, scored = [], [], 0, 0

    print(f"Scoring {MODEL} (prompt {PROMPT_VERSION}, {mode}) on {test_set}: {len(rows)} alerts...\n")
    for index, row in enumerate(rows, 1):
        got, raw, seconds = extract(row["msg"], row["received"], use_schema=use_schema)
        if row.get("dropped"):
            ok = raw == "DROPPED"
            wrong = [] if ok else ["should have been dropped before the model"]
        else:
            scored += 1
            times.append(seconds)
            if raw == "DROPPED":
                checks = {field: False for field in FIELDS}
                raw = "DROPPED (but it holds no secret)"
            else:
                checks = {field: got is not None and field_ok(row[field], got.get(field)) for field in FIELDS}
            for field, field_correct in checks.items():
                field_hits[field] += field_correct
            ok = all(checks.values())
            wrong = [field for field, field_correct in checks.items() if not field_correct]
        correct += ok
        tag_hits[row["tag"]][0] += ok
        tag_hits[row["tag"]][1] += 1
        print(f"{index:2}. {'✓' if ok else '✗'} {seconds:4.1f}s  {row['msg'][:90]}")
        if not ok:
            print(f"       got      {raw}")
            if not row.get("dropped"):
                print(f"       expected { {field: row[field] for field in FIELDS} }")
            print(f"       wrong: {', '.join(wrong)}")
            misses.append((row, raw, wrong))

    total = len(rows)
    lines = [
        f"# Job 3 · alert extraction · {MODEL} · prompt {PROMPT_VERSION} · {mode}",
        "",
        f"Set: `ml/data/{test_set}.jsonl`, {total} synthetic alerts, none of which appear in the prompt.",
        "An alert is correct only when all seven fields match; a secret-bearing alert only when it is dropped before the model.",
        "",
        "| Measure | Result |",
        "| --- | --- |",
        f"| Fully correct | **{correct}/{total} ({correct / total:.0%})** |",
    ]
    lines += [f"| {field} correct | {field_hits[field]}/{scored} ({field_hits[field] / scored:.0%}) |" for field in FIELDS]
    lines += [
        f"| Median time | {statistics.median(times):.1f} s |",
        f"| Slowest | {max(times):.1f} s |",
        "",
        "| Category | Correct |",
        "| --- | --- |",
    ]
    lines += [f"| {tag} | {hits}/{count} |" for tag, (hits, count) in sorted(tag_hits.items())]
    if misses:
        lines += ["", "## Misses", ""]
        for row, raw, wrong in misses:
            lines.append(f"- `{row['msg'][:100]}` → `{raw}` (wrong: {', '.join(wrong)})")

    out = HERE / "results" / f"{test_set}_{mode}_prompt-{PROMPT_VERSION}.md"
    out.write_text("\n".join(lines) + "\n")
    print("\n" + "\n".join(lines[5:16]))
    print(f"\nSaved {out.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
