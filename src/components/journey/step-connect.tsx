import { useEffect } from "react";
import { ArrowLeftIcon, LoaderCircle } from "lucide-react";
import { completeJourneyStep, type StepState } from "@/lib/journey/journey";
import { useAccountsQuery } from "@/lib/mail-queries";
import { SKILLS } from "@/lib/skills";
import { getSourceForSkill } from "@/lib/sources";
import { GateCard } from "@/components/shell/gate-card";
import { Button } from "@/components/ui/button";

/**
 * Journey step 3 — connect the account.
 *
 * The ONLY thing this step adds is execution power: planning was already
 * proven in step 2 without any token. The connect target is the source the
 * first skill plans against (registry-derived — Gmail today). OAuth
 * round-trips; when an account appears on the session, the step (and the
 * journey) completes and the full shell takes over.
 */
export function StepConnect({
  state,
  onBack,
}: {
  state: StepState;
  onBack: () => void;
}) {
  const firstEquippableSkill = SKILLS.find(
    (skill) => skill.availability === "trained",
  );
  const source = firstEquippableSkill
    ? getSourceForSkill(firstEquippableSkill.id)
    : null;
  const { data: accounts, isLoading } = useAccountsQuery(true);
  const linked = (accounts?.length ?? 0) > 0;

  // OAuth returns to the app with the account attached — that arrival IS the
  // completion signal. Runs on the post-redirect mount.
  useEffect(() => {
    if (linked && state === "active") completeJourneyStep("connect-account");
  }, [linked, state]);

  if (!source?.connection) return null;
  const Icon = source.icon;

  return (
    <GateCard className="w-full" data-journey-screen="connect-account">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex cursor-pointer items-center gap-1 font-mono text-[11px] text-ink-muted hover:text-ink"
      >
        <ArrowLeftIcon className="size-3" /> all steps
      </button>
      <h2 className="text-[20px] font-semibold">Connect the account</h2>
      <p className="mt-1 text-[12px] leading-normal text-ink-subtle">
        Your skill already plans without any account. Connecting {source.label}{" "}
        is what lets plans <strong className="text-ink">execute</strong> —
        search runs, messages load, drafts appear. Mail stays in Google; nothing
        is stored on a server, and drafts are never sent.
      </p>

      <div className="mt-5 flex flex-col items-center gap-3 rounded border border-hairline p-5">
        <span className="flex size-9 items-center justify-center rounded-md bg-primary text-on-primary">
          <Icon className="size-4.5" />
        </span>
        {isLoading ? (
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        ) : linked ? (
          <p
            className="font-mono text-[11px] text-ink-subtle"
            data-connect-state="linked"
          >
            account connected — workspace unlocked
          </p>
        ) : (
          <Button
            onClick={() => source.connection?.connect()}
            data-connect-state="waiting"
          >
            Connect {source.label}
          </Button>
        )}
      </div>
    </GateCard>
  );
}
