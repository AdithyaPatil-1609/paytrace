"""Scores Job 4 (commitment or everyday spending) on a test set.

    ml/.venv/bin/python ml/eval_recurring.py ml/data/recurring_test.jsonl --model qwen3:14b
    ml/.venv/bin/python ml/eval_recurring.py ml/data/recurring_dev.jsonl --mlx mlx-community/Qwen3-8B-4bit
    ml/.venv/bin/python ml/eval_recurring.py ml/data/recurring_dev.jsonl --mlx mlx-community/Qwen3-8B-4bit --adapter ml/adapters/qwen3-8b-recurring
    ml/.venv/bin/python ml/eval_recurring.py ml/data/recurring_dev.jsonl --engine    # today's engine: every group is a commitment

Two errors matter, and they are not equal. A shop still shown as recurring is
noise. A real commitment hidden as everyday spending is worse: a bill or EMI
the person stops watching. Both are counted separately.
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import recurring  # noqa: E402

HERE = Path(__file__).parent


def accepted(kinds):
    return kinds if isinstance(kinds, list) else [kinds]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--model", help="an Ollama model, such as qwen3:14b")
    group.add_argument("--mlx", help="an MLX model, such as mlx-community/Qwen3-8B-4bit")
    group.add_argument("--engine", action="store_true", help="today's engine: every group is a commitment")
    parser.add_argument("--adapter", help="a LoRA adapter folder for --mlx")
    parser.add_argument("--name", help="a short name for the results file")
    args = parser.parse_args()

    rows = [json.loads(line) for line in Path(args.dataset).read_text().splitlines() if line.strip()]
    if args.engine:
        name = "engine-only"
        answer = lambda candidate: ({"verdict": "commitment", "kind": "unknown"}, "")  # noqa: E731
    else:
        if args.mlx:
            from mlx_backend import MlxModel
            model = MlxModel(args.mlx, args.adapter)
            ask = model.ask
            name = args.name or ("qwen3-8b-tuned" if args.adapter else "qwen3-8b-base")
        else:
            recurring.MODEL = args.model
            ask = None
            name = args.name or args.model.replace(":", "-")
        answer = lambda candidate: recurring.classify(candidate, ask=ask)  # noqa: E731

    verdict_ok = kind_ok = shops_shown = hidden = unparsed = 0
    lines = []
    started = time.time()
    for row in rows:
        got, raw = answer(row["candidate"])
        want = row["label"]
        if got is None:
            unparsed += 1
            got = {"verdict": "unsure", "kind": "unknown"}
        v_ok = got["verdict"] == want["verdict"]
        k_ok = v_ok and got["kind"] in accepted(want["kind"])
        verdict_ok += v_ok
        kind_ok += k_ok
        if want["verdict"] == "everyday_spending" and got["verdict"] == "commitment":
            shops_shown += 1
        if want["verdict"] == "commitment" and got["verdict"] == "everyday_spending":
            hidden += 1
        if not v_ok:
            lines.append(f"| {row['tag']} | `{row['candidate']['merchant']}` | {want['verdict']} | {got['verdict']} ({got['kind']}) |")
    seconds = time.time() - started

    total = len(rows)
    everyday = sum(row["label"]["verdict"] == "everyday_spending" for row in rows)
    commitments = sum(row["label"]["verdict"] == "commitment" for row in rows)
    summary = [
        f"# Job 4 on {Path(args.dataset).name}: {name} (prompt {recurring.VERSION})",
        "",
        f"- Verdict correct: **{verdict_ok}/{total} ({100 * verdict_ok / total:.0f}%)**",
        f"- Verdict and kind correct: {kind_ok}/{total}",
        f"- Everyday spending still shown as recurring: {shops_shown}/{everyday}",
        f"- Real commitments hidden as everyday spending (the worse error): {hidden}/{commitments}",
        f"- Unreadable replies: {unparsed}",
        f"- Time: {seconds:.0f} s ({seconds / total:.1f} s per group)",
        "",
    ]
    if lines:
        summary += ["| Case | Statement text | Expected | Got |", "| --- | --- | --- | --- |", *lines]
    text = "\n".join(summary) + "\n"
    out = HERE / "results" / f"{Path(args.dataset).stem}_{name}_{recurring.VERSION}.md"
    out.write_text(text)
    print(text)
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
