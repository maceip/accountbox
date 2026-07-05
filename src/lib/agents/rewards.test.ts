import { describe, expect, test } from "bun:test";
import { bbtriageReward, toGrpoPrompt, BBTRIAGE_REWARD } from "./rewards";
import type { TriageVerdict } from "./bbtriage";
// The engine's pure GRPO math is plain JS — unit-test it here too.
// @ts-expect-error - plain-JS engine module, no .d.ts
import { groupRelativeAdvantages } from "@/engine/services/grpo_controller.js";

const gold: TriageVerdict = {
  disposition: "theoretical_no_poc",
  severity_estimate: "medium",
  reasoning: "gold",
};

const verdict = (d: string, sev: string) =>
  `Some chain-of-thought first.\n{"disposition": "${d}", "severity_estimate": "${sev}", "reasoning": "because"}`;

describe("bbtriageReward", () => {
  test("full credit for disposition + severity match", () => {
    expect(bbtriageReward(verdict("theoretical_no_poc", "medium"), gold)).toBeCloseTo(1.0);
  });

  test("partial credit: valid JSON, wrong disposition, right severity", () => {
    expect(bbtriageReward(verdict("slop", "medium"), gold)).toBeCloseTo(
      BBTRIAGE_REWARD.validJson + BBTRIAGE_REWARD.severity,
    );
  });

  test("partial credit: right disposition, wrong severity", () => {
    expect(bbtriageReward(verdict("theoretical_no_poc", "critical"), gold)).toBeCloseTo(
      BBTRIAGE_REWARD.validJson + BBTRIAGE_REWARD.disposition,
    );
  });

  test("severity comparison is case/whitespace-insensitive", () => {
    expect(bbtriageReward(verdict("slop", "  Medium "), gold)).toBeCloseTo(
      BBTRIAGE_REWARD.validJson + BBTRIAGE_REWARD.severity,
    );
  });

  test("zero for no verdict / malformed JSON / open disposition", () => {
    expect(bbtriageReward("I refuse to answer.", gold)).toBe(0);
    expect(bbtriageReward('{"disposition": "slop", "severity_estimate":', gold)).toBe(0);
    expect(bbtriageReward(verdict("made_up_disposition", "medium"), gold)).toBe(0);
  });

  test("uses the LAST valid verdict in the text", () => {
    const text = `${verdict("slop", "low")}\nWait, revising:\n${verdict("theoretical_no_poc", "medium")}`;
    expect(bbtriageReward(text, gold)).toBeCloseTo(1.0);
  });
});

describe("toGrpoPrompt", () => {
  const row = {
    messages: [
      { role: "system", content: "triage analyst" },
      { role: "user", content: "Title: some report" },
      {
        role: "assistant",
        content: verdict("out_of_scope", "none"),
      },
    ],
  };

  test("strips the assistant turn and extracts gold", () => {
    const p = toGrpoPrompt(row);
    expect(p).not.toBeNull();
    expect(p!.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(p!.gold.disposition).toBe("out_of_scope");
  });

  test("returns null when the assistant turn has no valid verdict", () => {
    expect(
      toGrpoPrompt({
        messages: [
          { role: "user", content: "x" },
          { role: "assistant", content: "no json here" },
        ],
      }),
    ).toBeNull();
  });

  test("returns null when there is no assistant turn", () => {
    expect(toGrpoPrompt({ messages: [{ role: "user", content: "x" }] })).toBeNull();
  });
});

describe("groupRelativeAdvantages", () => {
  test("zero-centers and unit-scales a spread group", () => {
    const adv = groupRelativeAdvantages([1, 0, 0, 0]) as number[];
    const sum = adv.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(0, 5);
    expect(adv[0]).toBeGreaterThan(0); // the high-reward rollout is reinforced
    expect(adv[1]).toBeLessThan(0);
  });

  test("degenerate group (all equal) yields all zeros — no signal", () => {
    expect(groupRelativeAdvantages([0.8, 0.8, 0.8, 0.8])).toEqual([0, 0, 0, 0]);
  });

  test("empty group is empty", () => {
    expect(groupRelativeAdvantages([])).toEqual([]);
  });
});
