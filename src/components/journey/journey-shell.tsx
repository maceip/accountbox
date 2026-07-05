import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckIcon, LockIcon } from "lucide-react";
import {
  getJourney,
  subscribeJourney,
  skipJourneyUnsupportedDevice,
  type JourneySnapshot,
  type JourneyStepId,
  type StepState,
} from "@/lib/journey/journey";
import { probeAgentSupport } from "@/lib/runtime/agent-preload";
import { Button } from "@/components/ui/button";
import { GateCard } from "@/components/shell/gate-card";
import { AccountBoxBrand } from "@/components/shell/accountbox-mark";
import { cn } from "@/lib/utils";
import { StepChat } from "./step-chat";
import { StepSkill } from "./step-skill";
import { StepConnect } from "./step-connect";

/** Live journey state (snapshot is cached per store state — no tearing). */
export function useJourney(): JourneySnapshot {
  return useSyncExternalStore(subscribeJourney, getJourney, getJourney);
}

/** @deprecated inline — use AccountBoxBrand */
function AccountBoxIcon({ className }: { className?: string }) {
  return <AccountBoxBrand className={className} markClassName="size-7" />;
}

const STEP_META: Record<
  JourneyStepId,
  { n: number; title: string; blurb: string }
> = {
  "chat-agent": {
    n: 1,
    title: "Start your local model",
    blurb:
      "A real model streams onto this machine's GPU — say hello to prove it runs.",
  },
  "first-skill": {
    n: 2,
    title: "Create your first skill",
    blurb: "Load a fine-tuned skill and watch it plan real tool calls.",
  },
  "connect-account": {
    n: 3,
    title: "Connect the account",
    blurb: "Planning already works — connecting powers execution.",
  },
};

/** Shared two-column gate layout (identical proportions to the vault gate):
 *  brand/pitch panel on md+, single centered column on phones. */
function JourneyLayout({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <main className="wb-grain relative grid min-h-svh w-full flex-1 place-items-center overflow-y-auto bg-canvas px-5 py-8 text-ink">
      <div
        aria-hidden
        className="vault-grid-bg pointer-events-none absolute inset-0 opacity-[0.04]"
      />
      <div className="relative z-10 flex w-full max-w-[820px] items-center justify-center gap-12 md:justify-between">
        <div className="hidden max-w-[360px] flex-col gap-5 md:flex">
          <div className="flex items-center gap-3">
            <AccountBoxBrand className="size-9" markClassName="size-8" />
            <div>
              <h1 className="text-[18px] font-semibold">AccountBox</h1>
              <p className="font-mono text-[11px] text-ink-subtle">{caption}</p>
            </div>
          </div>
          <ul className="flex flex-col gap-3 text-[13px] leading-normal text-ink-subtle">
            <li>
              <strong className="text-ink">
                You build this workspace yourself.
              </strong>{" "}
              Three steps — a local model, a skill, an account — each one real.
            </li>
            <li>
              <strong className="text-ink">
                Everything runs on this machine.
              </strong>{" "}
              Models stream to your GPU; prompts and plans never leave it.
            </li>
            <li>
              <strong className="text-ink">Nothing is faked.</strong> Each step
              unlocks because the real thing happened, not a timer.
            </li>
          </ul>
        </div>
        <div className="w-full max-w-[440px]">{children}</div>
      </div>
    </main>
  );
}

function StateChip({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-success text-on-primary">
        <CheckIcon className="size-3" />
      </span>
    );
  }
  if (state === "locked") {
    return (
      <span className="flex size-5 items-center justify-center rounded-full border border-hairline text-ink-muted">
        <LockIcon className="size-2.5" />
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label="active"
      className="size-5 rounded-full border-2 border-primary"
    />
  );
}

