/**
 * Adapter identity manifest — adapter.json served beside the weights.
 *
 * The adapter URL stays stable ("/adapters/gmail-agent"); IDENTITY lives in
 * this document: which skill, which version, which base model, and the sha256
 * of the byte-locked system prompt the fine-tune was trained against (B3).
 * Traces stamp the version so future curation knows which weights produced
 * each plan.
 *
 * Absence is tolerated (pre-manifest adapters equip fine with version null) —
 * but scripts/copy-adapter.ts refuses to STAGE an adapter without stamping
 * one, so anything shipped from here on carries identity.
 */

export type AdapterManifest = {
  skillId: string;
  version: string;
  baseModel?: string;
  systemPromptSha256?: string;
  trainedAt?: string;
  examples?: number;
};

/** Fetch `${adapterUrl}/adapter.json`. Null on 404 / invalid — never throws. */
export async function fetchAdapterManifest(
  adapterUrl: string,
): Promise<AdapterManifest | null> {
  try {
    const res = await fetch(`${adapterUrl.replace(/\/$/, "")}/adapter.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<AdapterManifest> | null;
    if (
      !data ||
      typeof data.skillId !== "string" ||
      typeof data.version !== "string"
    ) {
      return null;
    }
    return data as AdapterManifest;
  } catch {
    return null;
  }
}
