import { useAgentStatus } from "@/components/agent/agent-chat";
import { WavyLinearProgress } from "@/components/ui/wavy-progress";

/** Slim sidebar-footer row showing the model weight stream while it runs —
 *  the onboarding dead time is when the 6GB download happens, so this is the
 *  only always-visible surface for it. Collapses away when idle/equipped. */
export function AgentLoadRow() {
  const status = useAgentStatus();
  const frac = status.progress?.frac;
  const loading = status.state === "loading";
  if (!loading) return null;

  return (
    <div className="flex h-7 items-center gap-2 px-2 text-muted-foreground">
      <WavyLinearProgress
        value={frac !== undefined ? frac * 100 : undefined}
        width={168}
        strokeWidth={3}
        amplitude={2.5}
        wavelength={28}
        className="shrink-0 text-primary"
        aria-label="Loading local model"
      />
      <span className="ml-auto shrink-0 font-mono text-[10.5px]">
        {frac !== undefined ? `${Math.round(frac * 100)}%` : "model"}
      </span>
    </div>
  );
}
