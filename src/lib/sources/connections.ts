/**
 * Generic source-connection state — which Better Auth providers have linked
 * account rows. Every generic surface (command center, connected-sources
 * block) derives "connected" from this, so a new cartridge's provider shows
 * up everywhere by registering its source — not by editing panels.
 *
 * Query key matches the settings Connections page so link/unlink
 * invalidations refresh both.
 */
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/auth-client";
import type { AppSource } from "./index";

export const LINKED_ACCOUNTS_QUERY_KEY = ["linked-accounts"] as const;

export function useLinkedAccounts() {
  return useQuery({
    queryKey: LINKED_ACCOUNTS_QUERY_KEY,
    queryFn: async () => {
      const res = await authClient.listAccounts();
      return res.data ?? [];
    },
  });
}

export type SourceConnectionState = {
  /** True when the source's provider has at least one linked account row. */
  connected: boolean;
  loading: boolean;
  /** Linked account rows for this provider (0 when none / no connection). */
  count: number;
};

export function useSourceConnected(
  source: AppSource | null | undefined,
): SourceConnectionState {
  const linked = useLinkedAccounts();
  const providerId = source?.connection?.providerId;
  const rows = linked.data ?? [];
  const count = providerId
    ? rows.filter((a) => a.providerId === providerId).length
    : 0;
  // A source with no connection (the local agent) needs nothing — count it
  // as connected so it never renders as a blocker.
  const connected = source?.connection ? count > 0 : true;
  return { connected, loading: linked.isLoading, count };
}

export function getSourceById(
  sources: readonly AppSource[],
  id: string | undefined,
): AppSource | null {
  return sources.find((s) => s.id === id) ?? null;
}
