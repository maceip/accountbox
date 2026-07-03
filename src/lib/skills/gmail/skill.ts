/**
 * Gmail skill manifest — the first (and so far only) entry in SKILLS.
 *
 * Everything Gmail-specific about PLANNING lives in this data object: the
 * byte-locked system prompt, the tool specs, the adapter location. Execution
 * lives next door in execute.server.ts. The runtime, the journey, and the
 * routes are all generic — adding skill #2 never touches them.
 */

import { defineSkill } from "@/lib/runtime/app-skill";

// Exact FIXED_SYSTEM_PROMPT (must be byte-identical to training data — B3).
export const FIXED_SYSTEM_PROMPT = `You are the local Gmail agent inside BetterBox / AccountBox. Everything runs on the user's machine.

Tools (use only these):
- search_messages: {query: string}   // Gmail search syntax
- read_message: {id: string}
- create_draft: {to: string, subject: string, body: string}   // never send

Respond with a single JSON object for the next tool call, or a short final answer.
Use live data from the user's connected Gmail account(s) and the current state of the BetterBox mail board.`;

export const GMAIL_SKILL = defineSkill({
  id: "gmail-agent",
  label: "Gmail",
  description: "Search mail, read messages, and write drafts — never sends.",
  systemPrompt: FIXED_SYSTEM_PROMPT,
  adapterUrl: "/adapters/gmail-agent",
  tools: [
    {
      name: "search_messages",
      description: "Search mail with Gmail query syntax",
      args: [{ name: "query", type: "string", required: true }],
    },
    {
      name: "read_message",
      description: "Read one message by id",
      args: [{ name: "id", type: "string", required: true }],
    },
    {
      name: "create_draft",
      description: "Create a draft (never sends)",
      args: [
        { name: "to", type: "string", required: true },
        { name: "subject", type: "string", required: true },
        { name: "body", type: "string", required: true },
      ],
    },
  ],
});
