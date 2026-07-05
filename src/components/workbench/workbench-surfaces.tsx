import type { ReactNode } from "react";

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
    <p
      className={cn(
        "font-mono text-[10px] tracking-wide text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </p>
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
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <Frame spacing="sm" className="mb-4">
      <FramePanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <FrameHeader className="gap-1 p-0">
            {kicker && <WbSectionLabel>{kicker}</WbSectionLabel>}
            <FrameTitle className="text-lg">{title}</FrameTitle>
            {description && (
              <FrameDescription className="mt-1 max-w-2xl">
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

/** Workbench page canvas — canvas bg with subtle Stitch grain. */
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
