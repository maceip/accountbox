import { useEffect, useState } from "react";
import { TriangleAlertIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { COL } from "./primitives";

/** Shown when Better Auth bounces a blocked sign-in back with `?error=UNKNOWN`
 *  (or FORBIDDEN) — the ALLOWED_EMAILS hook rejecting an off-list account.
 *  Dismissible (clears the param) so it never blocks the page after it's read. */
export function AccessErrorBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error === "UNKNOWN" || error === "FORBIDDEN") setShow(true);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url);
  };

  return (
    <div className={cn(COL, "pt-4")}>
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive"
      >
        <TriangleAlertIcon
          className="mt-0.5 size-[18px] shrink-0"
          strokeWidth={2}
        />
        <p className="min-w-0 flex-1 text-sm leading-relaxed">
          This account doesn't have access yet. Join the waitlist or self-host
          with your own credentials.
        </p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="-mr-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-destructive/15"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
