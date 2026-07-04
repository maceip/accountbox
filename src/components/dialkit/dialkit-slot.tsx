import { lazy, Suspense, type ComponentType } from "react";

const LazyDialKitDevRoot: ComponentType | null =
  import.meta.env.VITE_DIALKIT === "on"
    ? lazy(() =>
        import("./dialkit-dev").then((m) => ({ default: m.DialKitDevRoot })),
      )
    : null;

const LazyAppShellDials: ComponentType | null =
  import.meta.env.VITE_DIALKIT === "on"
    ? lazy(() =>
        import("./app-shell-dials").then((m) => ({ default: m.AppShellDials })),
      )
    : null;

const LazyInboxDials: ComponentType | null =
  import.meta.env.VITE_DIALKIT === "on"
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
