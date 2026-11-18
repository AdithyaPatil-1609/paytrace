"""Checks every claim made about the Job 3 fine-tune, and prints PASS or FAIL for each.

    ml/.venv/bin/python ml/verify.py            # everything, about 6 minutes
    ml/.venv/bin/python ml/verify.py --quick    # skips re-scoring the models, a few seconds

What it checks:
  1. The secret filter drops OTPs and keeps ordinary alerts (unit tests).
  2. The dataset is reproducible: regenerating it gives the same files, byte for byte.
  3. No alert appears in more than one of train, valid and test.
  4. Every label is copied from its message (merchant, reference, account).
  5. The adapter exists and was trained on the model the scores are reported for.
  6. Re-scoring the base and the fine-tuned model reproduces the saved results.
  7. The fine-tuned model beats its own base model on alerts it never saw.

Nothing here trains or changes the model. It only reads and re-measures.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
DATA = HERE / "data"
RESULTS = HERE / "results"
BASE_MODEL = "mlx-community/Qwen3-8B-4bit"
ADAPTER = HERE / "adapters" / "qwen3-8b-alerts"
DATA_FILES = [DATA / "alerts_test.jsonl", DATA / "mlx" / "train.jsonl", DATA / "mlx" / "valid.jsonl",
              DATA / "mlx" / "test.jsonl"]

failures = []


def check(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""))
    if not ok:
        failures.append(name)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def saved_score(result_file):
    """(correct, total) from a saved results table."""
    match = re.search(r"Fully correct \| \*\*(\d+)/(\d+)", (RESULTS / result_file).read_text())
    return int(match.group(1)), int(match.group(2))


def rescore(test_set, label, adapter):
    """Runs the scorer again and returns (correct, total) from its fresh output."""
    command = [sys.executable, str(HERE / "eval_alerts.py"), "--set", test_set, "--mlx", BASE_MODEL, "--label", label]
    if adapter:
        command += ["--adapter", str(ADAPTER.relative_to(ROOT))]
    done = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    match = re.search(r"Fully correct \| \*\*(\d+)/(\d+)", done.stdout)
    if not match:
        print(done.stdout[-600:], done.stderr[-600:])
        return None
    return int(match.group(1)), int(match.group(2))


def main():
    quick = "--quick" in sys.argv

    print("\n1. Secret filter")
    tests = subprocess.run([sys.executable, "-m", "unittest", str(HERE / "test_secret_filter.py")],
                           cwd=ROOT, capture_output=True, text=True)
    check("OTP, PIN and password messages are dropped; ordinary alerts are kept", tests.returncode == 0)

    print("\n2. Dataset is reproducible")
    before = {path: sha(path) for path in DATA_FILES}
    generated = subprocess.run([sys.executable, str(HERE / "gen_alerts.py")], cwd=ROOT, capture_output=True, text=True)
    after = {path: sha(path) for path in DATA_FILES}
    check("the generator runs", generated.returncode == 0)
    check("regenerating gives identical files", before == after,
          ", ".join(path.name for path in DATA_FILES if before[path] != after[path]) or "4 files, same checksums")

    print("\n3. No leakage between splits")
    def user_text(row):
        return row["messages"][1]["content"]
    train = {user_text(row) for row in rows(DATA / "mlx" / "train.jsonl")}
    valid = {user_text(row) for row in rows(DATA / "mlx" / "valid.jsonl")}
    test = {user_text(row) for row in rows(DATA / "mlx" / "test.jsonl")}
    dev = {f"Received {row['received']}. {row['msg']}" for row in rows(DATA / "alerts_dev.jsonl")}
    check("train and test share no alert", not (train & test), f"{len(train)} train, {len(test)} test")
    check("valid and test share no alert", not (valid & test))
    check("train and valid share no alert", not (train & valid), f"{len(valid)} valid")
    check("the 20 hand-written alerts are not in the training data", not (dev & (train | valid)))

    def skeleton(text):
        # the wording of an alert with its values removed
        return re.sub(r"[\d₹]+|\b[A-Z][\w.*/]*\b", "#", text.split(". ", 1)[1])[:40]
    check("test alerts are worded differently from training alerts",
          not ({skeleton(text) for text in test} & {skeleton(text) for text in train}))

    print("\n4. Labels are copied from the message, not invented")
    invented = 0
    for split in ("train", "valid", "test"):
        for row in rows(DATA / "mlx" / f"{split}.jsonl"):
            label = json.loads(row["messages"][2]["content"])
            text = user_text(row).lower()
            invented += sum(1 for field in ("merchantText", "reference", "accountHint")
                            if label[field] is not None and str(label[field]).lower() not in text)
    check("every merchant, reference and account label appears in its message", invented == 0,
          f"{invented} not found" if invented else "")

    print("\n5. The adapter")
    weights, config = ADAPTER / "adapters.safetensors", ADAPTER / "adapter_config.json"
    check("adapter weights exist", weights.exists(),
          f"{weights.stat().st_size / 1e6:.0f} MB" if weights.exists() else "ml/adapters/qwen3-8b-alerts is missing")
    if config.exists():
        trained_on = json.loads(config.read_text()).get("model")
        check("it was trained on the model the scores are reported for", trained_on == BASE_MODEL, str(trained_on))

    print("\n6. Saved scores are reproducible" + ("  (skipped: --quick)" if quick else "  (re-running both models, a few minutes)"))
    saved = {
        ("alerts_test", "base"): saved_score("alerts_test_qwen3-8b-base_v2.md"),
        ("alerts_test", "tuned"): saved_score("alerts_test_qwen3-8b-tuned_v2.md"),
        ("alerts_dev", "base"): saved_score("alerts_dev_qwen3-8b-base_v2.md"),
        ("alerts_dev", "tuned"): saved_score("alerts_dev_qwen3-8b-tuned_v2.md"),
    }
    if not quick:
        for (test_set, which), expected in saved.items():
            fresh = rescore(test_set, f"qwen3-8b-{which}", adapter=which == "tuned")
            check(f"{which} model on {test_set}: saved {expected[0]}/{expected[1]}", fresh == expected,
                  f"fresh run {fresh[0]}/{fresh[1]}" if fresh else "scorer failed")

    print("\n7. Fine-tuning helped, on alerts the model never saw")
    for test_set, description in (("alerts_test", "held-out generated alerts"), ("alerts_dev", "hand-written alerts")):
        base, tuned = saved[(test_set, "base")], saved[(test_set, "tuned")]
        check(f"{description}: tuned {tuned[0]}/{tuned[1]} vs base {base[0]}/{base[1]}", tuned[0] > base[0])

    print("\n" + ("ALL CHECKS PASSED" if not failures else f"{len(failures)} CHECK(S) FAILED: " + "; ".join(failures)))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
