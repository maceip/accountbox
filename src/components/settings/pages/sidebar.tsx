import { updateSettings, useSettings } from "@/hooks/use-settings";
import { NAV_SECTIONS } from "@/components/shell/app-sidebar";
import { cn } from "@/lib/utils";
import { Page, PageSection } from "../primitives";

export function SidebarPage() {
  return (
    <Page>
      <PageSection title="Shown items">
        <p className="mt-2 mb-3.5 text-[13px] text-muted-foreground">
          Tap an item to show or hide it in the sidebar. Hidden items stay
          reachable from the command palette.
        </p>
        <SidebarChips />
      </PageSection>
    </Page>
  );
}

function SidebarChips() {
  const { hiddenNav } = useSettings();
  const toggle = (id: string, show: boolean) =>
    updateSettings({
      hiddenNav: show
        ? hiddenNav.filter((item) => item !== id)
        : [...hiddenNav, id],
    });
  return (
    <div className="flex flex-col gap-3.5">
      {NAV_SECTIONS.map((group) => (
        <div key={group.section}>
          <span className="mb-2 block font-mono text-[10px] font-medium tracking-[0.5px] text-muted-foreground/70 uppercase">
            {group.section}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {group.items.map((item) => {
              if (item.fixed) {
                return (
                  <span
                    key={item.id}
                    className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-[11.5px] text-muted-foreground/70"
                  >
                    {item.title}
                  </span>
                );
              }
              const shown = !hiddenNav.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={shown}
                  onClick={() => toggle(item.id, !shown)}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                    shown
                      ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15"
                      : "border-border text-muted-foreground/50 hover:text-muted-foreground",
                  )}
                >
                  {item.title}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
