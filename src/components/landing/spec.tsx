import { Kbd, KbdGroup } from "@/components/ui/kbd";

import { Wrap } from "./primitives";

const SPEC_CELLS: { label: React.ReactNode; body: React.ReactNode }[] = [
  {
    label: "multi-account",
    body: "Every Google inbox in one list. Colored dots keep accounts apart; views merge them.",
  },
  {
    label: (
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    ),
    body: "Command palette. Compose, switch accounts, search, and export from one menu.",
  },
  {
    label: "open source",
    body: "Full source on GitHub. Self-host free with your own credentials. No data leaves your machine.",
  },
  {
    label: "exports",
    body: (
      <>
        Any thread as Markdown, JSON, or plain text, or the raw MIME source, one{" "}
        <KbdGroup>
          <Kbd>⌥</Kbd>
          <Kbd>R</Kbd>
        </KbdGroup>{" "}
        away.
      </>
    ),
  },
  {
    label: "private by design",
    body: "Every remote subresource in an email, images, stylesheets, fonts, media, is stripped or proxied. Trackers never see your IP.",
  },
  {
    label: "integrations",
    body: "GitHub is connected now. Linear is next. Your PRs, your issues, and your email in one tab.",
  },
];

export function Spec() {
  return (
    <Wrap label="what it is" caption="the short version">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="-m-px grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {SPEC_CELLS.map((cell, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: SPEC_CELLS is a static const list, never reordered.
            <div key={i} className="border-t border-l border-border p-5">
              <div className="mb-2 flex h-5 items-center font-mono text-xs font-medium tracking-wide text-muted-foreground/60 uppercase">
                {cell.label}
              </div>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {cell.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Wrap>
  );
}
