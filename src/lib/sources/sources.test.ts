import { describe, expect, test } from "bun:test";
import { SOURCES, SOURCE_PANELS, getSource, getSourceForSkill } from "./index";
import { SKILLS } from "@/lib/skills";

describe("source registry", () => {
  test("source ids are unique", () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("view ids are globally unique (they key sidebar + settings toggles)", () => {
    const ids = SOURCES.flatMap((s) => s.views.map((v) => v.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("panel keys are unique (they key the board's pane registry)", () => {
    const keys = SOURCE_PANELS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("soon sources contribute no live panels", () => {
    for (const panel of SOURCE_PANELS) {
      expect(panel.source.soon ?? false).toBe(false);
    }
  });

  test("gmail is a connected source with a skill and the fixed inbox view", () => {
    const gmail = getSource("gmail");
    expect(gmail).not.toBeNull();
    expect(gmail?.connection?.providerId).toBe("google");
    expect(gmail?.skill?.id).toBe("gmail-agent");
    expect(gmail?.views.some((v) => v.id === "inbox" && v.fixed)).toBe(true);
  });

  test("every registered skill maps back to a source (journey connect target)", () => {
    for (const skill of SKILLS) {
      const source = getSourceForSkill(skill.id);
      expect(source).not.toBeNull();
      expect(source?.connection).toBeDefined();
    }
  });

  test("agent panels (chat + loadout) are registered, unconnected", () => {
    const agent = getSource("agent");
    expect(agent?.connection).toBeUndefined();
    const keys = SOURCE_PANELS.filter((p) => p.source.id === "agent").map(
      (p) => p.key,
    );
    expect(keys).toContain("local-agent");
    expect(keys).toContain("loadout");
  });
});
