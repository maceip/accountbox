import {
  ACCENTS,
  updateSettings,
  useSettings,
  type AccentId,
} from "@/hooks/use-settings";
import { useTheme } from "@/components/shell/theme-provider";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Hint } from "@/components/ui/tooltip";
import { Page, PageSection, SegmentedButtons, SettingRow } from "../primitives";

const PREVIEW_UNREAD = [true, false, true, false, false];

function InterfacePreview() {
  const { density, accent, inboxAvatars } = useSettings();
  const color = ACCENTS[accent].base;
  const rows = PREVIEW_UNREAD.slice(0, density === "compact" ? 5 : 3);

  const dot = (unread: boolean) => (
    <span
      className="size-1.5 shrink-0 rounded-full"
      style={
        unread
          ? { background: color }
          : { boxShadow: `inset 0 0 0 1.5px ${color}`, opacity: 0.5 }
      }
    />
  );
  const bar = (unread: boolean, width: number) => (
    <span
      className={cn(
        "h-1.5 shrink-0 rounded",
        unread ? "bg-foreground/70" : "bg-muted-foreground/40",
      )}
      style={{ width }}
    />
  );

  return (
    <div className="pointer-events-none overflow-hidden rounded-xl border bg-card select-none">
      <div className="flex h-[188px]">
        <div className="flex w-[92px] shrink-0 flex-col gap-2 border-r bg-sidebar p-2">
          <div className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-[3px]"
              style={{ background: color }}
            />
            <span className="h-1.5 w-9 rounded bg-foreground/30" />
          </div>
          <span className="h-4 rounded-[5px]" style={{ background: color }} />
          <span className="h-3.5 rounded border bg-card" />
          <div className="mt-1 flex flex-col gap-1.5">
            <span className="h-1.5 w-12 rounded bg-foreground/40" />
            <span className="h-1.5 w-10 rounded bg-muted-foreground/40" />
            <span className="h-1.5 w-11 rounded bg-muted-foreground/40" />
            <span className="h-1.5 w-8 rounded bg-muted-foreground/40" />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-6 shrink-0 items-center gap-1.5 border-b px-2">
            {dot(true)}
            <span className="h-1.5 w-16 rounded bg-foreground/40" />
            <span
              className="ml-auto h-1.5 w-6 rounded"
              style={{ background: color, opacity: 0.75 }}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {rows.map((unread, i) =>
              density === "compact" ? (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static preview rows, never reordered.
                  key={i}
                  className="flex h-[22px] items-center gap-1.5 border-b border-border/60 px-2"
                >
                  {dot(unread)}
                  {inboxAvatars && (
                    <span className="size-3 shrink-0 rounded-full border border-border bg-muted" />
                  )}
                  {bar(unread, 44)}
                  <span className="ml-auto h-1.5 w-4 rounded bg-muted-foreground/30" />
                </div>
              ) : (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static preview rows, never reordered.
                  key={i}
                  className="flex gap-1.5 border-b border-border/60 px-2 py-1.5"
                >
                  <span className="pt-0.5">{dot(unread)}</span>
                  {inboxAvatars && (
                    <span className="size-4 shrink-0 rounded-full border border-border bg-muted" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {bar(unread, 52)}
                      <span className="ml-auto h-1.5 w-5 rounded bg-muted-foreground/30" />
                    </div>
                    <span className="h-1.5 w-3/4 rounded bg-muted-foreground/25" />
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeSegmented() {
  const { theme, setTheme } = useTheme();
  return (
    <SegmentedButtons
      options={[
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
        { value: "system", label: "System" },
      ]}
      value={theme}
      onChange={setTheme}
    />
  );
}

function DensitySegmented() {
  const { density } = useSettings();
  return (
    <SegmentedButtons
      options={[
        { value: "compact", label: "Dense" },
        { value: "comfortable", label: "Comfortable" },
      ]}
      value={density}
      onChange={(value) => updateSettings({ density: value })}
    />
  );
}

function ClockSegmented() {
  const { clock } = useSettings();
  return (
    <SegmentedButtons
      options={[
        { value: "12h", label: "12-hour" },
        { value: "24h", label: "24-hour" },
      ]}
      value={clock}
      onChange={(value) => updateSettings({ clock: value })}
    />
  );
}

export function AvatarsSwitch() {
  const { inboxAvatars } = useSettings();
  return (
    <Switch
      checked={inboxAvatars}
      onCheckedChange={(value) => updateSettings({ inboxAvatars: value })}
    />
  );
}

function AccentDots() {
  const { accent } = useSettings();
  return (
    // biome-ignore lint/a11y/useSemanticElements: a visual accent-swatch group; a <fieldset> would impose default form styling.
    <div role="group" aria-label="Accent color" className="flex gap-1.5">
      {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
        <Hint key={id} label={ACCENTS[id].label}>
          <button
            type="button"
            aria-pressed={accent === id}
            onClick={() => updateSettings({ accent: id })}
            className={cn(
              "size-4.5 rounded-full transition-shadow",
              accent === id &&
                "ring-2 ring-foreground ring-offset-2 ring-offset-background",
            )}
            style={{ background: ACCENTS[id].base }}
          />
        </Hint>
      ))}
    </div>
  );
}

export function AppearancePage() {
  return (
    <Page>
      <InterfacePreview />
      <PageSection title="Appearance">
        <SettingRow label="Theme">
          <ThemeSegmented />
        </SettingRow>
        <SettingRow
          label="Accent color"
          description="Buttons, focus rings, and unread markers"
        >
          <AccentDots />
        </SettingRow>
        <SettingRow
          label="Density"
          description="Comfortable gives each row more breathing room"
        >
          <DensitySegmented />
        </SettingRow>
        <SettingRow label="Clock">
          <ClockSegmented />
        </SettingRow>
      </PageSection>
    </Page>
  );
}
