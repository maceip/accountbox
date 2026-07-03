import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeftIcon, LoaderCircle } from "lucide-react";
import { completeJourneyStep, type StepState } from "@/lib/journey/journey";
import { SKILLS } from "@/lib/skills";
import type { AppSkill } from "@/lib/runtime/app-skill";
import { getSkillRuntime } from "@/lib/runtime/skill-runtimes";
import type { AgentStatus, GenericPlan } from "@/lib/runtime/agent-runtime";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WavyLinearProgress } from "@/components/ui/wavy-progress";

const TEST_PROMPT = "Find unread emails from my manager this week";

/**
 * Journey step 2 — create your first skill.
 *
 * The picker is manifest-driven (SKILLS); Gmail is simply the only entry
 * today. Picking a skill streams the skill model + its LoRA (the engine slot
 * swaps the chat model out — honestly, on both status surfaces), then a test
 * prompt produces REAL plan rows from the tuned weights. Explicitly labeled
 * planned-not-executed: no account, no token, no execution — that's step 3.
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
        <SkillEquip skill={picked} done={state === "done"} onBack={onBack} />
      )}
    </div>
  );
}

function useRuntimeStatus(skill: AppSkill): AgentStatus {
  const rt = useMemo(() => getSkillRuntime(skill), [skill]);
  const [status, setStatus] = useState<AgentStatus>(rt.getAgentStatus());
  useEffect(() => rt.subscribeAgentStatus(setStatus), [rt]);
  return status;
}

function planSteps(plan: GenericPlan): Array<{ tool: string; args: Record<string, unknown> }> {
  const p = plan as any;
  if (p && Array.isArray(p.steps)) return p.steps;
  if (p && typeof p.tool === "string") return [{ tool: p.tool, args: p.args ?? {} }];
  return [];
}

function shortValue(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

function SkillEquip({ skill, done, onBack }: { skill: AppSkill; done: boolean; onBack: () => void }) {
  const rt = useMemo(() => getSkillRuntime(skill), [skill]);
  const status = useRuntimeStatus(skill);
  const [prompt, setPrompt] = useState(TEST_PROMPT);
  const [pending, setPending] = useState(false);
  const [plan, setPlan] = useState<GenericPlan | null>(null);
  const [failNote, setFailNote] = useState<string | null>(null);
  const [earned, setEarned] = useState(done);

  // Streaming the skill model + LoRA swaps the chat model off the GPU — the
  // engine slot handles the displacement; both statuses stay honest.
  useEffect(() => {
    rt.equipAdapter({ type: "http", url: skill.adapterUrl }).catch(() => {});
  }, [rt, skill.adapterUrl]);

  const equipped = status.state === "equipped";
  const loading = status.state === "loading";
  const frac = status.progress?.frac;

  const test = async (e: FormEvent) => {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || pending || !equipped) return;
    setPending(true);
    setFailNote(null);
    setPlan(null);
    try {
      const p = await rt.generate(text);
      if ((p as any).__cold) {
        // Real inference may still produce a non-plan — show it honestly.
        setFailNote(
          (p as any).__ran
            ? `The model ran but didn't produce a valid plan. Raw output: ${((p as any).raw ?? "").slice(0, 200)}`
            : "The model isn't equipped yet — wait for the stream to finish and retry.",
        );
      } else {
        setPlan(p);
        // Valid weight-driven plan: the skill is real. Step earned.
        completeJourneyStep("first-skill");
        setEarned(true);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-3" data-skill-equip={skill.id}>
      <p className="font-mono text-[11px] text-ink-subtle">
        {skill.label} skill · VibeThinker-3B + LoRA
        {equipped ? " · equipped" : loading ? " · streaming (chat model hands over the GPU)" : ""}
      </p>

      {loading && (
        <div className="flex items-center gap-3" data-skill-model-state="loading">
          <WavyLinearProgress
            value={frac !== undefined ? frac * 100 : undefined}
            width={220}
            strokeWidth={3}
            amplitude={2.5}
            wavelength={28}
            className="shrink-0 text-primary"
            aria-label="Streaming skill model"
          />
          <span className="ml-auto shrink-0 font-mono text-[10.5px] text-ink-subtle">
            {frac !== undefined ? `${Math.round(frac * 100)}%` : "…"}
          </span>
        </div>
      )}

      {status.state === "error" && (
        <div className="flex flex-col gap-2 rounded border border-destructive/30 p-3">
          <p className="font-mono text-[10px] text-destructive">{status.lastError}</p>
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => rt.equipAdapter({ type: "http", url: skill.adapterUrl }).catch(() => {})}
          >
            Retry
          </Button>
        </div>
      )}

      {equipped && (
        <form className="flex flex-col gap-2" onSubmit={test} data-skill-model-state="equipped">
          <p className="text-[12px] text-ink-subtle">
            Give it a request. The tuned weights plan the tool calls:
          </p>
          <div className="flex gap-2">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="flex-1 text-[13px]"
              rows={1}
            />
            <Button disabled={!prompt.trim() || pending}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : "Plan it"}
            </Button>
          </div>
        </form>
      )}

      {failNote && (
        <p className="rounded border border-hairline p-2 font-mono text-[10px] text-ink-subtle">{failNote}</p>
      )}

      {plan && (
        <div className="flex flex-col gap-1.5 rounded border border-hairline p-3" data-skill-plan>
          {planSteps(plan).map((step, i) => (
            <div key={i} className="font-mono text-[11px] leading-relaxed">
              <span className="font-semibold">{step.tool}</span>{" "}
              <span className="text-muted-foreground">
                {Object.entries(step.args ?? {})
                  .map(([k, v]) => `${k}: ${shortValue(v)}`)
                  .join(" · ")}
              </span>
            </div>
          ))}
          <p className="font-mono text-[10px] text-ink-muted">
            planned — not executed. Connecting your account (next step) powers execution.
          </p>
        </div>
      )}

      {earned && (
        <Button className="self-end" onClick={onBack} data-journey-advance>
          Step complete — continue
        </Button>
      )}
    </div>
  );
}
