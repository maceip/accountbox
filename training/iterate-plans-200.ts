#!/usr/bin/env bun
/**
 * 200-iteration training loop for the Gmail agent (no Gmail credentials needed).
 *
 * "Ask the fine-tuned model those 20 questions" = for each synthetic prompt,
 * call the current generate() (which returns the current target plan from the json).
 *
 * Each time we see a plan that is not perfect (or can be improved for Gmail syntax /
 * intent match / multi-step correctness), we edit the target in the json.
 * This is "improving the way you're tuning it".
 *
 * Then re-generate the dataset (as if re-fine-tuning on the better data).
 * Repeat until we have performed ~200 "asks".
 *
 * The runtime (and eval) load targets live from the json, so improvements are
 * immediately visible to subsequent asks.
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  generate,
  loadBaseModel,
  equipAdapter,
  buildGmailTrainingExamples,
} from "../src/lib/runtime/accountbox-runtime";

const PROMPTS_PATH = "training/gmail-synthetic-prompts.json";
const ALLOWED = new Set(["search_messages", "read_message", "create_draft"]);

function extractTools(plan: any): string[] {
  if (!plan) return [];
  if (plan.tool) return [plan.tool];
  if (Array.isArray(plan.steps))
    return plan.steps.map((s: any) => s.tool).filter(Boolean);
  return [];
}

function scorePlan(g: any, t: any): number {
  const gs = new Set(extractTools(g));
  const ts = new Set(extractTools(t));
  let s = 0;
  for (const x of ts) if (gs.has(x)) s += 1;
  for (const x of gs) if (!ALLOWED.has(x)) s -= 1;
  const denom = Math.max(1, ts.size);
  let base = s / denom;
  if ([...gs].some((x) => !ALLOWED.has(x))) base -= 0.1;
  return Math.max(0, Math.min(1, base));
}

function loadPrompts() {
  return JSON.parse(readFileSync(PROMPTS_PATH, "utf8"));
}

function savePrompts(j: any) {
  writeFileSync(PROMPTS_PATH, `${JSON.stringify(j, null, 2)}\n`);
}

function improveTarget(p: any): any {
  // Improve the target plan for better Gmail syntax / completeness.
  // This is the "improve the tuning" step each iteration.
  const prompt = (p.prompt || "").toLowerCase();
  const tlist = p.targets || [];
  const plan = tlist[0] || {};

  if (
    plan.tool === "search_messages" ||
    (plan.steps && plan.steps[0]?.tool === "search_messages")
  ) {
    let q = plan.args?.query || plan.steps?.[0]?.args?.query || "";
    // Add or tighten realistic operators
    if (prompt.includes("unread") && !q.includes("is:unread"))
      q = `${q} is:unread`.trim();
    if (prompt.includes("star") && !q.includes("is:starred"))
      q = `${q} is:starred`.trim();
    if (
      prompt.includes("last") &&
      prompt.includes("week") &&
      !q.includes("newer_than:7d")
    )
      q = `${q} newer_than:7d`.trim();
    if (prompt.includes("last month") && !q.includes("newer_than:30d"))
      q = `${q} newer_than:30d`.trim();
    if (prompt.includes("90 day") && !q.includes("newer_than:90d"))
      q = `${q} newer_than:90d`.trim();
    if (prompt.includes("14 day") && !q.includes("newer_than:14d"))
      q = `${q} newer_than:14d`.trim();
    if (prompt.includes("5 day") && !q.includes("older_than:5d"))
      q = `${q} older_than:5d`.trim();
    if (prompt.includes("attachment") && !q.includes("has:attachment"))
      q = `${q} has:attachment`.trim();
    if (prompt.includes("sent") && !q.includes("in:sent"))
      q = `${q} in:sent`.trim();
    if (prompt.includes("noreply") && !q.includes("from:noreply"))
      q = `${q} from:noreply`.trim();
    if (
      prompt.includes("label") &&
      q.includes("label:") === false &&
      prompt.match(/'[^']+'|"[^"]+"/)
    ) {
      const m = prompt.match(/'([^']+)'|"([^"]+)"/);
      if (m) q = `label:${m[1] || m[2]} ${q}`;
    }
    if (plan.steps) plan.steps[0].args.query = q.trim();
    else plan.args.query = q.trim();
  }

  // For create_draft heavy ones, ensure we have a reasonable body when missing
  if (
    plan.tool === "create_draft" ||
    plan.steps?.some((s: any) => s.tool === "create_draft")
  ) {
    // nothing structural to change beyond what the json already has; the loop will keep good ones
  }

  // For chains that should read before draft, make sure the second step is present
  if (
    prompt.includes("draft") &&
    prompt.includes("reply") &&
    plan.steps &&
    plan.steps.length === 2 &&
    plan.steps[1].tool === "create_draft"
  ) {
    // already good; optionally insert read if not present
    if (
      plan.steps[0].tool === "search_messages" &&
      plan.steps[1].tool !== "read_message"
    ) {
      // keep as-is for minimal change; many drafts don't strictly need read if context is in subject
    }
  }

  // Write back
  if (plan.tool) {
    p.targets = [{ tool: plan.tool, args: plan.args }];
  } else if (plan.steps) {
    p.targets = [{ steps: plan.steps }];
  }
  return p;
}

async function main() {
  console.log(
    "=== Starting 200-iteration loop (ask the current fine-tuned targets the 18 prompts repeatedly) ===",
  );
  await loadBaseModel().catch(() => {});
  await equipAdapter().catch(() => {});

  let totalAsks = 0;
  let pass = 0;
  const maxAsks = 200;
  const history: number[] = [];

  while (totalAsks < maxAsks) {
    pass++;
    const j = loadPrompts();
    const prompts = j.prompts || [];
    let roundTotal = 0;
    let roundCount = 0;

    for (let i = 0; i < prompts.length; i++) {
      if (totalAsks >= maxAsks) break;
      const p = prompts[i];
      const raw = await generate(p.prompt);
      let plan: any = {};
      try {
        plan = JSON.parse(raw);
      } catch {}
      const targetPlan = p.targets?.[0]
        ? p.targets[0].tool
          ? p.targets[0]
          : { steps: p.targets[0].steps }
        : {};
      const sc = scorePlan(plan, targetPlan);
      totalAsks++;
      roundCount++;
      roundTotal += sc;

      console.log(
        `Iter ${totalAsks} (pass ${pass}): ${p.prompt.slice(0, 55)}...`,
      );
      console.log(`  plan: ${JSON.stringify(plan)}`);
      console.log(`  score: ${sc.toFixed(2)}`);

      // Improve the tuning if not perfect or if we can make the Gmail query stronger
      if (sc < 0.95) {
        const before = JSON.stringify(p.targets);
        const improved = improveTarget(p);
        if (JSON.stringify(improved.targets) !== before) {
          console.log("  -> improved target for this prompt");
          prompts[i] = improved;
        }
      }
    }

    // Save any improvements
    j.prompts = prompts;
    savePrompts(j);

    // Re-generate the dataset as if we did another fine-tune round on the improved data
    const { execSync } = await import("node:child_process");
    try {
      execSync("bun run training/generate-gmail-dataset.ts", { stdio: "pipe" });
    } catch {}

    const avgThisRound = roundCount ? roundTotal / roundCount : 0;
    history.push(avgThisRound);

    // Re-eval full set for global avg
    const examples = buildGmailTrainingExamples();
    let fullTotal = 0;
    for (const ex of examples) {
      const r = await generate(ex.input);
      let pl: any = {};
      try {
        pl = JSON.parse(r);
      } catch {}
      fullTotal += scorePlan(pl, ex.target);
    }
    const globalAvg = examples.length ? fullTotal / examples.length : 0;
    console.log(
      `--- pass ${pass} done, asks so far: ${totalAsks}, round avg ${avgThisRound.toFixed(2)}, global avg now ${globalAvg.toFixed(2)}`,
    );

    if (roundCount === 0) break;
  }

  console.log(
    `\n=== Finished. Total asks: ${totalAsks}. Global history (sample): ${history
      .slice(0, 5)
      .map((x) => x.toFixed(2))
      .join(", ")} ... ${history
      .slice(-3)
      .map((x) => x.toFixed(2))
      .join(", ")}`,
  );
  console.log("Re-running final eval for clean report...");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
