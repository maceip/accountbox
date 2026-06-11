import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ChartDef } from "@/lib/analytics/types";
import { DEFAULT_CHARTS } from "@/lib/analytics/defs";

/**
 * The user's preferences blob, persisted in Postgres (`user.preferences`) so
 * settings + custom charts follow them across devices. A localStorage copy
 * hydrates the first paint instantly, then the DB value reconciles — and writes
 * are optimistic, so toggles feel immediate.
 *
 * Everything in the settings surface should live here; add keys freely.
 */
export type Preferences = {
  charts?: ChartDef[];
  [key: string]: unknown;
};

const CACHE_KEY = "betterbox.preferences";
const queryKey = ["preferences"] as const;

function readCache(): Preferences | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Preferences) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(prefs: Preferences) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode / quota — DB is the source of truth anyway */
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export function usePreferences() {
  const client = useQueryClient();

  const query = useQuery({
    queryKey,
    initialData: readCache,
    staleTime: 60_000,
    queryFn: async () => {
      const data = await fetchJson<{ preferences: Preferences }>(
        "/api/preferences",
      );
      writeCache(data.preferences);
      return data.preferences;
    },
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<Preferences>) =>
      fetchJson<{ preferences: Preferences }>("/api/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).then((d) => d.preferences),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey });
      const prev = client.getQueryData<Preferences>(queryKey);
      const next = { ...(prev ?? {}), ...patch };
      client.setQueryData(queryKey, next);
      writeCache(next);
      return { prev };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.prev) client.setQueryData(queryKey, ctx.prev);
    },
    onSuccess: (prefs) => {
      client.setQueryData(queryKey, prefs);
      writeCache(prefs);
    },
  });

  return {
    prefs: (query.data ?? {}) as Preferences,
    update: mutation.mutate,
  };
}

/** Custom + default charts, persisted in preferences. Defaults seed the list
 *  until the user changes it, after which the full set is stored. */
export function useChartDefs() {
  const { prefs, update } = usePreferences();
  const charts = prefs.charts ?? DEFAULT_CHARTS;

  const save = (next: ChartDef[]) => update({ charts: next });
  return {
    charts,
    add: (def: ChartDef) => save([...charts, def]),
    remove: (id: string) => save(charts.filter((c) => c.id !== id)),
    reset: () => save(DEFAULT_CHARTS),
  };
}
