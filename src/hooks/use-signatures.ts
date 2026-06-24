import { useQuery } from "@tanstack/react-query";

export type Signature = { id: string; name: string; body: string };

export type SignaturesData = {
  signatures: Signature[];
  /** accountId (Google sub) → assigned signature id, or null. */
  assignments: Record<string, string | null>;
};

export const signaturesQueryKey = ["signatures"] as const;

async function fetchSignatures(): Promise<SignaturesData> {
  const res = await fetch("/api/signatures");
  if (!res.ok) return { signatures: [], assignments: {} };
  return (await res.json()) as SignaturesData;
}

export function useSignaturesQuery(enabled = true) {
  return useQuery({
    queryKey: signaturesQueryKey,
    queryFn: fetchSignatures,
    enabled,
    staleTime: 60_000,
  });
}
