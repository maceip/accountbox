import type { AppSkill, EvalCase } from "@/lib/runtime/app-skill";
import { isValidToolPlan } from "@/lib/runtime/plan-parse";

export interface SkillEvalResult {
  skillId: string;
  caseId: string;
  passed: boolean;
  reason: string;
  expectedTools: readonly string[];
  actualTools: readonly string[];
}

export interface SkillEvalSummary {
  skillId: string;
  passed: boolean;
  results: SkillEvalResult[];
}

export function extractPlannedTools(plan: unknown): string[] {
  if (!plan || typeof plan !== "object") return [];
  const obj = plan as { tool?: unknown; steps?: unknown };
  if (typeof obj.tool === "string") return [obj.tool];
  if (!Array.isArray(obj.steps)) return [];
  return obj.steps
    .map((step: { tool?: unknown }) => step?.tool)
    .filter((tool): tool is string => typeof tool === "string");
}

function sameTools(actual: readonly string[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    actual.every((tool, index) => tool === expected[index])
  );
}

export function evaluateSkillCase(
  skill: AppSkill,
  evalCase: EvalCase,
  plan: unknown,
): SkillEvalResult {
  const actualTools = extractPlannedTools(plan);
  const unknownTools = actualTools.filter(
    (tool) => !skill.allowedTools.includes(tool),
  );

  if (unknownTools.length) {
    return {
      skillId: skill.id,
      caseId: evalCase.id,
      passed: false,
      reason: `unknown tool(s): ${unknownTools.join(", ")}`,
      expectedTools: evalCase.expectTools,
      actualTools,
    };
  }

  if (evalCase.unsupported) {
    const passed = actualTools.length === 0;
    return {
      skillId: skill.id,
      caseId: evalCase.id,
      passed,
      reason: passed
        ? "unsupported prompt produced no tool plan"
        : "unsupported prompt produced a tool plan",
      expectedTools: evalCase.expectTools,
      actualTools,
    };
  }

  if (!isValidToolPlan(plan, skill.allowedTools)) {
    return {
      skillId: skill.id,
      caseId: evalCase.id,
      passed: false,
      reason: "missing valid tool plan",
      expectedTools: evalCase.expectTools,
      actualTools,
    };
  }

  const passed = sameTools(actualTools, evalCase.expectTools);
  return {
    skillId: skill.id,
    caseId: evalCase.id,
    passed,
    reason: passed ? "tool sequence matched" : "tool sequence mismatch",
    expectedTools: evalCase.expectTools,
    actualTools,
  };
}

export function evaluateSkillSuite(
  skill: AppSkill,
  plansByCaseId: Record<string, unknown>,
): SkillEvalSummary {
  const results = skill.evalCases.map((evalCase) =>
    evaluateSkillCase(skill, evalCase, plansByCaseId[evalCase.id]),
  );
  return {
    skillId: skill.id,
    passed: results.every((result) => result.passed),
    results,
  };
}
