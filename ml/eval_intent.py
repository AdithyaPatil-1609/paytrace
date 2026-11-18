"""Scores Job 1 (question -> intent JSON) against a test set in ml/data/.

    python3 ml/eval_intent.py                         # the held-out set, with the JSON schema
    python3 ml/eval_intent.py --set intent_test       # the original 40 (now a practice set)
    python3 ml/eval_intent.py --no-schema             # prompt only, for comparison

intent_test_v2 is the held-out set: written before prompt v2 was run, and
never used to change the prompt. intent_test was used to find prompt v1's
weak spot, so it is a practice set now, not a fair exam.

A question counts as correct only when all four fields match. Writes
ml/results/<set>_<mode>_prompt-<version>.md, the table to show judges.
"""
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from intent import MODEL, PROMPT_VERSION, route  # noqa: E402

HERE = Path(__file__).parent
FIELDS = ["intent", "merchant", "amount", "period"]


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
    if isinstance(expected, (int, float)):
        return isinstance(got, (int, float)) and float(got) == float(expected)
    return norm(got) == norm(expected)


def main():
    use_schema = "--no-schema" not in sys.argv
    mode = "schema" if use_schema else "prompt-only"
    test_set = sys.argv[sys.argv.index("--set") + 1] if "--set" in sys.argv else "intent_test_v2"
    rows = [json.loads(line) for line in (HERE / "data" / f"{test_set}.jsonl").read_text().splitlines() if line.strip()]

    field_hits = defaultdict(int)
    tag_hits = defaultdict(lambda: [0, 0])
    times, misses, correct = [], [], 0

    print(f"Scoring {MODEL} (prompt {PROMPT_VERSION}, {mode}) on {test_set}: {len(rows)} questions...\n")
    for index, row in enumerate(rows, 1):
        got, raw, seconds = route(row["q"], use_schema=use_schema)
        times.append(seconds)
        checks = {field: got is not None and field_ok(row[field], got.get(field)) for field in FIELDS}
        for field, ok in checks.items():
            field_hits[field] += ok
        all_ok = all(checks.values())
        correct += all_ok
        tag_hits[row["tag"]][0] += all_ok
        tag_hits[row["tag"]][1] += 1
        mark = "✓" if all_ok else "✗"
        print(f"{index:2}. {mark} {seconds:4.1f}s  {row['q']}")
        if not all_ok:
            wrong = [field for field, ok in checks.items() if not ok]
            print(f"       got      {raw}")
            print(f"       expected { {field: row[field] for field in FIELDS} }  (wrong: {', '.join(wrong)})")
            misses.append((row, raw, wrong))

    total = len(rows)
    lines = [
        f"# Job 1 · intent routing · {MODEL} · prompt {PROMPT_VERSION} · {mode}",
        "",
        f"Test set: `ml/data/{test_set}.jsonl`, {total} questions none of which appear in the prompt.",
        "A question is correct only when intent, merchant, amount and period all match.",
        "",
        "| Measure | Result |",
        "| --- | --- |",
        f"| Fully correct | **{correct}/{total} ({correct / total:.0%})** |",
    ]
    lines += [f"| {field} correct | {field_hits[field]}/{total} ({field_hits[field] / total:.0%}) |" for field in FIELDS]
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
            lines.append(f"- `{row['q']}` → `{raw}` (wrong: {', '.join(wrong)})")

    out = HERE / "results" / f"{test_set}_{mode}_prompt-{PROMPT_VERSION}.md"
    out.write_text("\n".join(lines) + "\n")
    print("\n" + "\n".join(lines[5:13]))
    print(f"\nSaved {out.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
