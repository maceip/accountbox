import {
  ChevronsUpDown,
  Laptop,
  LogOut,
  Moon,
  Settings,
  Sun,
} from "lucide-react";

import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
] as const;

/** Profile block at the bottom of the sidebar. The primary (signed-in Google)
 *  account; linked inboxes live in the View card above. */
export function NavUser({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  if (!session) return null;
  const user = session.user;
  const initials = (user.name ?? user.email ?? "?").slice(0, 2).toUpperCase();

  const profile = (
    <>
      <Avatar className="size-8 rounded-lg">
        <AvatarImage src={user.image ?? undefined} alt={user.name} />
        <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left leading-tight">
        <span className="truncate text-[13px] font-medium">{user.name}</span>
        <span className="truncate font-mono text-[10.5px] text-muted-foreground">
          {user.email}
        </span>
      </div>
    </>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            {profile}
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side="top"
            align="start"
            sideOffset={6}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1.5 py-1.5 text-left">
                  {profile}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onOpenSettings}>
                <Settings />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <div role="group" aria-label="Theme" className="flex gap-1 p-1">
              {THEMES.map((option) => (
                <Hint key={option.value} label={option.label}>
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={theme === option.value}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      "h-7 flex-1",
                      theme === option.value
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <option.icon />
                    <span className="sr-only">{option.label}</span>
                  </Button>
                </Hint>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
