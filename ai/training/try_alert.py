"""One bank alert through the fine-tuned model.

    ai/training/.venv/bin/python ai/training/try_alert.py "Rs.649 debited from A/c XX4417 for NETFLIX on 12-11-26"
    ai/training/.venv/bin/python ai/training/try_alert.py --base "..."     # the same model without the adapter

The message goes through the same secret filter, prompt and guardrails as
the scorer. An OTP or PIN message prints DROPPED and never reaches the model.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from alerts import extract, has_secret  # noqa: E402

MODEL = "mlx-community/Qwen3-8B-4bit"
ADAPTER = str(Path(__file__).parent / "adapters" / "qwen3-8b-alerts")


def main():
    args = [arg for arg in sys.argv[1:] if arg != "--base"]
    message = " ".join(args)
    if not message:
        sys.exit(__doc__)
    if has_secret(message):
        print("DROPPED: this message holds an OTP, PIN or password, so it was never sent to the model.")
        return
    from mlx_backend import MlxModel  # slow import, only once we know the model is needed

    model = MlxModel(MODEL, adapter=None if "--base" in sys.argv else ADAPTER)
    event, raw, seconds = extract(message, time.strftime("%Y-%m-%d"), ask=model.ask)
    print(raw)
    print(f"({seconds:.1f} s, {'base model' if '--base' in sys.argv else 'fine-tuned'})")


if __name__ == "__main__":
    main()
