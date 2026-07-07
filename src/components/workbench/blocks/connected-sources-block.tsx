import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { SOURCES } from "@/lib/sources";
import { useLinkedAccounts } from "@/lib/sources/connections";

import { WbSection } from "../workbench-surfaces";

/** Connected sources grid — 2-up icon cards. Connection state is derived
 *  from linked Better Auth provider rows, so every registered source (and
 *  any future cartridge's source) reports honestly without edits here. */
export function ConnectedSourcesBlock() {
  const linked = useLinkedAccounts();
  const rows = linked.data ?? [];

  return (
    <WbSection label="sources">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SOURCES.filter((s) => s.connection).map((source) => {
          const count = rows.filter(
            (a) => a.providerId === source.connection?.providerId,
          ).length;
          const connected = count > 0;
          const Icon = source.icon;
          const statusLabel = source.soon
            ? "Soon"
            : connected
              ? `${count} linked`
              : "Disconnected";
          const statusClass = source.soon
            ? "text-ink-subtle"
            : connected
              ? "text-accent-2"
              : "text-ink-subtle";

          const inner = (
            <div
              className={cn(
                "relative flex flex-col items-center justify-center rounded-lg border border-hairline p-4 text-center transition-colors",
                connected && "border-accent-2/40",
                !source.soon && "hover:border-hairline-strong active:bg-surface-2/50",
              )}
            >
              {connected && (
                <span
                  aria-hidden
                  className="absolute top-2 right-2 size-2 rounded-full bg-accent-2"
                />
              )}
              <Icon
                className={cn(
                  "mb-2 size-8",
                  connected ? "text-accent-2" : "text-ink-subtle opacity-50",
                )}
              />
              <p className="text-[13px] font-medium">{source.label}</p>
              <p className={cn("mt-0.5 font-mono text-[10px]", statusClass)}>
                {statusLabel}
              </p>
            </div>
          );

          return (
            <li key={source.id}>
              {source.soon ? (
                inner
              ) : source.id === "gmail" ? (
                <Link to="/sources/gmail" className="block">
                  {inner}
                </Link>
              ) : (
                <Link to="/sources" className="block">
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </WbSection>
  );
}
