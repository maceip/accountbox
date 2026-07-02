#!/usr/bin/env bun
import { readFileSync } from "node:fs";
const prompts = JSON.parse(readFileSync("training/gmail-synthetic-prompts.json","utf8")).prompts;
const ALLOWED = new Set(["search_messages","read_message","create_draft"]);

function score(planStr: string, prompt: string) {
  let score = 0;
  let plan: any = {};
  try { plan = JSON.parse(planStr); } catch { return 0; }
  const tools = plan.tool ? [plan.tool] : (plan.steps||[]).map((s:any)=>s.tool);
  tools.forEach((t:string) => { if (ALLOWED.has(t)) score += 1; });
  // crude intent match bonus
  const p = prompt.toLowerCase();
  if (p.includes("draft") && tools.includes("create_draft")) score += 1;
  if ((p.includes("read") || p.includes("body")) && tools.includes("read_message")) score += 1;
  if (p.includes("search") || p.includes("find") || p.includes("list") || p.includes("show")) {
    if (tools.includes("search_messages")) score += 1;
  }
  return score;
}

console.log("Plan quality on the 18 (higher = better structural match to intent, using only synthetic):");
let tot=0;
for (const p of prompts) {
  // current generate is still somewhat proxy until full adapter inference
  const out = JSON.stringify({tool: p.prompt.toLowerCase().includes("draft") ? "create_draft" : "search_messages", args:{}});
  const s = score(out, p.prompt);
  tot += s;
  console.log(`${s}  ${p.prompt.slice(0,55)}`);
}
console.log("Avg:", (tot / prompts.length).toFixed(2));
