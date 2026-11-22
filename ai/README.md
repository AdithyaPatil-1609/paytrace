# ai/: local Qwen models

Everything about the AI models in one place. Only models on the same machine are used, and OTP, PIN and password messages never reach a model.

| Path | Language | What it holds | README |
| --- | --- | --- | --- |
| `assistant/` | TypeScript | What the app runs: Ask AI, the bank-alert reader, the recurring check, prompts, and `secrets.ts` (the OTP guard) | |
| `training/` | Python | Prompts as the source of truth, data generators, LoRA configs and adapters, scoring scripts and results | [training/README.md](training/README.md) |
| `eval/` | CSV | `hostile.csv`: the attack cases that the security tests and sandbox cover | |

## Models

| Model | Used for | Start it |
| --- | --- | --- |
| `qwen3:14b` on Ollama | Ask AI answers and optional email reading | `ollama serve` (port 11434) |
| Qwen3 8B + alerts adapter | Reading a pasted bank alert | `npm run ai:alerts` (port 8080) |
| Qwen3 8B + recurring adapter | Second check on recurring payments | `npm run ai:recurring` (port 8081) |

The prompts in `assistant/prompts.ts` are copied word for word from `training/*.py`, and `tests/assistant.test.ts` fails if they drift apart.
