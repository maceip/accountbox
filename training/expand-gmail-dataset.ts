#!/usr/bin/env bun
/**
 * Deterministic template expansion for the Gmail-agent training set.
 *
 * Why: the 19-row set over-represented draft-ending plans, and the measured
 * failure mode of the trained adapter was appending create_draft to pure
 * search/list tasks (browser gate: 4/18 valid, over-drafting). This generates
 * a BALANCED corpus (search-heavy, drafts only when the intent asks for one)
 * with varied phrasing, realistic Gmail query syntax, and the exact plan
 * schema the runtime parses ({tool,args} | {steps:[...]}).
 *
 * Deterministic (seeded PRNG) => reproducible, reviewable, no hidden state.
 * Output: training/expanded-prompts.json  (merged by generate-gmail-dataset.ts)
 *
 *   bun run training/expand-gmail-dataset.ts
 */
import { writeFileSync } from "node:fs";

// Mulberry32 — tiny seeded PRNG, deterministic across runs.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260702);
const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)];

const SENDERS = ["my manager", "Sarah", "the finance team", "legal", "the design lead", "recruiting", "IT support", "the vendor", "Alex", "the CEO", "billing", "the security team"];
const SENDER_QUERY: Record<string, string> = {
  "my manager": "from:manager", Sarah: "from:sarah", "the finance team": "from:finance",
  legal: "from:legal", "the design lead": "from:design", recruiting: "from:recruiting",
  "IT support": "from:it", "the vendor": "from:vendor", Alex: "from:alex",
  "the CEO": "from:ceo", billing: "from:billing", "the security team": "from:security",
};
const TOPICS = ["the product launch", "Q3 planning", "the offsite", "invoice approval", "the incident postmortem", "contract renewal", "the design review", "onboarding", "the roadmap", "budget cuts", "the migration", "performance reviews"];
const TOPIC_KW: Record<string, string> = {
  "the product launch": '"product launch"', "Q3 planning": '"Q3 planning"', "the offsite": "offsite",
  "invoice approval": "invoice", "the incident postmortem": "postmortem", "contract renewal": '"contract renewal"',
  "the design review": '"design review"', onboarding: "onboarding", "the roadmap": "roadmap",
  "budget cuts": "budget", "the migration": "migration", "performance reviews": '"performance review"',
};
const WINDOWS: Array<[string, string]> = [["this week", "newer_than:7d"], ["today", "newer_than:1d"], ["the last two weeks", "newer_than:14d"], ["this month", "newer_than:30d"], ["the last 90 days", "newer_than:90d"]];
const LABELS = ["urgent", "project-x", "waiting-for-reply", "clients", "receipts", "travel"];

type Target = { tool: string; args: Record<string, unknown> } | { steps: Array<{ tool: string; args: Record<string, unknown> }> };
type Row = { id: string; prompt: string; expected_tools: string[]; targets: Target[] };

const rows: Row[] = [];
let n = 0;
function add(prompt: string, target: Target, expected: string[]) {
  rows.push({ id: `x${String(++n).padStart(3, "0")}`, prompt, expected_tools: expected, targets: [target] });
}

