import { useSyncExternalStore } from "react";

function subscribeDialkitCss(onChange: () => void) {
  if (typeof document === "undefined") return () => {};
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style", "data-dialkit-density", "data-dialkit-grid"],
  });
  return () => obs.disconnect();
}

function readCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/** Live CSS custom property from DialKit dev panels (train / local dev). */
export function useDialkitCssVar(name: string, fallback: string): string {
  return useSyncExternalStore(
    subscribeDialkitCss,
    () => readCssVar(name, fallback),
    () => fallback,
  );
}