/** The progression overview: three step cards, one active CTA at a time. */
function ProgressionScreen({
  journey,
  onOpenStep,
}: {
  journey: JourneySnapshot;
  onOpenStep: (id: JourneyStepId) => void;
}) {
  // Honest device verdict: if the agent can't run here at all, the journey's
  // steps are impossible — offer mail-without-agent instead of a dead end.
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    probeAgentSupport().then((r) => {
      if (alive && !r.ok) setUnsupportedReason(r.reason);
    });
    return () => {
      alive = false;
    };
  }, []);

  const doneCount = Object.values(journey.steps).filter(
    (s) => s === "done",
  ).length;

  return (
    <div className="flex flex-col gap-3" data-journey-screen="overview">
      <div className="mb-1 md:hidden">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded bg-primary text-on-primary">
            <AccountBoxIcon className="size-5" />
          </span>
          <div>
            <h1 className="text-[18px] font-semibold">AccountBox</h1>
            <p className="font-mono text-[11px] text-ink-subtle">
              build your agent workspace
            </p>
          </div>
        </div>
      </div>
      <p className="font-mono text-[11px] text-ink-subtle">
        setup · {doneCount} of 3 done
      </p>
      {(Object.keys(STEP_META) as JourneyStepId[]).map((id) => {
        const meta = STEP_META[id];
        const state = journey.steps[id];
        return (
          <div
            key={id}
            data-journey-step={id}
            data-step-state={state}
            className={cn(state === "locked" && "opacity-55")}
          >
            <GateCard className={cn(state === "active" && "ring-1 ring-primary/30")}>
              <div className="flex items-center gap-3">
              <StateChip state={state} />
              <div className="min-w-0 flex-1">
                <h2 className="text-[14px] font-semibold">
                  <span className="mr-1.5 font-mono text-[11px] text-ink-muted">
                    {meta.n}.
                  </span>
                  {meta.title}
                </h2>
                <p className="mt-0.5 text-[12px] leading-normal text-ink-subtle">
                  {meta.blurb}
                </p>
              </div>
              {state === "active" && (
                <Button size="sm" onClick={() => onOpenStep(id)}>
                  Start
                </Button>
              )}
              {state === "done" && (
                <button
                  type="button"
                  onClick={() => onOpenStep(id)}
                  className="cursor-pointer font-mono text-[11px] text-ink-muted underline underline-offset-2 hover:text-ink"
                >
                  revisit
                </button>
              )}
              </div>
            </GateCard>
          </div>
        );
      })}
      {unsupportedReason && (
        <GateCard>
          <p className="font-mono text-[11px] leading-relaxed text-ink-subtle">
            This device can't run the local agent ({unsupportedReason}). The
            steps above need a GPU — you can still use the mail workspace
            without an agent.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => skipJourneyUnsupportedDevice()}
          >
            Continue without the agent
          </Button>
        </GateCard>
      )}
    </div>
  );
}

/**
 * The journey gate UI: rendered by the app shell INSTEAD of the board until
 * the journey completes. No sidebar, no settings, no mail chrome exists here.
 */
export function JourneyShell() {
  const journey = useJourney();
  const [view, setView] = useState<"overview" | JourneyStepId>("overview");

  const back = () => setView("overview");

  if (view === "chat-agent") {
    return (
      <JourneyLayout caption="step 1 of 3 · local model">
        <StepChat state={journey.steps["chat-agent"]} onBack={back} />
      </JourneyLayout>
    );
  }
  if (view === "first-skill") {
    return (
      <JourneyLayout caption="step 2 of 3 · first skill">
        <StepSkill state={journey.steps["first-skill"]} onBack={back} />
      </JourneyLayout>
    );
  }
  if (view === "connect-account") {
    return (
      <JourneyLayout caption="step 3 of 3 · connect">
        <StepConnect state={journey.steps["connect-account"]} onBack={back} />
      </JourneyLayout>
    );
  }
  return (
    <JourneyLayout caption="build your agent workspace">
      <ProgressionScreen journey={journey} onOpenStep={setView} />
    </JourneyLayout>
  );
}
