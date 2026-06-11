import type { ChartDef } from "./types";

/**
 * Default charts + the building blocks the "Add custom chart" builder offers.
 * Defaults are seeded for every user and can be removed like any other chart;
 * the set then persists in their preferences.
 */

/** Query presets the builder offers as a dropdown (custom `q` still allowed). */
export const QUERY_PRESETS: { label: string; q: string }[] = [
  { label: "Inbox", q: "in:inbox" },
  { label: "Sent", q: "in:sent" },
  { label: "Spam", q: "in:spam" },
  { label: "Promotions", q: "category:promotions" },
  { label: "Social", q: "category:social" },
  { label: "Updates", q: "category:updates" },
  { label: "Forums", q: "category:forums" },
  { label: "Starred", q: "is:starred" },
  { label: "Important", q: "is:important" },
  { label: "Has attachment", q: "has:attachment" },
  { label: "Unread", q: "is:unread" },
];

export const DEFAULT_CHARTS: ChartDef[] = [
  {
    id: "received",
    name: "Received",
    kind: "stat",
    type: "area",
    splitByAccount: false,
    series: [{ label: "Received", q: "in:inbox" }],
    builtin: true,
  },
  {
    id: "sent",
    name: "Sent",
    kind: "stat",
    type: "area",
    splitByAccount: false,
    series: [{ label: "Sent", q: "in:sent" }],
    builtin: true,
  },
  {
    id: "spam",
    name: "Spam",
    kind: "stat",
    type: "area",
    splitByAccount: false,
    series: [{ label: "Spam", q: "in:spam" }],
    builtin: true,
  },
  {
    id: "volume",
    name: "Message volume",
    kind: "series",
    type: "area",
    splitByAccount: true,
    series: [{ label: "Received", q: "in:inbox" }],
    builtin: true,
  },
  {
    id: "categories",
    name: "Category mix",
    kind: "series",
    type: "area",
    splitByAccount: false,
    series: [
      { label: "Promotions", q: "category:promotions" },
      { label: "Social", q: "category:social" },
      { label: "Updates", q: "category:updates" },
      { label: "Forums", q: "category:forums" },
    ],
    builtin: true,
  },
  {
    id: "senders",
    name: "Top senders",
    kind: "senders",
    type: "area",
    splitByAccount: false,
    series: [],
    builtin: true,
  },
];

/** Teal dev accent for aggregate/sparkline fills. */
export const TEAL = { bright: "#3edbc8", base: "#1fb8a6", deep: "#0f7c6f" };

/** Categorical palette for `series` charts that compare *queries* (not
 *  accounts) — never reuse account colors there or it reads as per-account. */
export const CATEGORICAL = [
  "#3edbc8",
  "#4ea7fc",
  "#b59aff",
  "#f2c94c",
  "#fc7840",
  "#4cb782",
];
