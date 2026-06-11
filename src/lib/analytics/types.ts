/**
 * Analytics types — shared by the server producer (`gmail/api.server`), the
 * client query layer (`mail-queries`), and the chart UI.
 *
 * Analytics is query-driven: every chart is one or more Gmail search queries
 * counted per day. A `SeriesPoint` is that per-day count for one query on one
 * account; the client merges across accounts and queries (see `./model`).
 */

/** One day's match count for a query. `date` is ISO `YYYY-MM-DD`. */
export type SeriesPoint = { date: string; count: number };

export type TopSender = { name: string; email: string; count: number };

// ── chart definitions (persisted in user preferences) ────────────────────────

export type ChartType = "area" | "line";

/** How a chart is rendered:
 *  - `stat`    compact KPI cell: one query → big number + delta + sparkline
 *  - `series`  full panel: one line per query, or per account when split
 *  - `senders` the special Top-senders bar list (no query) */
export type ChartKind = "stat" | "series" | "senders";

/** A named Gmail search that becomes one line/value on a chart. */
export type QuerySeries = { label: string; q: string };

export type ChartDef = {
  id: string;
  name: string;
  kind: ChartKind;
  /** Render style for `series` charts. */
  type: ChartType;
  /** One line per account (account colors) instead of per query. */
  splitByAccount: boolean;
  /** `stat` uses the first entry; `senders` ignores this. */
  series: QuerySeries[];
  /** Defaults can't be deleted; user charts can. */
  builtin?: boolean;
};
