import {
  ChevronRight,
  Search,
  SquareTerminal,
  Users,
  Webhook,
} from "lucide-react";

import { useLocation, useNavigate } from "@tanstack/react-router";

import { linkGoogle } from "@/lib/auth/auth-client";
import { cn } from "@/lib/utils";
import { useSettings } from "@/hooks/use-settings";
import { formatCount } from "@/lib/format";
import { SOURCES, type AppSource, type SourceView } from "@/lib/sources";
import { NavUser } from "@/components/shell/nav-user";
import { AccountBoxBrand } from "@/components/shell/accountbox-mark";
import { AgentLoadRow } from "@/components/shell/agent-progress";
import { ViewCard } from "@/components/mail/view-card";
import type { Account } from "@/lib/account";
import type { Folder } from "@/lib/folders";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/** Sidebar nav children are the registry's SourceView, plus a local `to` for
 *  the developer group's route pages. */
type NavChild = SourceView & { to?: string };

type NavSection = Omit<AppSource, "views" | "connection" | "skill"> & {
  children: NavChild[];
};

/** The sidebar derives from the source registry (agent + loadout on top, then
 *  each source as a group), plus the Developer section which isn't a source.
 *  Adding a source is one registry entry; it shows up here and in Settings. */
const NAV_SOURCES: NavSection[] = [
  ...SOURCES.map((source) => ({
    id: source.id,
    label: source.label,
    icon: source.icon,
    soon: source.soon,
    children: source.views as NavChild[],
  })),
  {
    id: "developer",
    label: "Developer",
    icon: SquareTerminal,
    children: [
      { id: "webhooks", title: "Webhooks", icon: Webhook, soon: true },
    ],
  },
];

/** Navigable route targets — tells when a non-mail page is active so mailbox
 *  items don't also show selected. */
const ROUTE_TARGETS = NAV_SOURCES.flatMap((section) =>
  section.children
    .filter((child) => child.to && !child.soon)
    .map((child) => child.to as string),
);

/** Sidebar nav as toggleable items per source. Settings → Sidebar mirrors this
 *  so any view can be shown/hidden; `fixed` items (Inbox) can't. */
export const NAV_SECTIONS: {
  section: string;
  items: { id: string; title: string; fixed?: boolean }[];
}[] = NAV_SOURCES.map((section) => ({
  section: section.label,
  items: section.children.map((child) => ({
    id: child.id,
    title: child.title,
    fixed: child.fixed,
  })),
}));

const navButton = "h-7 gap-[9px] px-2 text-[13px]";
const subBadge =
  "ml-auto shrink-0 rounded-full bg-accent px-1.5 font-mono text-[10.5px] text-muted-foreground";
const soonBadge =
  "ml-auto shrink-0 font-mono text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase";

