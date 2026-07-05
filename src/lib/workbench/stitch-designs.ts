/** Stitch premium-pass HTML exports — design reference, not runtime iframes. */
export type StitchDesignId =
  | "command-center"
  | "skills"
  | "sources-gmail"
  | "training"
  | "evals";

export type StitchDesign = {
  id: StitchDesignId;
  title: string;
  htmlPath: `/stitch-designs/${string}.html`;
  /** Workbench route this design maps to. */
  routePrefix: string;
};

export const STITCH_DESIGNS: Record<StitchDesignId, StitchDesign> = {
  "command-center": {
    id: "command-center",
    title: "Command Center",
    htmlPath: "/stitch-designs/command-center.html",
    routePrefix: "/",
  },
  skills: {
    id: "skills",
    title: "Skills Workbench",
    htmlPath: "/stitch-designs/skills.html",
    routePrefix: "/skills",
  },
  "sources-gmail": {
    id: "sources-gmail",
    title: "Sources Gmail Hub",
    htmlPath: "/stitch-designs/sources-gmail.html",
    routePrefix: "/sources/gmail",
  },
  training: {
    id: "training",
    title: "Training Bay",
    htmlPath: "/stitch-designs/training.html",
    routePrefix: "/training",
  },
  evals: {
    id: "evals",
    title: "Eval Range",
    htmlPath: "/stitch-designs/evals.html",
    routePrefix: "/evals",
  },
};

export function stitchDesignForPath(pathname: string): StitchDesign | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/" || normalized === "/command") {
    return STITCH_DESIGNS["command-center"];
  }
  const entries = Object.values(STITCH_DESIGNS).sort(
    (a, b) => b.routePrefix.length - a.routePrefix.length,
  );
  for (const design of entries) {
    if (
      design.routePrefix !== "/" &&
      (normalized === design.routePrefix ||
        normalized.startsWith(`${design.routePrefix}/`))
    ) {
      return design;
    }
  }
  return null;
}
