import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const WL_KEY = "betterbox-waitlist-email";

/** Waitlist capture: idle → open (email field) → done. Submits to /api/waitlist
 *  (tagged with `source` to track which placement converts) and mirrors the email
 *  to localStorage so every instance shows the success state on reload. */
export function Waitlist({
  big = false,
  source,
}: {
  big?: boolean;
  source: string;
}) {
  const stored = (() => {
    try {
      return localStorage.getItem(WL_KEY);
    } catch {
      return null;
    }
  })();
  const [phase, setPhase] = useState<"idle" | "open" | "done">(
    stored ? "done" : "idle",
  );
  const [email, setEmail] = useState(stored || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (phase === "open") inputRef.current?.focus();
  }, [phase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/.+@.+\..+/.test(email)) {
      setError("That does not look like a valid email.");
      inputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      if (res.status === 400) {
        setError("That does not look like a valid email.");
        return;
      }
      if (!res.ok) {
        setError("Something went wrong. Try again.");
        return;
      }
      // ok or already_registered → same success state. Mirror to localStorage
      // so it survives a reload.
      try {
        localStorage.setItem(WL_KEY, email);
      } catch {
        /* ignore */
      }
      setPhase("done");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const height = big ? "h-11" : "h-10";
  const minH = big ? "min-h-11" : "min-h-10";

  if (phase === "done") {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 font-mono text-xs text-muted-foreground",
          minH,
        )}
      >
        <span className="text-success">✓</span>
        <span>you're on the list. One email at launch, that's it.</span>
      </div>
    );
  }

  if (phase === "open") {
    return (
      <div className="flex w-full flex-col items-center gap-2">
        <form
          onSubmit={submit}
          className={cn(
            "mx-auto flex w-full justify-center gap-2",
            big ? "max-w-sm" : "max-w-xs",
            minH,
          )}
        >
          <input
            ref={inputRef}
            type="email"
            value={email}
            placeholder="you@yourdomain.dev"
            disabled={submitting}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(
              "min-w-0 flex-1 rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:border-ring disabled:opacity-60",
              height,
            )}
          />
          <Button
            type="submit"
            size={big ? "lg" : "default"}
            disabled={submitting}
            aria-busy={submitting}
            className={cn("relative shrink-0", height, big && "px-6 text-base")}
          >
            {/* Keep the label in the DOM (invisible) so width doesn't jump
                when it swaps to the spinner. */}
            <span className={cn(submitting && "invisible")}>Notify me</span>
            {submitting && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              </span>
            )}
          </Button>
        </form>
        {error && <p className="font-mono text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className={cn("flex justify-center", minH)}>
      <Button
        type="button"
        size={big ? "lg" : "default"}
        onClick={() => setPhase("open")}
        className={cn(height, big && "px-6 text-base")}
      >
        Join the waitlist →
      </Button>
    </div>
  );
}
