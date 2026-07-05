import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Tactical gate card — corner brackets on matte panel (vault / journey). */
export function GateCard({
  children,
  className,
  footer,
  ...props
}: {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const bracket =
    "pointer-events-none absolute size-2 border-primary";
  return (
    <div className={cn("relative w-full", className)} {...props}>
      <div
        className="wb-panel relative p-6"
        data-gate-card
      >
        <span
          aria-hidden
          className={cn(bracket, "top-0 left-0 -translate-x-px -translate-y-px border-t border-l")}
        />
        <span
          aria-hidden
          className={cn(bracket, "top-0 right-0 translate-x-px -translate-y-px border-t border-r")}
        />
        <span
          aria-hidden
          className={cn(bracket, "bottom-0 left-0 -translate-x-px translate-y-px border-b border-l")}
        />
        <span
          aria-hidden
          className={cn(
            bracket,
            "right-0 bottom-0 translate-x-px translate-y-px border-r border-b",
          )}
        />
        {children}
      </div>
      {footer}
    </div>
  );
}

export function GateTelemetry({ lines }: { lines: string[] }) {
  return (
    <footer className="mt-6 flex flex-col items-center gap-1 border-t border-hairline pt-4 text-center">
      {lines.map((line) => (
        <p
          key={line}
          className="font-mono text-[10px] tracking-wide text-ink-subtle/70 uppercase"
        >
          {line}
        </p>
      ))}
    </footer>
  );
}
