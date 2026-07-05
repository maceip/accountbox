#!/usr/bin/env bun
/**
 * Mechanical proof for the two-cartridge boundary.
 *
 * This does not claim GitHub has trained weights. It proves the opposite:
 * Gmail is the trained/equippable cartridge, GitHub is present as the second
 * source/tool contract, and its first safe action is local-only.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isValidToolPlan } from "@/lib/runtime/plan-parse";
import { SKILLS, getSkill } from "@/lib/skills";
import { GMAIL_SKILL } from "@/lib/skills/gmail/skill";
import { GITHUB_SKILL } from "@/lib/skills/github/skill";

const ROOT = process.cwd();
let ok = true;

function check(name: string, cond: boolean, failMsg?: string) {
  if (cond) {
    console.log(`✓ ${name}`);
  } else {
    console.log(`✗ ${name}${failMsg ? ` — ${failMsg}` : ""}`);
    ok = false;
  }
}

console.log("=== Prove: two-cartridge AccountBox boundary ===\n");

check(
  "built-ins are Gmail + GitHub",
  SKILLS.map((s) => s.id).join(",") === "gmail-agent,github-agent",
);
check("Gmail resolves", getSkill("gmail-agent") === GMAIL_SKILL);
check("GitHub resolves", getSkill("github-agent") === GITHUB_SKILL);

check("Gmail is trained", GMAIL_SKILL.availability === "trained");
check("Gmail has adapterUrl", !!GMAIL_SKILL.adapterUrl);
check(
  "GitHub is not presented as trained",
  GITHUB_SKILL.availability !== "trained",
);
check("GitHub has no adapterUrl yet", GITHUB_SKILL.adapterUrl === undefined);

check(
  "Gmail source id is generic source registry id",
  GMAIL_SKILL.sourceId === "gmail",
);
check(
  "GitHub source id is generic source registry id",
  GITHUB_SKILL.sourceId === "github",
);

check(
  "Gmail first write is create_draft",
  GMAIL_SKILL.safeAction.tool === "create_draft" &&
    GMAIL_SKILL.safeAction.effect === "provider-draft",
);
check(
  "GitHub first write is local-only draft",
  GITHUB_SKILL.safeAction.tool === "draft_github_reply" &&
    GITHUB_SKILL.safeAction.effect === "local-only",
);
check(
  "GitHub cannot post comments",
  !GITHUB_SKILL.allowedTools.includes("post_comment") &&
    !GITHUB_SKILL.allowedTools.includes("create_issue"),
);

check(
  "GitHub local draft validates",
  isValidToolPlan(
    {
      tool: "draft_github_reply",
      args: { repo: "maceip/accountbox", num: 42, body: "Local proposal." },
    },
    GITHUB_SKILL.allowedTools,
  ),
);
check(
  "GitHub post_comment fails closed",
  !isValidToolPlan(
    {
      tool: "post_comment",
      args: { repo: "maceip/accountbox", num: 42, body: "Post this." },
    },
    GITHUB_SKILL.allowedTools,
  ),
);

const appShell = readFileSync(join(ROOT, "src/routes/_app.tsx"), "utf8");
check("Incoming opens by default", appShell.includes('"incoming"'));

const skillEquip = readFileSync(
  join(ROOT, "src/components/workbench/skill-equip.tsx"),
  "utf8",
);
check(
  "untrained cartridges expose training sources",
  skillEquip.includes("data-skill-training-sources"),
);
check(
  "untrained cartridges expose eval seeds",
  skillEquip.includes("data-skill-eval-cases"),
);

const opfs = readFileSync(join(ROOT, "src/lib/db/opfs.ts"), "utf8");
check(
  "storage shim does not claim SQLite",
  opfs.includes("This is NOT SQLite"),
);

console.log(`\n${ok ? "PASS (two-cartridge boundary)" : "FAIL — see above"}`);
process.exit(ok ? 0 : 1);
