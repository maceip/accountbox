/**
 * The source registry — the workbench's central nervous system.
 *
 * An AppSource is one integration described once: its identity, how it
 * connects (Better Auth provider), the skill that plans against it, and the
 * views it contributes (mail folders, board panels, shell actions). The
 * sidebar, the board's panel registry, the command menu, Settings →
 * Connections, and the journey's connect step all derive from this list —
 * adding a source is one entry here plus its pane components.
 *
 * Data-only besides icon references and the auth-client link fns; no pane
 * component imports (those stay in the pane registry to keep layering flat).
 */

import type { ComponentType } from "react";
import {
  Archive,
  Bot,
  CircleDot,
  FileText,
  GitPullRequest,
  Inbox,
  PenLine,
  Rss,
  Send,
  ShieldAlert,
  SquareCheck,
  Swords,
  Tag,
  Trash2,
} from "lucide-react";

import type { Folder } from "@/lib/folders";
import type { AppSkill } from "@/lib/runtime/app-skill";
import { GMAIL_SKILL } from "@/lib/skills/gmail/skill";
import { linkGithub, linkGoogle } from "@/lib/auth/auth-client";
import { GmailMark } from "@/components/integrations/gmail-mark";
import { GithubMark } from "@/components/integrations/github-mark";
import { LinearMark } from "@/components/integrations/linear-mark";

type Icon = ComponentType<{ className?: string }>;

/** One navigable view a source contributes (sidebar item, settings toggle). */
export type SourceView = {
  id: string;
  title: string;
  icon: Icon;
  /** `folder` switches the mail panes; `panel` toggles a board pane; `action` runs a shell action. */
  folder?: Folder;
  panel?: string;
  action?: "compose";
  /** Dimmed, non-navigable placeholder. */
  soon?: boolean;
  /** Can't be hidden via Settings (Inbox). */
  fixed?: boolean;
};

/** How a source's account link works (Better Auth provider under the hood). */
export type SourceConnection = {
  providerId: "google" | "github";
  /** What connecting powers — shown on the Connections settings row. */
  description: string;
  connect: () => void;
};

export type AppSource = {
  id: string;
  label: string;
  icon: Icon;
  /** Whole source is upcoming — dimmed everywhere, no live views. */
  soon?: boolean;
  /** Absent = nothing to connect (e.g. the local agent). */
  connection?: SourceConnection;
  /** The fine-tuned planner trained against this source, if one exists. */
  skill?: AppSkill;
  views: SourceView[];
};

export const SOURCES: readonly AppSource[] = [
  {
    id: "agent",
    label: "Local agent",
    icon: Bot,
    views: [
      {
        id: "local_agent",
        title: "Agent chat",
        icon: Bot,
        panel: "local-agent",
      },
      { id: "loadout", title: "Loadout", icon: Swords, panel: "loadout" },
      { id: "incoming", title: "Incoming", icon: Rss, panel: "incoming" },
    ],
  },
  {
    id: "gmail",
    label: "Gmail",
    icon: GmailMark,
    skill: GMAIL_SKILL,
    connection: {
      providerId: "google",
      description:
        "Powers execution: search runs, messages load, drafts appear",
      connect: () => linkGoogle(),
    },
    views: [
      {
        id: "inbox",
        title: "Inbox",
        icon: Inbox,
        folder: "inbox",
        fixed: true,
      },
      { id: "compose", title: "Compose", icon: PenLine, action: "compose" },
      { id: "labeled", title: "Labeled", icon: Tag, folder: "labeled" },
      { id: "sent", title: "Sent", icon: Send, folder: "sent" },
      { id: "drafts", title: "Drafts", icon: FileText, folder: "drafts" },
      { id: "archived", title: "Archived", icon: Archive, folder: "archived" },
      { id: "spam", title: "Spam", icon: ShieldAlert, folder: "spam" },
      { id: "trash", title: "Trash", icon: Trash2, folder: "trash" },
    ],
  },
  {
    id: "github",
    label: "GitHub",
    icon: GithubMark,
    connection: {
      providerId: "github",
      description: "Read-only pull request and issue access",
      connect: () => linkGithub(),
    },
    views: [
      {
        id: "pull_requests",
        title: "Pull requests",
        icon: GitPullRequest,
        panel: "pull-requests",
      },
      {
        id: "github_issues",
        title: "Issues",
        icon: CircleDot,
        panel: "github-issues",
      },
    ],
  },
  {
    id: "linear",
    label: "Linear",
    icon: LinearMark,
    soon: true,
    views: [
      {
        id: "linear_assigned",
        title: "Assigned to you",
        icon: SquareCheck,
        soon: true,
      },
      {
        id: "linear_created",
        title: "Created by you",
        icon: CircleDot,
        soon: true,
      },
    ],
  },
];

export function getSource(id: string): AppSource | null {
  return SOURCES.find((s) => s.id === id) ?? null;
}

/** The source a skill plans against (journey step 3's connect target). */
export function getSourceForSkill(skillId: string): AppSource | null {
  return SOURCES.find((s) => s.skill?.id === skillId) ?? null;
}

/** Every board panel any source contributes: panel key -> title/icon. The
 *  pane registry maps these keys to components and the command menu lists
 *  them; a view with a `panel` IS a panel. */
export type SourcePanel = {
  key: string;
  title: string;
  icon: Icon;
  source: AppSource;
};

export const SOURCE_PANELS: readonly SourcePanel[] = SOURCES.flatMap((source) =>
  source.views
    .filter((v) => v.panel && !v.soon && !source.soon)
    .map((v) => ({
      key: v.panel as string,
      title: v.title,
      icon: v.icon,
      source,
    })),
);
