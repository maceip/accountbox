import { Button } from "@/components/ui/button";
import { GITHUB_URL } from "@/components/integrations/github-mark";
import { cn } from "@/lib/utils";

import { COL, PulseDot, scrollToPlan } from "./primitives";

export function Hero() {
  return (
    <section className={cn(COL, "pt-10 text-center sm:pt-16")}>
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 whitespace-nowrap">
        <PulseDot />
        <span className="text-sm text-muted-foreground">
          In development. Waitlist open
        </span>
      </div>

      <h1 className="mx-auto max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-balance text-foreground sm:text-5xl md:text-6xl">
        All your inboxes. One tab.
      </h1>

      <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
        A new interface for the Gmail accounts you already have. See every inbox
        side by side in one tab, with your mail still living in Google.
      </p>

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          <Button size="lg" className="h-11 px-6 text-base">
            Self-host for free →
          </Button>
        </a>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={scrollToPlan}
          className="h-11 px-6 text-base"
        >
          Join the waitlist →
        </Button>
      </div>
    </section>
  );
}
