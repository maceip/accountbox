#!/usr/bin/env python3
"""REAL, headless, non-faked eval — direct MLX (no server, no browser, no replay).

Loads VibeThinker-3B (+ optional LoRA adapter), runs accountbox's OWN 18 synthetic
prompts through the ACTUAL model, and scores the model's real Plan JSON against the
expected tools. Target plans are used ONLY to grade — if the model doesn't produce
them, it fails. Run `base` (no adapter) to prove the adapter is what passes it.

Requires the MLX venv from training/mlx-gmail (see its README for setup):
  training/mlx-gmail/.venv/bin/python training/eval-real-mlx.py public/adapters/gmail-agent   # tuned
  training/mlx-gmail/.venv/bin/python training/eval-real-mlx.py base                          # baseline

Exit: 0 = pass, 1 = model failed the bar.
"""
import json
import math
import os
import sys
from pathlib import Path

from mlx_lm import load, generate

ROOT = Path(__file__).resolve().parent.parent  # repo root
BASE_MODEL = "WeiboAI/VibeThinker-3B"
ADAPTER = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "public/adapters/gmail-agent")
PASS_RATIO = float(os.environ.get("EVAL_PASS_RATIO", "0.7"))
ALLOWED = {"search_messages", "read_message", "create_draft"}


def tools_of(o):
    if not isinstance(o, dict):
        return []
    if "tool" in o:
        return [o["tool"]]
    if isinstance(o.get("steps"), list):
        return [s.get("tool") for s in o["steps"] if isinstance(s, dict)]
    return []


def clean(t):
    for s in ("<|im_end|>", "<|endoftext|>"):
        i = t.find(s)
        if i != -1:
            t = t[:i]
    return t.strip()


def parse_plan(t):
    t = clean(t)
    try:
        return json.loads(t)
    except Exception:
        pass
    for line in t.splitlines():
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                return json.loads(line)
            except Exception:
                pass
    a, b = t.find("{"), t.rfind("}")
    if a != -1 and b > a:
        try:
            return json.loads(t[a:b + 1])
        except Exception:
            pass
    return None


def main():
    sys_prompt = json.loads(
        (ROOT / "training/gmail-agent-train.jsonl").read_text().splitlines()[0]
    )["messages"][0]["content"]
    data = json.loads((ROOT / "training/gmail-synthetic-prompts.json").read_text())
    rows = []
    for p in data["prompts"]:
        exp = p.get("expected_tools") or tools_of((p.get("targets") or [{}])[0])
        rows.append((p["prompt"], exp))

    if ADAPTER in ("base", "none", "NONE"):
        label = "BASE (no adapter)"
        model, tok = load(BASE_MODEL)
    else:
        label = f"TUNED ({ADAPTER})"
        model, tok = load(BASE_MODEL, adapter_path=ADAPTER)

    okj = okt = oks = 0
    print(f"\n########## REAL EVAL: {label} — {len(rows)} accountbox prompts ##########")
    for i, (prompt, exp) in enumerate(rows):
        msgs = [{"role": "system", "content": sys_prompt}, {"role": "user", "content": prompt}]
        p = tok.apply_chat_template(msgs, add_generation_prompt=True)
        out = generate(model, tok, prompt=p, max_tokens=256, verbose=False)
        pred = parse_plan(out)
        pt = tools_of(pred)
        j = pred is not None
        t = j and len(pt) > 0 and all(x in ALLOWED for x in pt)
        s = t and set(pt) == set(exp)
        okj += int(j); okt += int(t); oks += int(s)
        print(f"\n[{i}] {prompt[:80]!r}")
        print(f"  expected={exp} pred={pt}  json={j} allowed={t} match={s}")
        print(f"  RAW: {clean(out)[:220]!r}")

    n = len(rows)
    need = math.ceil(PASS_RATIO * n)
    print(f"\n[eval] {label}: validJSON {okj}/{n} | allowedTools {okt}/{n} | toolsetMatch {oks}/{n} (need {need})")
    if label.startswith("TUNED"):
        ok = okj == n and oks >= need
        print("RESULT:", "PASS (real model, real generations, scored)" if ok else "FAIL (fail-closed)")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
