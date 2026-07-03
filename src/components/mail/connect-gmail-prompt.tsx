import { linkGoogle } from "@/lib/auth/auth-client";
import { GmailMark } from "@/components/integrations/gmail-mark";
import { Button } from "@/components/ui/button";

/** First-run empty state — takes the exact spot the first inbox pane will fill.
 *  Rendered as a board tile on desktop/foldable and full-screen on mobile. */
export function ConnectGmailPrompt() {
  return (
    <div className="grid h-full min-h-0 w-full place-items-center p-6">
      <div className="flex w-full max-w-[320px] flex-col items-center gap-4 text-center">
        <span className="flex size-9 items-center justify-center rounded-md bg-primary text-on-primary">
          <GmailMark className="size-4.5" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold">Connect your Gmail</h2>
          <p className="mt-1 text-[12px] leading-normal text-muted-foreground">
            Your inbox appears right here as a panel. Mail stays in Google —
            read and sent through the Gmail API, never stored on a server.
          </p>
        </div>
        <Button onClick={() => linkGoogle()}>Connect Gmail</Button>
      </div>
    </div>
  );
}
