/*
 * Emberglass — Qwen2.5 WebGPU runtime (custom kernels, int4, runtime LoRA)
 * Vendored in AccountBox at src/engine/.
 */

// GrpoController: in-browser GRPO (group-relative policy optimization) on top
// of QwenLoraTrainer. The whole trick is that the existing CE backward kernel
// computes dLogits = mask[t] * lossScale * (softmax - onehot); feeding the
// per-token mask a sequence ADVANTAGE (any float) turns the SFT backward into
// the policy gradient of -A * log p(y) — no new WGSL.
//
// v1 algorithm (single-inner-update GRPO, DeepSeekMath setting):
//   1. For each prompt, sample G completions from the CURRENT policy
//      (LoRA-modified weights; optimizerStep -> invalidateLora keeps rollouts
//      on-policy automatically).
//   2. Score each completion with an injected, task-owned rewardFn.
//   3. Advantage A_i = (r_i - mean(r)) / (std(r) + eps) within the group.
//   4. One weighted microStep per completion (weights = A on completion
//      positions, 0 on prompt), then a single optimizerStep.
//   With one update per batch the importance ratio is exactly 1, so no
//   clipping term is needed. KL-to-reference is beta=0 in v1.

import { formatMessages } from './prompt_formatter.js';

const IM_END = 151645; // <|im_end|>
const EOS_IDS = [151645, 151643];

