import { useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { completeJourneyStep, type StepState } from "@/lib/journey/journey";
import { SKILLS } from "@/lib/skills";
import type { AppSkill } from "@/lib/runtime/app-skill";
import { SkillEquip } from "@/components/workbench/skill-equip";

/**
 * Journey step 2 — create your first skill.
 *
 * The picker is manifest-driven (SKILLS); Gmail is simply the only entry
 * today. Picking a skill streams the skill model + its LoRA (the engine slot
 * swaps the chat model out — honestly, on both status surfaces), then a test
 * prompt produces REAL plan rows from the tuned weights. Explicitly labeled
 * planned-not-executed: no account, no token, no execution — that's step 3.
 *
 * The equip/test body is the shared workbench SkillEquip — the same surface
 * lives on in the loadout after the journey.
 */
export function StepSkill({ state, onBack }: { state: StepState; onBack: () => void }) {
  const [picked, setPicked] = useState<AppSkill | null>(null);

  return (
    <div className="w-full rounded border border-hairline bg-surface-1 p-6" data-journey-screen="first-skill">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex cursor-pointer items-center gap-1 font-mono text-[11px] text-ink-muted hover:text-ink"
      >
        <ArrowLeftIcon className="size-3" /> all steps
      </button>
      <h2 className="text-[20px] font-semibold">Create your first skill</h2>
      <p className="mt-1 text-[12px] leading-normal text-ink-subtle">
        A skill is a fine-tuned planner: tuned weights that turn a request into
        tool calls. <strong className="text-ink">No account needed</strong> —
        planning is proven here, connecting comes later.
      </p>

      {!picked ? (
        <div className="mt-4 flex flex-col gap-2" data-skill-picker>
          {SKILLS.map((skill) => (
            <button
              key={skill.id}
              type="button"
              data-skill-option={skill.id}
              onClick={() => setPicked(skill)}
              className="cursor-pointer rounded border border-hairline p-3 text-left hover:bg-muted"
            >
              <span className="text-[14px] font-semibold">{skill.label}</span>
              <p className="mt-0.5 text-[12px] text-ink-subtle">{skill.description}</p>
              <p className="mt-1 font-mono text-[10px] text-ink-muted">
                {skill.tools.map((t) => t.name).join(" · ")}
              </p>
            </button>
          ))}
          <p className="font-mono text-[10px] text-ink-muted">
            more skills land here as they're trained
          </p>
        </div>
      ) : (
        <SkillEquip
          skill={picked}
          done={state === "done"}
          onPlanned={() => completeJourneyStep("first-skill")}
          advance={{ label: "Step complete — continue", onClick: onBack }}
        />
      )}
    </div>
  );
}
