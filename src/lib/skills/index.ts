/**
 * SKILLS — the manifest list. Client-safe: manifests are pure data (no server
 * imports), read by the journey skill picker, the agent runtime, and the
 * plan-validation path on both sides.
 *
 * Gmail is simply the first entry. The picker, runtime, and executor registry
 * are already N-skill shaped — adding a skill is one manifest here, one
 * executor module in executor.server.ts, and a trained adapter.
 */

import type { AppSkill } from "@/lib/runtime/app-skill";
import { GMAIL_SKILL } from "./gmail/skill";

export const SKILLS: readonly AppSkill[] = [GMAIL_SKILL];

export function getSkill(skillId: string): AppSkill | null {
  return SKILLS.find((s) => s.id === skillId) ?? null;
}