export function AppSidebar({
  accounts,
  scopeIds,
  allOn,
  folder,
  onFolder,
  onToggleScope,
  onOpenCommand,
  onOpenSettings,
  onCompose,
  onTogglePanel,
  openPanels,
  onAddTestAccount,
  onOpenDevPage,
  activeDevId,
  loading = false,
  embedded = false,
  demoUser,
  container,
}: {
  accounts: Account[];
  scopeIds: string[];
  allOn: boolean;
  folder: Folder;
  onFolder: (folder: Folder) => void;
  onToggleScope: (id: string | "all") => void;
  onOpenCommand: () => void;
  onOpenSettings: () => void;
  onCompose: () => void;
  onAddTestAccount?: () => void;
  /** Open/close an integration panel on the board (e.g. "pull-requests"). */
  onTogglePanel?: (key: string) => void;
  /** Panel keys currently open on the board, for the active highlight. */
  openPanels?: string[];
  /** Embedded only (landing demo): open a dev page in the sandbox, not the real router. */
  onOpenDevPage?: (id: string) => void;
  /** Embedded only: which developer page is showing, for the active highlight. */
  activeDevId?: string;
  /** Session/accounts still booting — skeleton the account + profile blocks. */
  loading?: boolean;
  /** Embedded in a fixed-height container (landing demo) — fill parent, don't pin to viewport. */
  embedded?: boolean;
  /** Signed-out demo persona for the profile block (landing page). */
  demoUser?: { name: string; email: string; image: string | null };
  /** Portal target for the mobile sheet — keeps it inside the landing demo box, not <body>. */
  container?: React.ComponentProps<typeof SheetContent>["container"];
}) {
  const { hiddenNav } = useSettings();
  const { openMobile, setOpenMobile } = useSidebar();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });

  // Mobile sidebar is an off-canvas sheet — dismiss it after any navigating
  // action (pick folder, compose, open settings).
  const closeMobile = () => setOpenMobile(false);
  const after =
    <T extends unknown[]>(fn: (...args: T) => void) =>
    (...args: T) => {
      fn(...args);
      closeMobile();
    };
  const onLiveDev = embedded ? !!activeDevId : ROUTE_TARGETS.includes(pathname);
  const inViewAccounts = accounts.filter((account) =>
    scopeIds.includes(account.accountId),
  );
  const scopedCount = inViewAccounts.length;
  const scopedUnread = inViewAccounts.reduce(
    (sum, account) => sum + account.unread,
    0,
  );

  // Inbox is never hideable; everything else respects the Settings toggles.
  const childVisible = (child: NavChild) =>
    child.fixed || !hiddenNav.includes(child.id);

  const inner = (
    <>
      <SidebarHeader className="gap-1.5 p-2.5">
        <div className="flex items-center gap-2 px-1.5 pt-1 pb-2">
          <AccountBoxBrand className="size-[22px]" markClassName="size-3.5" />
          <span className="font-mono text-[13px] font-semibold">
            AccountBox
          </span>
        </div>

        <button
          type="button"
          onClick={after(onOpenCommand)}
          className="flex h-8 w-full items-center gap-2 rounded-[7px] border bg-card px-[9px] text-[12.5px] text-muted-foreground transition-colors hover:bg-muted"
        >
          <Search className="size-[13px]" />
          Search
          <KbdGroup className="ml-auto">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </button>
      </SidebarHeader>

      <SidebarContent className="px-2.5 py-1.5">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {NAV_SOURCES.map((integration) => {
                const children = integration.children.filter(childVisible);
                if (children.length === 0) return null;
                // Default-open only when the section has a live child.
                const hasLive = children.some((child) => !child.soon);
                // A "soon" integration (e.g. Linear) is a dimmed, non-expandable placeholder.
                if (integration.soon) {
                  return (
                    <SidebarMenuItem key={integration.id}>
                      <SidebarMenuButton
                        disabled
                        className={cn(navButton, "font-medium opacity-50")}
                      >
                        <integration.icon />
                        <span>{integration.label}</span>
                        <span className={soonBadge}>Soon</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }
                return (
                  <SidebarMenuItem key={integration.id}>
                    <Collapsible defaultOpen={hasLive}>
                      <CollapsibleTrigger
                        render={
                          <SidebarMenuButton
                            className={cn(
                              navButton,
                              "group/collapsible font-medium",
                            )}
                          />
                        }
                      >
                        <integration.icon />
                        <span>{integration.label}</span>
                        <ChevronRight className="ml-auto size-3.5 text-muted-foreground/60 transition-transform group-data-panel-open/collapsible:rotate-90" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="mr-0 gap-px pr-0">
                          {children.map((child) => {
                            if (child.soon) {
                              return (
                                <SidebarMenuSubItem key={child.id}>
                                  <SidebarMenuSubButton
                                    aria-disabled
                                    className="pointer-events-none w-full text-left opacity-40"
                                  >
                                    <child.icon />
                                    <span className="flex-1 truncate">
                                      {child.title}
                                    </span>
                                    <span className={soonBadge}>Soon</span>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            }
                            const isActive = child.action
                              ? false
                              : child.folder
                                ? !onLiveDev && folder === child.folder
                                : child.panel
                                  ? embedded
                                    ? activeDevId === child.id
                                    : (openPanels?.includes(child.panel) ??
                                      false)
                                  : embedded
                                    ? activeDevId === child.id
                                    : pathname === child.to;
                            const handle = child.action
                              ? after(onCompose)
                              : child.folder
                                ? after(() => onFolder(child.folder as Folder))
                                : child.panel
                                  ? after(() =>
                                      embedded && onOpenDevPage
                                        ? onOpenDevPage(child.id)
                                        : onTogglePanel?.(
                                            child.panel as string,
                                          ),
                                    )
                                  : after(() =>
                                      embedded && onOpenDevPage
                                        ? onOpenDevPage(child.id)
                                        : navigate({ to: child.to as string }),
                                    );
                            return (
                              <SidebarMenuSubItem key={child.id}>
                                <SidebarMenuSubButton
                                  isActive={isActive}
                                  onClick={handle}
                                  className="w-full text-left"
                                  render={<button type="button" />}
                                >
                                  <child.icon />
                                  <span className="flex-1 truncate">
                                    {child.title}
                                  </span>
                                  {child.id === "inbox" && scopedUnread > 0 ? (
                                    <span className={subBadge}>
                                      {formatCount(scopedUnread)}
                                    </span>
                                  ) : null}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-1 border-t pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {/* Model weight stream progress — visible only while loading. */}
        <AgentLoadRow />
        {/* Source scope is pinned here: route-independent, never reflows on
            integration switch. Manage sources in Settings; toggle in-view here.
            Collapses when viewing all. */}
        {loading ? (
          <div className="flex h-7 items-center gap-2 px-2">
            <span className="size-4 shrink-0 animate-pulse rounded bg-muted" />
            <span className="h-2.5 w-16 animate-pulse rounded bg-muted" />
          </div>
        ) : accounts.length > 0 ? (
          <Collapsible defaultOpen={!allOn}>
            <CollapsibleTrigger
              render={
                <button
                  type="button"
                  className="group/acct flex h-7 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-sidebar-accent"
                />
              }
            >
              <Users className="size-4 shrink-0 text-muted-foreground/70" />
              <span className="text-[13px] font-medium">Source Scope</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground/70">
                {allOn ? "All" : `${scopedCount} of ${accounts.length}`}
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-data-panel-open/acct:rotate-90" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pt-0.5">
                <ViewCard
                  accounts={accounts}
                  scopeIds={scopeIds}
                  onToggle={onToggleScope}
                  onAddAccount={() => linkGoogle()}
                  onAddTestAccount={onAddTestAccount}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        <NavUser
          onOpenSettings={after(onOpenSettings)}
          loading={loading}
          demoUser={demoUser}
        />
      </SidebarFooter>
    </>
  );

  return (
    <>
      {/* Desktop: persistent column. Hidden on mobile (the sheet below takes
          over). Embedded landing demo fills its box instead of pinning to svh. */}
      <Sidebar
        collapsible="none"
        className={cn(
          "hidden w-64 shrink-0 border-r md:flex",
          embedded ? "h-full" : "sticky top-0 h-svh",
        )}
      >
        {inner}
      </Sidebar>
      {/* Mobile: the same sidebar as a left-slide sheet; container keeps it
          inside the scaled landing-demo box. */}
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left"
          container={container}
          showCloseButton={false}
          className="w-[18rem] max-w-[85vw] gap-0 border-r bg-sidebar p-0 md:hidden"
        >
          <Sidebar collapsible="none" className="h-full w-full">
            {inner}
          </Sidebar>
        </SheetContent>
      </Sheet>
    </>
  );
}
