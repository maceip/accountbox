# mlx-gmail — the external MLX fine-tune that produced the shipped Gmail adapter

Vendored 2026-07-06 from `~/bbverifier` (now archived at `~/_archive/bbverifier`)
so the Gmail adapter can be retrained without a sibling checkout. This is the
"external fine-tune + equip" path referenced by
`src/lib/runtime/gmail-agent-runtime.ts`.

Provenance: `adapters/gmail-agent/adapters.safetensors` produced by
`mlx_lm.lora` with this exact config and `data/{train,valid}.jsonl`
(the as-trained snapshot from bbverifier `data/gmail-sft-prep`, 2026-07-01).
The final adapter is byte-identical to the served copy at
`public/adapters/gmail-agent/adapters.safetensors`. Intermediate checkpoints
(`0000025…0000100`) are kept here (gitignored) and mirrored to the private HF
repo `macmacmacmac/accountbox` under `adapters/gmail-agent-checkpoints/` via
`bun run hf:upload`.

Note: `data/train.jsonl` here is the 2026-07-01 as-trained snapshot; the
regenerable dataset (byte-locked to `FIXED_SYSTEM_PROMPT`) is
`training/gmail-agent-train.jsonl` via `training/generate-gmail-dataset.ts`.
They differ. If you retrain after a prompt change, regenerate — do not reuse
this snapshot.

## Setup (once)

```bash
cd training/mlx-gmail
uv venv --python 3.12 .venv
uv pip install --python .venv mlx-lm "huggingface_hub[hf_transfer]"
```

## Train

```bash
cd training/mlx-gmail
./train.sh          # mlx_lm.lora --config lora_config.yaml -> adapters/gmail-agent/
```

## Eval (real generations, no replay)

```bash
cd training/mlx-gmail
.venv/bin/python eval_gmail.py adapters/gmail-agent   # tuned
.venv/bin/python eval_gmail.py base                   # baseline must FAIL
```

The authoritative repo-level gate is `training/eval-real-mlx.py` (18
accountbox prompts). Run it with this venv:

```bash
training/mlx-gmail/.venv/bin/python training/eval-real-mlx.py public/adapters/gmail-agent
```

## Equip

Copy the new adapter into the served directory and stamp provenance:

```bash
cp adapters/gmail-agent/adapters.safetensors ../../public/adapters/gmail-agent/
cp adapters/gmail-agent/adapter_config.json  ../../public/adapters/gmail-agent/
bun run ../../training/stamp-adapter-manifest.ts
bun run hf:upload   # keep the HF mirror in sync
```
