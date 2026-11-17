# Paytrace model work

A local Qwen3 model does three small language jobs for Paytrace. It never does maths, stores data or makes decisions; Neo4j does that.

| Job | Input | Output | Model | Status |
| --- | --- | --- | --- | --- |
| 1. Understand a question | "did i cancel that gym thing" | intent JSON | `qwen3:14b`, prompt only | 36/40 on held-out questions; no fine-tune needed |
| 2. Write the answer | facts from Neo4j | one or two sentences | `qwen3:14b` | not built yet |
| 3. Read a bank alert | a pasted SMS or email | PaymentEvent JSON | **Qwen3 8B + our LoRA adapter** | **49/49 and 20/20 after fine-tuning** |

## Job 3 results: the fine-tune

All rows use the same prompt, the same secret filter and the same guardrails. An alert counts as correct only when all seven fields match.

| Model | Held-out generated alerts (49) | Hand-written alerts (20) |
| --- | --- | --- |
| `qwen3:14b`, base (Ollama) | 45/49 (92%) | 18/20 (90%) |
| Qwen3 8B, base (MLX) | 45/49 (92%) | 15/20 (75%) |
| **Qwen3 8B + adapter (MLX)** | **49/49 (100%)** | **20/20 (100%)** |

The fine-tuned 8B model beats the larger 14B base model on both sets, at about half the size.

What it was trained on, and how it was tested:

- **Training data:** 318 synthetic alerts from 30 message templates (`gen_alerts.py`), with varied merchants, amounts in Indian digit grouping, 13 date formats, accounts and references. Every label is computed from the values that built the message. No real messages, names or account numbers.
- **Held-out test:** 45 alerts from 9 templates worded differently from every training template, plus 4 OTP messages that must be dropped before the model. Written and frozen before training.
- **Hand-written test:** 20 alerts written by hand in other styles. Never trained on.
- **Method:** LoRA on the 4-bit model (QLoRA) with MLX-LM: 16 layers, rank 8, learning rate 1e-4, 240 steps at batch size 2, loss on the answer only. Validation loss fell from 0.925 to 0.001. Config: `lora_alerts.yaml`.
- **Limits:** both test sets are synthetic and small. Real bank alerts will include formats neither set covers, so expect lower accuracy on real data until the template set grows.

## Check it yourself

```bash
python3 -m venv ml/.venv && ml/.venv/bin/pip install -r ml/requirements.txt   # once
ml/.venv/bin/python ml/verify.py            # every check, about 10 minutes
ml/.venv/bin/python ml/verify.py --quick    # skips re-scoring the models
```

`verify.py` prints PASS or FAIL for each claim above: the secret filter works, the dataset regenerates byte for byte, no alert leaks between train and test, labels are copied from their messages, and re-scoring both models reproduces the saved numbers.

Try one alert on the fine-tuned model:

```bash
ml/.venv/bin/python ml/try_alert.py "Rs.649 debited from A/c XX4417 for NETFLIX on 12-11-26. UMN abc123@upi"
```

## Serve it to the app or to teammates

```bash
ml/.venv/bin/python -m mlx_lm server --model mlx-community/Qwen3-8B-4bit --adapter-path ml/adapters/qwen3-8b-alerts --port 8080
```

This is an OpenAI-compatible server with no login. Keep it on localhost or a private network such as Tailscale; never expose it publicly. MLX needs an Apple Silicon Mac.

## Files

| File | Job |
| --- | --- |
| `intent.py`, `eval_intent.py` | Job 1 router and its scorer |
| `alerts.py` | Job 3 prompt, secret filter, guardrails, Ollama backend |
| `mlx_backend.py` | runs MLX models and adapters through the same path |
| `eval_alerts.py` | Job 3 scorer for any backend |
| `gen_alerts.py` | generates the dataset |
| `try_alert.py` | one alert through the fine-tuned model |
| `verify.py` | rechecks every claim |
| `test_secret_filter.py` | unit tests for the OTP filter |
| `lora_alerts.yaml` | training config |
| `adapters/qwen3-8b-alerts/` | the trained adapter (39 MB) and its training log |
| `data/` | test sets and MLX training files |
| `results/` | one saved table per scoring run |
