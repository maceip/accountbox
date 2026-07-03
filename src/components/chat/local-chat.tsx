import { useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AgentChat, AgentStatusDot } from "@/components/agent/agent-chat";

/** Phone-only agent launcher: a floating button opening the chat as a
 *  full-screen sheet (the cramped floating panel is gone). On desktop and
 *  unfolded foldables the agent lives on the board as a tile (AgentPane) —
 *  AppShell only mounts this on the phone surface. */
export function LocalChat() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-50"
      >
        <Bot className="size-4" />
        Local agent
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          // top-0 stretches the bottom sheet to full height (side=bottom only
          // pins inset-x/bottom and sets h-auto — don't fight it with h-*).
          className="top-0 flex flex-col gap-0 rounded-none border-0 p-0"
        >
          <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3 pt-[env(safe-area-inset-top)]">
            <span className="flex size-6 items-center justify-center rounded bg-primary text-on-primary">
              <Bot className="size-3.5" />
            </span>
            <SheetTitle className="flex-1 text-[13px] font-medium">
              Local agent
            </SheetTitle>
            <AgentStatusDot />
          </header>
          <div className="min-h-0 flex-1">
            <AgentChat />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
