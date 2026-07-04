import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WbSectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-mono text-[10px] tracking-wide text-ink-muted uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function WbPanel({
  children,
  className,
  raised,
}: {
  children: ReactNode;
  className?: string;
  raised?: boolean;
}) {
  return (
    <div className={cn(raised ? "wb-panel-raised" : "wb-panel", className)}>
      {children}
    </div>
  );
}

export function WbTabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: readonly { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 gap-1 border-b border-hairline px-3 pt-2",
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-t-md px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase transition-colors",
            active === tab.id
              ? "border border-b-0 border-hairline bg-surface-1 text-primary"
              : "text-ink-subtle hover:text-ink",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function WbPageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="wb-panel mb-4 flex flex-wrap items-start justify-between gap-3 p-4">
      <div>
        {kicker && <WbSectionLabel>{kicker}</WbSectionLabel>}
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-[13px] text-ink-subtle">
            {description}
          </p>
        )}
      </div>
      {actions}
    </header>
  );
}
