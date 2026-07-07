import { useState } from "react";

import { FlaskConical, Rocket } from "lucide-react";

import { CommandCard } from "./command-card";
import { LoadoutBody } from "./loadout-pane";
import { LoadoutSlots, type LoadoutSlot } from "./loadout-slots";
import {
  WbCanvas,
  WbPageHeader,
  WbPanel,
  WbSection,
  WbTabs,
} from "./workbench-surfaces";
import { StatusChip } from "./status-chip";
import { SKILLS } from "@/lib/skills";

const SKILL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "loadout", label: "Loadout" },
  { id: "data", label: "Data" },
  { id: "train", label: "Train" },
  { id: "evaluate", label: "Evaluate" },
  { id: "equip", label: "Equip" },
  { id: "run", label: "Run" },
] as const;

/** Honest cold-state slots; FULL SPEC lines come from the skill manifest. */
function skillSlots(skill: (typeof SKILLS)[number]): LoadoutSlot[] {
  return [
    {
      id: "base",
      label: "Base",
      detail: "Qwen base",
      state: "available",
      spec: ["weights not resident", "webgpu · runs on this device"],
    },
    {
      id: "adapter",
      label: "Adapter",
      detail: skill.id,
      state: "empty",
      spec: [skill.adapterUrl ?? "no adapter shipped", skill.availability],
    },
    {
      id: "policy",
      label: "Policy",
      detail: skill.safeAction.tool ?? "read-only",
      state: "available",
      spec: [
        `${skill.allowedTools.length} tools whitelisted`,
        `write: ${skill.safeAction.effect}`,
      ],
    },
    {
      id: "dataset",
      label: "Dataset",
      detail: "—",
      state: "empty",
      spec: ["no local dataset", `sources: ${skill.trainingSources.join(" ")}`],
    },
    {
      id: "source",
      label: "Source",
      detail: "Cold",
      state: "blocked",
      spec: [skill.sourceId, "live fetch — never persisted"],
    },
    {
      id: "eval",
      label: "Eval",
      detail: "Not run",
      state: "empty",
      spec: [
        `${skill.evalCases.length} seed cases`,
        "no pass recorded on this device",
      ],
    },
  ];
}

export function SkillsWorkbench() {
  const [tab, setTab] = useState<string>("loadout");
  // Every registered cartridge gets a card here; selection defaults to the
  // first (Gmail today) but nothing below is skill-specific.
  const [skillId, setSkillId] = useState<string>(SKILLS[0].id);
  const skill = SKILLS.find((s) => s.id === skillId) ?? SKILLS[0];

  return (
    <WbCanvas className="h-full">
      <WbTabs tabs={SKILL_TABS} active={tab} onChange={setTab} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <WbPageHeader
          kicker="skills"
          title={`${skill.label} Agent`}
          description={`Equip, train, and run the ${skill.label} skill cartridge.`}
        />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {SKILLS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSkillId(s.id)}
              className="cursor-pointer"
            >
              <StatusChip kind={s.id === skill.id ? "command" : "info"}>
                {s.label}
                {s.availability === "needs-training" ? " · untrained" : ""}
              </StatusChip>
            </button>
          ))}
        </div>

        {tab === "loadout" && (
          <>
            <LoadoutSlots
              slots={skillSlots(skill)}
              className="mb-4"
              sectionLabel="skill loadout"
            />
            <CommandCard
              className="mb-4"
              actions={[
                {
                  id: "equip",
                  label: "Equip",
                  icon: Rocket,
                  status: "command",
                  onPress: () => {},
                },
                {
                  id: "train",
                  label: "Train",
                  icon: FlaskConical,
                  status: "warning",
                  onPress: () => {},
                  disabled: true,
                  disabledReason: "Start from Training Bay when wired",
                },
              ]}
            />
            <WbSection label="loadout detail">
              <WbPanel>
                <LoadoutBody />
              </WbPanel>
            </WbSection>
          </>
        )}

        {tab !== "loadout" && (
          <WbSection label={tab}>
            <StatusChip kind="info">{tab} — wiring in progress</StatusChip>
            <p className="mt-2 text-[13px] text-ink-subtle">
              This tab will connect to real {tab} flows. No fake equipped or
              eval-passing state is shown here.
            </p>
          </WbSection>
        )}
      </div>
    </WbCanvas>
  );
}
