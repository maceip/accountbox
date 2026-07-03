/**
 * One runtime instance per skill, shared app-wide. The journey's skill step,
 * the Gmail wrapper module, and any future callers all get the SAME instance
 * for a given skill — two instances would race the engine slot and stream the
 * multi-GB weights twice.
 */

import type { AppSkill } from './app-skill';
import { createAgentRuntime, type AgentRuntime } from './agent-runtime';

const runtimes = new Map<string, AgentRuntime>();

export function getSkillRuntime(skill: AppSkill): AgentRuntime {
  let rt = runtimes.get(skill.id);
  if (!rt) {
    rt = createAgentRuntime(skill);
    runtimes.set(skill.id, rt);
  }
  return rt;
}
