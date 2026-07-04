import type { LucideIcon } from "lucide-react";
import {
  FlaskConical,
  LayoutDashboard,
  Database,
  Target,
  Plug,
  Package,
  Cpu,
  Swords,
} from "lucide-react";

/** Ops-first primary rail — not source/folder nav. Gmail folders live under Sources. */
export type WorkbenchNavId =
  | "command-center"
  | "skills"
  | "training"
  | "datasets"
  | "evals"
  | "sources"
  | "artifacts"
  | "runtime";

export type WorkbenchNavItem = {
  id: WorkbenchNavId;
  label: string;
  to: string;
  icon: LucideIcon;
  description: string;
};

export const WORKBENCH_NAV: readonly WorkbenchNavItem[] = [
  {
    id: "command-center",
    label: "Command Center",
    to: "/",
    icon: LayoutDashboard,
    description: "Active skill, runtime, queues, blockers",
  },
  {
    id: "skills",
    label: "Skills",
    to: "/skills",
    icon: Swords,
    description: "Loadout, train, equip, run",
  },
  {
    id: "training",
    label: "Training",
    to: "/training",
    icon: FlaskConical,
    description: "Run queue and artifact promotion",
  },
  {
    id: "datasets",
    label: "Datasets",
    to: "/datasets",
    icon: Database,
    description: "Traces, examples, source coverage",
  },
  {
    id: "evals",
    label: "Evals",
    to: "/evals",
    icon: Target,
    description: "Eval range — trust surface",
  },
  {
    id: "sources",
    label: "Sources",
    to: "/sources",
    icon: Plug,
    description: "Gmail, GitHub, connected accounts",
  },
  {
    id: "artifacts",
    label: "Artifacts",
    to: "/artifacts",
    icon: Package,
    description: "Adapter versions, promote, rollback",
  },
  {
    id: "runtime",
    label: "Runtime",
    to: "/runtime",
    icon: Cpu,
    description: "Model, WebGPU, inference slot",
  },
] as const;

/** Paths that render workbench pages (not the mail tile board). */
export const WORKBENCH_PATHS = new Set([
  "/",
  "/skills",
  "/training",
  "/datasets",
  "/evals",
  "/sources",
  "/artifacts",
  "/runtime",
]);

/** Gmail lives under Sources; these paths show InboxTiles. */
export const GMAIL_SOURCE_PREFIX = "/sources/gmail";

export const GMAIL_FOLDER_PATH = {
  inbox: `${GMAIL_SOURCE_PREFIX}`,
  labeled: `${GMAIL_SOURCE_PREFIX}/labeled`,
  sent: `${GMAIL_SOURCE_PREFIX}/sent`,
  drafts: `${GMAIL_SOURCE_PREFIX}/drafts`,
  archived: `${GMAIL_SOURCE_PREFIX}/archived`,
  spam: `${GMAIL_SOURCE_PREFIX}/spam`,
  trash: `${GMAIL_SOURCE_PREFIX}/trash`,
} as const;

/** Legacy folder URLs — redirect targets. */
export const LEGACY_FOLDER_REDIRECT: Record<string, string> = {
  "/labeled": GMAIL_FOLDER_PATH.labeled,
  "/sent": GMAIL_FOLDER_PATH.sent,
  "/drafts": GMAIL_FOLDER_PATH.drafts,
  "/archived": GMAIL_FOLDER_PATH.archived,
  "/spam": GMAIL_FOLDER_PATH.spam,
  "/trash": GMAIL_FOLDER_PATH.trash,
};

export function isWorkbenchPath(pathname: string): boolean {
  if (WORKBENCH_PATHS.has(pathname)) return true;
  if (pathname === "/sources/gmail/hub") return true;
  if (pathname.startsWith(GMAIL_SOURCE_PREFIX)) return false;
  if (pathname.startsWith("/email/")) return false;
  if (pathname.startsWith("/pull-requests")) return false;
  if (pathname.startsWith("/issues")) return false;
  return false;
}

export function isMailBoardPath(pathname: string): boolean {
  if (pathname === "/sources/gmail/hub") return false;
  if (pathname.startsWith(GMAIL_SOURCE_PREFIX)) return true;
  if (pathname in LEGACY_FOLDER_REDIRECT) return true;
  return false;
}

export function pathnameToFolder(pathname: string): import("@/lib/folders").Folder {
  const normalized = LEGACY_FOLDER_REDIRECT[pathname] ?? pathname;
  const map: Record<string, import("@/lib/folders").Folder> = {
    [GMAIL_FOLDER_PATH.inbox]: "inbox",
    [GMAIL_FOLDER_PATH.labeled]: "labeled",
    [GMAIL_FOLDER_PATH.sent]: "sent",
    [GMAIL_FOLDER_PATH.drafts]: "drafts",
    [GMAIL_FOLDER_PATH.archived]: "archived",
    [GMAIL_FOLDER_PATH.spam]: "spam",
    [GMAIL_FOLDER_PATH.trash]: "trash",
  };
  return map[normalized] ?? "inbox";
}