// ---- search-only (the class the old adapter over-drafted on) ----
for (let i = 0; i < 46; i++) {
  const s = pick(SENDERS), t = pick(TOPICS), [wText, wQ] = pick(WINDOWS), label = pick(LABELS);
  const variant = i % 8;
  if (variant === 0)
    add(`Find all unread emails from ${s} ${wText} that mention ${t}.`,
      { tool: "search_messages", args: { query: `${SENDER_QUERY[s]} ${TOPIC_KW[t]} is:unread ${wQ}` } }, ["search_messages"]);
  else if (variant === 1)
    add(`Show me everything with the '${label}' label from ${wText}.`,
      { tool: "search_messages", args: { query: `label:${label} ${wQ}` } }, ["search_messages"]);
  else if (variant === 2)
    add(`List my starred messages about ${t}.`,
      { tool: "search_messages", args: { query: `is:starred ${TOPIC_KW[t]}` } }, ["search_messages"]);
  else if (variant === 3)
    add(`Search for attachments related to ${t} from ${wText}.`,
      { tool: "search_messages", args: { query: `has:attachment ${TOPIC_KW[t]} ${wQ}` } }, ["search_messages"]);
  else if (variant === 4)
    add(`What did ${s} send me ${wText}?`,
      { tool: "search_messages", args: { query: `${SENDER_QUERY[s]} ${wQ}` } }, ["search_messages"]);
  else if (variant === 5)
    add(`Do I have any unread mail from ${s}?`,
      { tool: "search_messages", args: { query: `${SENDER_QUERY[s]} is:unread` } }, ["search_messages"]);
  else if (variant === 6)
    add(`Find messages in my sent mail about ${t}.`,
      { tool: "search_messages", args: { query: `in:sent ${TOPIC_KW[t]}` } }, ["search_messages"]);
  else
    add(`List emails mentioning ${t} or ${pick(TOPICS)} from ${wText}.`,
      { tool: "search_messages", args: { query: `(${TOPIC_KW[t]} OR ${TOPIC_KW[pick(TOPICS)]}) ${wQ}` } }, ["search_messages"]);
}

// ---- search -> read (open the most relevant result) ----
for (let i = 0; i < 18; i++) {
  const s = pick(SENDERS), t = pick(TOPICS), [wText, wQ] = pick(WINDOWS);
  const q = i % 2 === 0 ? `${SENDER_QUERY[s]} ${TOPIC_KW[t]}` : `${TOPIC_KW[t]} ${wQ}`;
  const phr = i % 3;
  const prompt =
    phr === 0 ? `Open the latest email from ${s} about ${t} and summarize it.`
    : phr === 1 ? `Read the most recent message about ${t} from ${wText} and tell me the action items.`
    : `Pull up the thread about ${t} and tell me where it stands.`;
  add(prompt, {
    steps: [
      { tool: "search_messages", args: { query: q } },
      { tool: "read_message", args: { id: "<latest-from-search>" } },
    ],
  }, ["search_messages", "read_message"]);
}

// ---- search -> draft (reply flows: intent explicitly asks for a draft) ----
for (let i = 0; i < 14; i++) {
  const s = pick(SENDERS), t = pick(TOPICS);
  const to = `${(SENDER_QUERY[s] || "from:team").split(":")[1]}@company.com`;
  const prompt = i % 2 === 0
    ? `Find the last email from ${s} about ${t} and draft a reply saying I'll review it by Friday.`
    : `Draft a follow-up on the ${t} thread from ${s} asking for the latest status.`;
  add(prompt, {
    steps: [
      { tool: "search_messages", args: { query: `${SENDER_QUERY[s]} ${TOPIC_KW[t]}` } },
      { tool: "create_draft", args: { to, subject: `Re: ${t}`, body: i % 2 === 0 ? "Thanks — I'll review this and get back to you by Friday." : `Quick follow-up on ${t} — any update on the latest status?` } },
    ],
  }, ["search_messages", "create_draft"]);
}

// ---- draft-only (no lookup needed) ----
for (let i = 0; i < 8; i++) {
  const t = pick(TOPICS);
  const aliases = ["team@company.com", "all-hands@company.com", "eng@company.com", "cs@company.com"];
  const to = pick(aliases);
  add(`Draft a short note to ${to.split("@")[0]} saying the ${t} work is on track.`,
    { tool: "create_draft", args: { to, subject: `${t} update`, body: `Quick update: the ${t} work is on track. More details to follow.` } },
    ["create_draft"]);
}

const out = { description: "Deterministic balanced expansion (bun run training/expand-gmail-dataset.ts). Search-heavy on purpose: the measured failure of the 19-row adapter was appending create_draft to search-only intents.", prompts: rows };
writeFileSync("training/expanded-prompts.json", `${JSON.stringify(out, null, 2)}\n`);
const dist: Record<string, number> = {};
for (const r of rows) { const k = r.expected_tools.join("+"); dist[k] = (dist[k] || 0) + 1; }
console.log(`wrote training/expanded-prompts.json — ${rows.length} rows`, dist);