// Pure, unit-testable core of GRPO: group-relative advantage normalization.
// A degenerate group (all rewards equal) yields all-zero advantages — no
// gradient signal, and the caller skips those rollouts.
export function groupRelativeAdvantages(rewards, eps = 1e-6) {
  const n = rewards.length;
  if (n === 0) return [];
  const mean = rewards.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(rewards.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  if (std === 0) return rewards.map(() => 0);
  return rewards.map((r) => (r - mean) / (std + eps));
}

export class GrpoController {
  // session: loaded ModelSession. trainer: an ATTACHED QwenLoraTrainer
  // (create via TrainingController.initAdapter()/attachAdapter() or directly).
  constructor({ session, trainer, log = () => {} } = {}) {
    if (!session?.rt) throw new Error('GrpoController: loaded session required');
    if (!trainer?.adapter) throw new Error('GrpoController: attached trainer required');
    this.session = session;
    this.trainer = trainer;
    this.log = log;
  }

  get rt() {
    return this.session.rt;
  }
  get tokenizer() {
    return this.session.tokenizer;
  }

  encodePrompt(messages) {
    return this.tokenizer.encode(formatMessages(this.tokenizer, messages));
  }

  // Sample one completion from the current policy, keeping the EXACT token ids
  // (decoding then re-encoding is not identity, so ids are the training truth).
  // Mirrors ModelSession.generate's sampled path, minus text streaming.
  async sampleCompletionIds(
    promptIds,
    { maxTokens = 160, temperature = 0.9, topK = 40, topP = 0.95, stopIds = EOS_IDS } = {},
  ) {
    const rt = this.rt;
    if (promptIds.length <= rt.maxPrefillT) rt.prefillBatch(promptIds);
    else for (let p = 0; p < promptIds.length; p++) rt.token(promptIds[p], p);
    let pos = promptIds.length;
    const ids = [];
    let next = await this.session.sampleNextToken({ temperature, topK, topP });
    for (let i = 0; i < maxTokens; i++) {
      if (stopIds.includes(next)) break;
      ids.push(next);
      rt.token(next, pos);
      pos++;
      next = await this.session.sampleNextToken({ temperature, topK, topP });
    }
    return ids;
  }

  // tokens + per-token float weights for one scored rollout. Same shifted-label
  // masking as TrainingController.prepareExample: weight positions whose NEXT
  // token belongs to the completion (incl. final EOS); prompt gets 0.
  buildWeighted({ promptIds, ids, advantage }) {
    const tokens = [...promptIds, ...ids, IM_END];
    const T = tokens.length;
    const weights = new Array(T).fill(0);
    for (let t = Math.max(0, promptIds.length - 1); t < T - 1; t++) weights[t] = advantage;
    return { tokens, weights };
  }

  /*
   * One GRPO iteration.
   *   prompts:  [{ messages, gold }] — chat-format prompt + whatever the
   *             rewardFn needs to verify against (task-owned, injected).
   *   rewardFn: (text, gold, prompt) => finite number.
   * Returns per-iteration stats; rollouts are included so callers can render
   * or log them (they are never persisted here).
   */
  async step({
    prompts,
    groupSize = 4,
    rewardFn,
    sampling = {},
    maxTrainSeq,
    advClipPos = 1.0,
    advClipNeg = 0.0,
  } = {}) {
    if (!Array.isArray(prompts) || prompts.length === 0)
      throw new Error('grpo.step: prompts required');
    if (typeof rewardFn !== 'function') throw new Error('grpo.step: rewardFn required');
    const cap = maxTrainSeq ?? this.trainer.opts.maxTrainSeq;
    const t0 = globalThis.performance?.now?.() ?? Date.now();

    // 1+2) rollouts + rewards (sampling runs on the current LoRA policy)
    const groups = [];
    for (const p of prompts) {
      const promptIds = this.encodePrompt(p.messages);
      const group = [];
      for (let g = 0; g < groupSize; g++) {
        const ids = await this.sampleCompletionIds(promptIds, sampling);
        const text = this.tokenizer.decode(ids, { skip_special_tokens: true });
        const reward = Number(rewardFn(text, p.gold, p));
        if (!Number.isFinite(reward)) throw new Error('grpo.step: rewardFn returned non-finite');
        group.push({ promptIds, ids, text, reward });
        this.log(`rollout g${g} r=${reward.toFixed(3)} len=${ids.length}`);
      }
      groups.push(group);
    }

    // 3) group-relative advantages, asymmetrically clipped. std-normalized
    // advantages explode on nearly-degenerate groups (rewards 1,1,1,0.8 ->
    // ±1.7 per token), and with G=4 + single-sample updates the NEGATIVE side
    // is the killer: "unlearn this rollout" gradients on a warm policy raze
    // the very behavior that produces valid verdicts — a proven collapse mode
    // (2026-07-05: meanR 0.54 -> 0.79 -> 0.00 by iter 6, never recovered).
    // Default advClipNeg=0 makes v1 reinforce-best-of-group only; positive
    // advantages are capped at advClipPos.
    const allRewards = [];
    for (const group of groups) {
      const rs = group.map((r) => r.reward);
      allRewards.push(...rs);
      const adv = groupRelativeAdvantages(rs);
      group.forEach((r, i) => {
        r.advantage = Math.max(-advClipNeg, Math.min(advClipPos, adv[i]));
      });
    }

    // 4) weighted micro-steps + one optimizer step
    let micro = 0;
    let skipped = 0;
    let objSum = 0;
    for (const group of groups) {
      for (const r of group) {
        if (r.advantage === 0) {
          skipped++; // degenerate group (all rewards equal) carries no signal
          continue;
        }
        const { tokens, weights } = this.buildWeighted(r);
        if (tokens.length > cap) {
          skipped++;
          this.log(`skip rollout: ${tokens.length} tokens > maxTrainSeq ${cap}`);
          continue;
        }
        const res = await this.trainer.microStep(tokens, weights);
        objSum += res.loss; // weighted objective (advantage-scaled CE)
        micro++;
      }
    }
    let opt = { lr: 0, gradNorm: 0, clip: 1 };
    if (micro > 0) opt = await this.trainer.optimizerStep();
    else this.trainer.zeroGrads(); // keep the accumulation window clean

    const mean = allRewards.reduce((a, b) => a + b, 0) / Math.max(1, allRewards.length);
    const std = Math.sqrt(
      allRewards.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, allRewards.length),
    );
    const stepMs = (globalThis.performance?.now?.() ?? Date.now()) - t0;
    return {
      meanReward: mean,
      rewardStd: std,
      rewards: allRewards,
      microBatches: micro,
      skipped,
      objective: micro ? objSum / micro : 0,
      lr: opt.lr,
      gradNorm: opt.gradNorm,
      stepMs,
      rollouts: groups.map((group) =>
        group.map(({ text, reward, advantage, ids }) => ({
          text,
          reward,
          advantage,
          tokens: ids.length,
        })),
      ),
    };
  }

  // Greedy decode for held-out verification (temperature 0, exact ids kept).
  async greedyCompletionText(messages, { maxTokens = 200 } = {}) {
    let out = '';
    for await (const chunk of this.session.generate(messages, {
      maxTokens,
      temperature: 0.0,
    })) {
      out += chunk;
    }
    return out;
  }
}
