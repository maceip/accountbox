import { useQuery } from "@tanstack/react-query";
import type { PullRequest } from "@/lib/github/github.server";

export type { PullRequest } from "@/lib/github/github.server";

export type PullRequestsResult = {
  linked: boolean;
  login?: string;
  prs?: PullRequest[];
  error?: string;
};

/** Pull requests from the linked GitHub account. `linked: false` means the user
 *  hasn't connected GitHub yet — the page shows the connect CTA. */
export function usePullRequestsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["pull-requests"],
    enabled,
    queryFn: async (): Promise<PullRequestsResult> => {
      const res = await fetch("/api/pull-requests");
      const data = (await res.json().catch(() => ({}))) as PullRequestsResult;
      if (!res.ok && !data.linked) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      return data;
    },
  });
}
