"""Runs a Qwen3 model through MLX, with or without a LoRA adapter.

Used by the scorers so a base model and its fine-tuned version are judged
through exactly the same code path. Needs the ml/.venv environment
(pip install -r ml/requirements.txt).
"""
from mlx_lm import generate, load


class MlxModel:
    def __init__(self, model, adapter=None):
        self.name = model
        self.adapter = adapter
        self.model, self.tokenizer = load(model, adapter_path=adapter)

    def prompt_tokens(self, messages):
        # enable_thinking=False ends the prompt with an empty <think></think>
        # block, which is also how the training rows are rendered.
        return self.tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, enable_thinking=False, tokenize=True
        )

    def ask(self, messages):
        """The model's reply to a chat. Greedy decoding, so the same input gives the same output."""
        reply = generate(self.model, self.tokenizer, prompt=self.prompt_tokens(messages), max_tokens=200, verbose=False)
        return reply.split("</think>")[-1].strip()
