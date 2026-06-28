import { Link } from "@tanstack/react-router";

import { GITHUB_URL } from "@/components/integrations/github-mark";
import { cn } from "@/lib/utils";

import { COL, Wordmark } from "./primitives";

export function Footer() {
  return (
    <footer className={cn(COL, "pb-10")}>
      <div className="flex flex-col items-start gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:gap-5">
        <Wordmark small />
        <span className="font-mono text-xs text-muted-foreground/60">
          in development · self-host is open · hosted coming soon
        </span>
        <div className="flex items-center gap-4 font-mono text-xs sm:ml-auto">
          <a
            href={`${GITHUB_URL}/issues`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground"
          >
            Issues
          </a>
          <Link to="/privacy" className="text-muted-foreground">
            Privacy
          </Link>
          <span className="text-muted-foreground/60">© 2026</span>
        </div>
      </div>
    </footer>
  );
}
