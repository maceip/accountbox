import { useEffect, useState } from "react";
import { GripVerticalIcon, SwordsIcon, XIcon } from "lucide-react";

import { useTileDrag } from "@/components/tile-board";
import { Hint } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SKILLS } from "@/lib/skills";
import type { AppSkill } from "@/lib/runtime/app-skill";
import { getSkillRuntime } from "@/lib/runtime/skill-runtimes";
import {
  getChatStatus,
  subscribeChatStatus,
  CHAT_MODEL_LABEL,
  type ChatStatus,
} from "@/lib/runtime/chat-runtime";
import { SkillEquip, useSkillRuntimeStatus } from "./skill-equip";

/**
 * The loadout — the workbench's skill inventory. One equipped slot (the GPU
 * holds exactly one model at a time; this is mechanically true, not a
 * metaphor), a shelf of trained skills, and the add-a-skill entry.
 *
 * States are honest: a skill is "equipped" only when its weights are resident,
 * "streaming" while they load, otherwise just trained-and-equippable. Nothing
 * here fakes progression.
 */

function useChatStatus(): ChatStatus {
  const [status, setStatus] = useState<ChatStatus>(getChatStatus());
  useEffect(() => subscribeChatStatus(setStatus), []);
  return status;
}

/** One line describing what currently holds the GPU slot. */
function EquippedSlotRow({
  equippedSkill,
}: {
  equippedSkill: AppSkill | null;
}) {
  const chat = useChatStatus();

  let label: string;
  let live = false;
  if (equippedSkill) {
    label = `${equippedSkill.label} skill`;
    live = true;
  } else if (chat.state === "ready") {
    label = `Local model (${CHAT_MODEL_LABEL})`;
    live = true;
  } else if (chat.state === "loading") {
    label = `Local model (${CHAT_MODEL_LABEL}) · streaming`;
  } else {
    label = "empty — equip a skill below";
  }

  return (
    <div
      className="flex items-center gap-2 rounded border border-hairline bg-surface-1 px-3 py-2"
      data-loadout-slot={
        equippedSkill
          ? equippedSkill.id
          : chat.state === "ready"
            ? "chat"
            : "empty"
      }
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          live ? "bg-success" : "border border-hairline",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] tracking-wide text-ink-muted uppercase">
          equipped
        </p>
        <p className="truncate text-[13px] font-medium">{label}</p>
      </div>
    </div>
  );
}

function SkillShelfCard({
  skill,
  open,
  onToggle,
}: {
  skill: AppSkill;
  open: boolean;
  onToggle: () => void;
}) {
  const status = useSkillRuntimeStatus(skill);
  const equipped = status.state === "equipped";
  const streaming = status.state === "loading";
  const trainable = skill.availability === "needs-training";
  const shelfState = equipped
    ? "equipped"
    : streaming
      ? "streaming"
      : trainable
        ? "needs-training"
        : "trained";

  return (
    <div
      className="rounded border border-hairline bg-surface-1 p-3"
      data-loadout-skill={skill.id}
      data-skill-state={shelfState}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-[14px] font-semibold">{skill.label}</span>
          <p className="mt-0.5 text-[12px] text-ink-subtle">
            {skill.description}
          </p>
          <p className="mt-1 font-mono text-[10px] text-ink-muted">
            {skill.tools.map((t) => t.name).join(" · ")}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px]",
            equipped
              ? "border-success/40 text-success"
              : streaming
                ? "border-primary/40 text-primary"
                : "border-hairline text-ink-muted",
          )}
        >
          {shelfState}
        </span>
        {!open && (
          <Button
            size="sm"
            variant={equipped ? "outline" : "default"}
            onClick={onToggle}
          >
            {equipped ? "Test" : trainable ? "Inspect" : "Equip"}
          </Button>
        )}
        {open && (
          <button
            type="button"
            onClick={onToggle}
            className="cursor-pointer font-mono text-[11px] text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            collapse
          </button>
        )}
      </div>
      {/* Mounting SkillEquip is the equip action: it claims the GPU slot and
          streams the weights (idempotent when already equipped). */}
      {open && <SkillEquip skill={skill} done />}
    </div>
  );
}

function findEquippedSkill(): AppSkill | null {
  return (
    SKILLS.find(
      (s) => getSkillRuntime(s).getAgentStatus().state === "equipped",
    ) ?? null
  );
}

/** Which skill's weights are resident right now — derived from the runtimes
 *  themselves, not tracked here, so the slot row can't drift from reality. */
function useEquippedSkill(): AppSkill | null {
  const [equipped, setEquipped] = useState<AppSkill | null>(findEquippedSkill);
  useEffect(() => {
    const unsubs = SKILLS.map((skill) =>
      getSkillRuntime(skill).subscribeAgentStatus(() =>
        setEquipped(findEquippedSkill()),
      ),
    );
    return () => {
      for (const u of unsubs) u();
    };
  }, []);
  return equipped;
}

export function LoadoutBody() {
  const equippedSkill = useEquippedSkill();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3" data-loadout>
      <EquippedSlotRow equippedSkill={equippedSkill} />
      <p className="font-mono text-[10px] tracking-wide text-ink-muted uppercase">
        skills
      </p>
      {SKILLS.map((skill) => (
        <SkillShelfCard
          key={skill.id}
          skill={skill}
          open={openId === skill.id}
          onToggle={() =>
            setOpenId((cur) => (cur === skill.id ? null : skill.id))
          }
        />
      ))}
      <div
        className="rounded border border-dashed border-hairline p-3"
        data-loadout-add
      >
        <p className="text-[12px] text-ink-subtle">
          <strong className="text-ink">Add a skill.</strong> New apps start as
          tool contracts, then become equippable when a real adapter is trained.
          Each trained skill uses the same GPU slot.
        </p>
      </div>
    </div>
  );
}

/** The loadout as a board tile — draggable/closable like any pane. */
export function LoadoutPane({
  paneId,
  onClose,
}: {
  paneId: string;
  onClose: () => void;
}) {
  const beginHeaderDrag = useTileDrag();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        onPointerDown={(event) => beginHeaderDrag(event, paneId)}
        className="flex h-9 shrink-0 items-center gap-2 border-b px-2.5 select-none md:cursor-grab md:touch-none md:active:cursor-grabbing"
      >
        <GripVerticalIcon className="hidden size-3.5 shrink-0 text-muted-foreground/70 md:block" />
        <SwordsIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
          Loadout
        </span>
        <Hint label="Close panel">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </Hint>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <LoadoutBody />
      </div>
    </div>
  );
}
