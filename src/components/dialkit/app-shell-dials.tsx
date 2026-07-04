import { useEffect } from "react";
import { useDevDialKit } from "dialkit";
import { applyAppShellDialVars } from "./dialkit-vars";

/** Dev-only tuners for the main app shell. Values persist in localStorage. */
export function AppShellDials() {
  const values = useDevDialKit(
    "App shell",
    {
      sidebarWidth: [18, 12, 28, 0.5],
      headerHeight: [3, 2, 5, 0.25],
      contentGap: [0, 0, 24, 1],
      showGridGuides: false,
    },
    { id: "accountbox-app-shell" },
  );

  useEffect(() => {
    applyAppShellDialVars({
      sidebarWidth: Number(values.sidebarWidth),
      headerHeight: Number(values.headerHeight),
      contentGap: Number(values.contentGap),
      showGridGuides: Boolean(values.showGridGuides),
    });
  }, [values.sidebarWidth, values.headerHeight, values.contentGap, values.showGridGuides]);

  return null;
}
