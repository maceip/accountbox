/** CSS custom properties written by DialKit dev panels (train / local dev only). */

export function applyAppShellDialVars(values: {
  sidebarWidth: number;
  headerHeight: number;
  contentGap: number;
  showGridGuides: boolean;
}) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--dialkit-sidebar-width", `${values.sidebarWidth}rem`);
  root.style.setProperty("--dialkit-header-height", `${values.headerHeight}rem`);
  root.style.setProperty("--dialkit-content-gap", `${values.contentGap}px`);
  root.dataset.dialkitGrid = values.showGridGuides ? "1" : "0";
}

export function applyInboxDialVars(values: {
  tileMinWidth: number;
  tileGap: number;
  readerWidth: number;
  density: string;
}) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--dialkit-tile-min-px", `${values.tileMinWidth}px`);
  root.style.setProperty("--dialkit-tile-gap", `${values.tileGap}px`);
  root.style.setProperty(
    "--dialkit-reader-ratio",
    String(Math.min(0.85, Math.max(0.15, values.readerWidth / 100))),
  );
  root.dataset.dialkitDensity = values.density;
}
