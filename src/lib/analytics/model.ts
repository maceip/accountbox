import type { SeriesPoint } from "./types";

/**
 * Pure transforms behind the charts. No React, no chart imports — fold the raw
 * per-query, per-account day counts coming off `/api/analytics` into the shape
 * the renderer reads.
 */

/** Raw counts for one query on one account. */
export type AccountSeriesRaw = { accountId: string; points: SeriesPoint[] };
/** Raw counts for one query across the scoped accounts. */
export type ChartSeriesRaw = {
  label: string;
  q: string;
  perAccount: AccountSeriesRaw[];
};

export type RenderSeries = {
  label: string;
  q: string;
  /** Summed across accounts, per date. */
  total: number[];
  byAccount: { accountId: string; values: number[] }[];
};

export type ChartData = { dates: string[]; series: RenderSeries[] };

/** Align every (query × account) series onto one date axis and sum totals. */
export function buildChartData(raw: ChartSeriesRaw[]): ChartData {
  // Canonical axis = the longest run of dates seen (all accounts share the same
  // range, but this stays correct if one came back short).
  let dates: string[] = [];
  for (const s of raw) {
    for (const a of s.perAccount) {
      if (a.points.length > dates.length) dates = a.points.map((p) => p.date);
    }
  }

  const series: RenderSeries[] = raw.map((s) => {
    const byAccount = s.perAccount.map((a) => {
      const byDate = new Map(a.points.map((p) => [p.date, p.count]));
      return {
        accountId: a.accountId,
        values: dates.map((d) => byDate.get(d) ?? 0),
      };
    });
    const total = dates.map((_, i) =>
      byAccount.reduce((sum, a) => sum + (a.values[i] ?? 0), 0),
    );
    return { label: s.label, q: s.q, total, byAccount };
  });

  return { dates, series };
}

export type Delta = { label: string; good: boolean; neutral: boolean };

/** Percent change today-vs-yesterday, formatted for a delta pill. */
export function pctDelta(today: number, prev: number): Delta {
  if (prev === 0) {
    return {
      label: today > 0 ? "new" : "0%",
      good: today > 0,
      neutral: today === 0,
    };
  }
  const pct = Math.round(((today - prev) / prev) * 100);
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return { label: `${sign}${Math.abs(pct)}%`, good: pct >= 0, neutral: pct === 0 };
}

/** A `{ date, v }` series for a flush sparkline. */
export function toSpark(dates: string[], values: number[]) {
  return dates.map((date, i) => ({ date, v: values[i] ?? 0 }));
}
