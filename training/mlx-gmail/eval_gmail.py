"""Real Gmail-plan eval — NO replay.

Loads VibeThinker-3B (optionally + a LoRA adapter), runs the held-out Gmail
prompts through the ACTUAL model, and scores the model's real JSON Plan output.

    cd training/mlx-gmail && .venv/bin/python eval_gmail.py adapters/gmail-agent   # tuned
    cd training/mlx-gmail && .venv/bin/python eval_gmail.py base                   # base (no adapter)
"""
import json
import sys
from pathlib import Path

from mlx_lm import load, generate

ARG = sys.argv[1] if len(sys.argv) > 1 else "adapters/gmail-agent"
DATA = Path("data/valid.jsonl")
ALLOWED = {"search_messages", "read_message", "create_draft"}


def tools_of(obj):
    if not isinstance(obj, dict):
        return []
    if "tool" in obj:
        return [obj.get("tool")]
    if "steps" in obj and isinstance(obj["steps"], list):
        return [s.get("tool") for s in obj["steps"] if isinstance(s, dict)]
    return []


def clean(text):
    # The model's turn ends at <|im_end|>; anything after is post-EOS noise
    # (mlx_lm generate did not treat it as a stop token). Score only the turn.
    for stop in ("<|im_end|>", "<|endoftext|>"):
        i = text.find(stop)
        if i != -1:
            text = text[:i]
    return text.strip()


def parse_plan(text):
    t = clean(text)
    # The real answer is the FIRST JSON object of the turn.
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
    return None


def main():
    base = "WeiboAI/VibeThinker-3B"
    if ARG in ("base", "none", "NONE"):
        label = "BASE (no adapter)"
        model, tok = load(base)
    else:
        label = f"TUNED (adapter={ARG})"
        model, tok = load(base, adapter_path=ARG)

    rows = [json.loads(l) for l in DATA.read_text(encoding="utf-8").splitlines() if l.strip()]
    ok_json = ok_tools = ok_set = 0
    print(f"\n########## EVAL: {label}  ({len(rows)} held-out gmail prompts) ##########")
    for i, row in enumerate(rows):
        msgs = row["messages"]
        gold = parse_plan(msgs[-1]["content"])
        prompt = tok.apply_chat_template(msgs[:-1], add_generation_prompt=True)
        out = generate(model, tok, prompt=prompt, max_tokens=256, verbose=False)
        pred = parse_plan(out)
        j = pred is not None
        pt = tools_of(pred)
        t = j and len(pt) > 0 and all(x in ALLOWED for x in pt)
        s = t and set(pt) == set(tools_of(gold))
        ok_json += int(j); ok_tools += int(t); ok_set += int(s)
        print(f"\n===== {i}  user: {msgs[-2]['content'][:90]!r}")
        print(f"GOLD tools: {tools_of(gold)}")
        print(f"RAW MODEL OUTPUT: {out.strip()[:400]}")
        print(f"PRED tools: {pt}  | validJSON={j} allowedTools={t} toolsetMatch={s}")
    n = len(rows)
    print(f"\n[eval] {label}: validJSON {ok_json}/{n} | allowedTools {ok_tools}/{n} | toolsetMatch {ok_set}/{n}")


if __name__ == "__main__":
    main()
