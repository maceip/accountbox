import { lazy, Suspense, type ComponentType } from "react";

// DialKit rides every server that can take it: train-dev builds
// (VITE_DIALKIT=on) and the local dev server. Customer deploys never set the
// flag (deploy.sh forbids the markers), and E2E gate servers opt out with
// VITE_DIALKIT=off so a floating panel can't sit over gate selectors.
const DIALKIT_BUILD =
  import.meta.env.VITE_DIALKIT === "on" ||
  (import.meta.env.DEV && import.meta.env.VITE_DIALKIT !== "off");

const LazyDialKitDevRoot: ComponentType | null = DIALKIT_BUILD
  ? lazy(() =>
      import("./dialkit-dev").then((m) => ({ default: m.DialKitDevRoot })),
    )
  : null;

const LazyAppShellDials: ComponentType | null = DIALKIT_BUILD
  ? lazy(() =>
      import("./app-shell-dials").then((m) => ({ default: m.AppShellDials })),
    )
  : null;

const LazyInboxDials: ComponentType | null = DIALKIT_BUILD
  ? lazy(() =>
      import("./inbox-dials").then((m) => ({ default: m.InboxDials })),
    )
  : null;

export function DialKitSlot() {
  if (!LazyDialKitDevRoot) return null;
  return (
    <Suspense fallback={null}>
      <LazyDialKitDevRoot />
    </Suspense>
  );
}

export function DialKitAppDials() {
  if (!LazyAppShellDials || !LazyInboxDials) return null;
  return (
    <Suspense fallback={null}>
      <LazyAppShellDials />
      <LazyInboxDials />
    </Suspense>
  );
}
