import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function WbSectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase",
        className,
      )}
    >
      <span className="text-ink-tertiary">{"// "}</span>
      {children}
    </h2>
  );
}

/** Section panel — matte hairline container, no gradient shine. */
export function WbSection({
  children,
  className,
  label,
  headerRight,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  headerRight?: ReactNode;
}) {
  return (
    <section className={cn("wb-panel space-y-2", className)}>
      {(label || headerRight) && (
        <div className="flex items-center justify-between gap-2">
          {label ? <WbSectionLabel>{label}</WbSectionLabel> : <span />}
          {headerRight}
        </div>
      )}
      {children}
    </section>
  );
}

/** Amber tactical blocker — command-center banner (not generic yellow alert). */
export function WbBlockerBanner({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 shadow-sm",
        className,
      )}
      style={{
        backgroundColor: "var(--color-blocker-bg)",
        borderColor: "var(--color-blocker-border)",
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle
          className="size-3.5 shrink-0"
          style={{ color: "var(--color-blocker-ink)" }}
        />
        <p
          className="font-mono text-[11px] leading-snug"
          style={{ color: "var(--color-ink)" }}
        >
          {children}
        </p>
      </div>
      {action}
    </div>
  );
}

/** ReUI Frame panel — replaces hand-rolled wb-panel utilities. */
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
    <Frame
      variant={raised ? "default" : "ghost"}
      spacing="sm"
      className={cn(raised && "shadow-xs", className)}
    >
      <FramePanel>{children}</FramePanel>
    </Frame>
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
    <Tabs
      value={active}
      onValueChange={onChange}
      className={cn("shrink-0 gap-0", className)}
    >
      <TabsList
        variant="line"
        className="no-scrollbar h-auto w-full justify-start overflow-x-auto rounded-none border-b border-border bg-transparent p-0 px-3 pt-2"
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="shrink-0 rounded-t-md px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase after:bottom-0"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function WbPageHeader({
  kicker,
  title,
  description,
  actions,
  className,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Frame spacing="sm" className={cn("mb-4", className)}>
      <FramePanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <FrameHeader className="gap-1 p-0">
            {kicker && (
              <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                {kicker}
              </p>
            )}
            <FrameTitle className="text-lg tracking-tight">{title}</FrameTitle>
            {description && (
              <FrameDescription className="mt-1 max-w-2xl text-[13px]">
                {description}
              </FrameDescription>
            )}
          </FrameHeader>
          {actions}
        </div>
      </FramePanel>
    </Frame>
  );
}

/** Workbench page canvas — canvas bg with material grain. */
export function WbCanvas({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("wb-grain bg-canvas flex min-h-0 flex-col", className)}>
      {children}
    </div>
  );
}
