import { Frame, FramePanel } from "@/components/reui/frame";
import { SOURCES } from "@/lib/sources";
import { StatusChip } from "../status-chip";

/** Connected sources grid — Stitch command-center lower section. */
export function ConnectedSourcesBlock({
  gmailConnected,
  accountCount,
}: {
  gmailConnected: boolean;
  accountCount: number;
}) {
  return (
    <section>
      <h2 className="mb-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        connected sources
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SOURCES.filter((s) => s.connection).map((source) => {
          const connected =
            source.id === "gmail"
              ? gmailConnected
              : source.id === "github"
                ? false
                : false;
          return (
            <li key={source.id}>
              <Frame spacing="sm" className="shadow-xs">
                <FramePanel className="flex flex-row items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{source.label}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {source.soon
                        ? "Soon"
                        : connected
                          ? `${accountCount} account(s)`
                          : "Not linked"}
                    </p>
                  </div>
                  <StatusChip
                    kind={
                      source.soon
                        ? "info"
                        : connected
                          ? "ready"
                          : source.id === "github"
                            ? "info"
                            : "warning"
                    }
                  >
                    {source.soon ? "soon" : connected ? "live" : "cold"}
                  </StatusChip>
                </FramePanel>
              </Frame>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
