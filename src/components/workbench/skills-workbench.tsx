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

const PLACEHOLDER_SLOTS: LoadoutSlot[] = [
  { id: "base", label: "Base", detail: "Qwen base", state: "available" },
  { id: "adapter", label: "Adapter", detail: "gmail-agent", state: "empty" },
  { id: "policy", label: "Policy", detail: "create_draft", state: "available" },
  { id: "dataset", label: "Dataset", detail: "—", state: "empty" },
  { id: "source", label: "Source", detail: "Cold", state: "blocked" },
  { id: "eval", label: "Eval", detail: "Not run", state: "empty" },
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
            <LoadoutSlots
              slots={PLACEHOLDER_SLOTS}
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
