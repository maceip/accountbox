import { useState } from "react";

import { FlaskConical, Rocket } from "lucide-react";

import { CommandCard } from "./command-card";
import { LoadoutBody } from "./loadout-pane";
import { LoadoutSlots, type LoadoutSlot } from "./loadout-slots";
import { WbPageHeader, WbPanel, WbSectionLabel, WbTabs, WbCanvas } from "./workbench-surfaces";
import { StatusChip } from "./status-chip";
import { StitchDesignBar } from "./stitch-design-bar";
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

const PLACEHOLDER_SLOTS: LoadoutSlot[] = [
  { id: "base", label: "Base model", detail: "Qwen base", state: "available" },
  { id: "adapter", label: "Adapter", detail: "gmail-agent", state: "empty" },
  { id: "dataset", label: "Dataset", detail: "—", state: "empty" },
  { id: "policy", label: "Policy", detail: "create_draft", state: "available" },
  { id: "source", label: "Source", detail: "Gmail", state: "blocked" },
  { id: "eval", label: "Eval suite", detail: "Not run", state: "empty" },
  { id: "runtime", label: "Runtime", detail: "WebGPU", state: "empty" },
];

export function SkillsWorkbench() {
  const [tab, setTab] = useState<string>("loadout");
  const skill = SKILLS[0];

  return (
    <WbCanvas className="h-full">
      <WbTabs tabs={SKILL_TABS} active={tab} onChange={setTab} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <WbPageHeader
          kicker="skills"
          title={`${skill.label} Agent`}
          description="Equip, train, and run the Gmail skill cartridge."
        />

        {tab === "loadout" && (
          <>
            <section className="mb-4">
              <WbSectionLabel className="mb-2">loadout strip</WbSectionLabel>
              <LoadoutSlots slots={PLACEHOLDER_SLOTS} />
            </section>
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
            <WbPanel className="p-3">
              <LoadoutBody />
            </WbPanel>
          </>
        )}

        {tab !== "loadout" && (
          <WbPanel className="p-4">
            <StatusChip kind="info">{tab} — wiring in progress</StatusChip>
            <p className="mt-2 text-[13px] text-ink-subtle">
              This tab will connect to real {tab} flows. No fake equipped or
              eval-passing state is shown here.
            </p>
          </WbPanel>
        )}
      </div>
      <StitchDesignBar designId="skills" className="mx-4 mb-4 md:mx-6" />
    </WbCanvas>
  );
}
