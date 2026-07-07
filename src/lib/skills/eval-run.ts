/**
 * Live seed-eval runner: drive a skill's real equipped planner over its
 * manifest eval cases and score each with the pure `evaluateSkillSuite`.
 *
 * Honest by construction: it refuses unless the skill is equipped for REAL
 * inference (no cold planning, no fake pass), and a `__cold` generation counts
 * as a failed case with the raw output shown. This is the automated,
 * cold-failing version of the manual browser gate — it needs a real WebGPU
 * browser with the adapter equipped, so it runs from the Eval Range button,
 * never in `bun test`.
 */
import type { AppSkill } from "@/lib/runtime/app-skill";
import { getSkillRuntime } from "@/lib/runtime/skill-runtimes";
import { evaluateSkillCase, type SkillEvalResult } from "./eval";

export type LiveEvalRow = SkillEvalResult & {
  prompt: string;
  cold: boolean;
  raw: string;
  unsupported: boolean;
};

export type LiveEvalOutcome =
  | { ok: false; reason: string }
  | { ok: true; skillId: string; passed: boolean; rows: LiveEvalRow[] };

/** Run the skill's seed eval cases against its live equipped planner. */
export async function runLiveSkillEval(
  skill: AppSkill,
): Promise<LiveEvalOutcome> {
  const rt = getSkillRuntime(skill);
  if (!rt.isEquippedForRealInference()) {
    return {
      ok: false,
      reason: `${skill.label} is not equipped for real inference — equip it first (Skills → Loadout). Eval never runs cold.`,
    };
  }

  const rows: LiveEvalRow[] = [];
  for (const evalCase of skill.evalCases) {
    const plan = await rt.generate(evalCase.prompt);
    const cold = Boolean(
      plan && typeof plan === "object" && "__cold" in plan && plan.__cold,
    );
    const raw =
      plan && typeof plan === "object" && "raw" in plan
        ? String((plan as { raw?: unknown }).raw ?? "")
        : "";
    // A cold/invalid plan scores as the harness sees it: extractPlannedTools
    // returns [] for the __cold sentinel, so a supported case fails (no valid
    // plan) and an unsupported case passes (no tools) — both correct.
    const result = evaluateSkillCase(skill, evalCase, cold ? null : plan);
    rows.push({
      ...result,
      prompt: evalCase.prompt,
      unsupported: Boolean(evalCase.unsupported),
      cold,
      raw,
    });
  }

  return {
    ok: true,
    skillId: skill.id,
    passed: rows.every((r) => r.passed),
    rows,
  };
}
