import { Link, useLocation } from "@tanstack/react-router";
import {
  PenLine,
  Search,
  Settings,
} from "lucide-react";

import { AccountBoxBrand } from "@/components/shell/accountbox-mark";
import { NavUser } from "@/components/shell/nav-user";
import { WORKBENCH_NAV } from "@/lib/workbench/nav";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function OpsSidebar({
  onOpenCommand,
  onOpenSettings,
  onCompose,
  loading = false,
}: {
  onOpenCommand: () => void;
  onOpenSettings: () => void;
  onCompose: () => void;
  loading?: boolean;
}) {
  const { openMobile, setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (l) => l.pathname });

  const closeMobile = () => setOpenMobile(false);
  const after =
    <T extends unknown[]>(fn: (...args: T) => void) =>
    (...args: T) => {
      fn(...args);
      closeMobile();
    };

  const inner = (
    <>
      <SidebarHeader className="gap-1.5 p-2.5">
        <div className="flex items-center gap-2 px-1.5 pt-1 pb-2">
          <AccountBoxBrand className="size-[22px]" markClassName="size-3.5" />
          <span className="font-mono text-[13px] font-semibold">AccountBox</span>
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

      <SidebarContent className="gap-0">
        <SidebarGroup className="p-2">
          <SidebarGroupContent>
            <SidebarMenu>
              {WORKBENCH_NAV.map((item) => {
                const Icon = item.icon;
                const active =
                  item.to === "/"
                    ? pathname === "/"
                    : pathname === item.to ||
                      pathname.startsWith(`${item.to}/`);
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      render={<Link to={item.to} onClick={closeMobile} />}
                      isActive={active}
                      className={cn(
                        "h-8 gap-2 px-2 text-[13px]",
                        active && "text-primary",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="border-t p-2">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={after(onCompose)}
                  className="h-8 gap-2 px-2 text-[13px]"
                >
                  <PenLine className="size-4" />
                  Compose
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={after(onOpenSettings)}
                  className="h-8 gap-2 px-2 text-[13px]"
                >
                  <Settings className="size-4" />
                  Settings
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <NavUser
          loading={loading}
          onOpenSettings={after(onOpenSettings)}
        />
      </SidebarFooter>
    </>
  );

  return (
    <>
      <Sidebar collapsible="icon" className="border-r-0">
        {inner}
      </Sidebar>
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left"
          className="w-[min(100%,280px)] bg-sidebar p-0 [&>button]:hidden"
        >
          <Sidebar collapsible="none" className="h-full border-0">
            {inner}
          </Sidebar>
        </SheetContent>
      </Sheet>
    </>
  );
}
