import { useDevDialKit } from "dialkit";

/** Dev-only tuners for the main app shell. Values persist in localStorage. */
export function AppShellDials() {
  useDevDialKit(
    "App shell",
    {
      sidebarWidth: [18, 12, 28, 0.5],
      headerHeight: [3, 2, 5, 0.25],
      contentGap: [0, 0, 24, 1],
      showGridGuides: false,
    },
    { id: "accountbox-app-shell" },
  );

  return null;
}
