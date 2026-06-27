import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function Page({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

export function PageSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 first:mt-1">
      <div className="flex items-center gap-4 pb-1">
        <h3 className="font-mono text-[10.5px] font-medium tracking-[0.7px] text-muted-foreground/60 uppercase">
          {title}
        </h3>
        <span className="h-px flex-1 bg-border" />
        {action}
      </div>
      {children}
    </section>
  );
}

export function SettingRow({
  label,
  description,
  soon = false,
  children,
}: {
  label: string;
  description?: string;
  soon?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        soon && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[13px]">
          {label}
          {soon && <SoonTag />}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Small mono-caps status pill — PRIMARY, SOON, etc. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[9.5px] font-medium tracking-wide whitespace-nowrap text-muted-foreground/70 uppercase">
      {children}
    </span>
  );
}

export function SoonTag() {
  return <Tag>Soon</Tag>;
}

export function SegmentedButtons<T extends string>({
  options,
  value,
  onChange,
  mono = false,
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  mono?: boolean;
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(values) => {
        const next = values[0] as T | undefined;
        if (next) onChange(next);
      }}
      className="gap-0.5 rounded-lg border bg-muted/40 p-0.5"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            "h-7 rounded-md px-3 text-[12.5px] data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-sm",
            mono && "font-mono text-[11.5px]",
          )}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Mono-caps field label shared by the snippet + signature editors. */
export function EditorFieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-medium tracking-[0.5px] text-muted-foreground/60 uppercase">
      {children}
    </span>
  );
}

/** Shared Cancel / Save row for the snippet + signature editors. */
export function EditorActions({
  onCancel,
  onSave,
  saving,
  canSave,
  label,
}: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
  label: string;
}) {
  return (
    <div className="mt-3 flex items-center justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <Button size="sm" disabled={!canSave || saving} onClick={onSave}>
        {saving ? "Saving…" : label}
      </Button>
    </div>
  );
}

export const Mono = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[11px]">{children}</span>
);
