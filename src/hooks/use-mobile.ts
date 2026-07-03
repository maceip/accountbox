import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

/** True only on an unfolded foldable presenting two side-by-side viewport
 *  segments (Chromium's viewport-segments media feature). Everywhere else —
 *  phones, desktops, folded postures — this is false. A 50/50 split along the
 *  hinge is seam-safe, so consumers only need the boolean, not geometry. */
export function useFoldable() {
  const [folded, setFolded] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia("(horizontal-viewport-segments: 2)");
    const onChange = () => setFolded(mql.matches);
    mql.addEventListener("change", onChange);
    setFolded(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return folded;
}
