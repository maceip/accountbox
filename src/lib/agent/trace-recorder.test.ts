import { describe, expect, test } from "bun:test";
import { defineSkill } from "@/lib/runtime/app-skill";
import {
  buildTrace,
  isColdPlan,
  migrateLegacyTraces,
  selectPruneIds,
  sha256Hex,
  MAX_TRACES,
} from "./trace-recorder";

const SKILL = defineSkill({
  id: "gmail-agent",
  label: "Gmail",
  description: "test skill",
  systemPrompt: "You are the local Gmail agent.",
  tools: [
    {
      name: "search_messages",
      description: "search",
      args: [{ name: "query", type: "string", required: true }],
    },
  ],
  adapterUrl: "/adapters/gmail-agent",
});

describe("trace contract v1", () => {
  test("buildTrace carries full provenance", () => {
    const now = new Date("2026-07-03T12:00:00Z");
    const t = buildTrace(
      {
        skill: SKILL,
        prompt: "find unread",
        plan: { tool: "search_messages", args: { query: "is:unread" } },
        context: "chat",
        adapterVersion: "v1",
      },
      "abc123",
      now,
    );
    expect(t.v).toBe(1);
    expect(t.skillId).toBe("gmail-agent");
    expect(t.promptSha256).toBe("abc123");
    expect(t.adapter).toEqual({ url: "/adapters/gmail-agent", version: "v1" });
    expect(t.context).toBe("chat");
    expect(t.at).toBe("2026-07-03T12:00:00.000Z");
    expect(t.execution).toBeNull();
    expect(t.id.startsWith("trace-")).toBe(true);
  });

  test("adapter version defaults to null (pre-manifest adapters)", () => {
    const t = buildTrace(
      {
        skill: SKILL,
        prompt: "p",
        plan: { tool: "search_messages", args: {} },
        context: "test",
      },
      "h",
    );
    expect(t.adapter.version).toBeNull();
  });

  test("cold sentinels are detected — never training data", () => {
    expect(
      isColdPlan({ tool: "search_messages", args: {}, __cold: true }),
    ).toBe(true);
    expect(isColdPlan({ tool: "search_messages", args: {} })).toBe(false);
    expect(isColdPlan({ steps: [{ tool: "search_messages", args: {} }] })).toBe(
      false,
    );
    expect(isColdPlan(null)).toBe(false);
    expect(isColdPlan("junk")).toBe(false);
  });
});

describe("pruning", () => {
  test("under cap deletes nothing", () => {
    const traces = [
      { id: "a", at: "2026-01-01T00:00:00Z" },
      { id: "b", at: "2026-01-02T00:00:00Z" },
    ];
    expect(selectPruneIds(traces, 5)).toEqual([]);
  });

  test("over cap deletes oldest first", () => {
    const traces = [
      { id: "newest", at: "2026-01-03T00:00:00Z" },
      { id: "oldest", at: "2026-01-01T00:00:00Z" },
      { id: "middle", at: "2026-01-02T00:00:00Z" },
    ];
    expect(selectPruneIds(traces, 2)).toEqual(["oldest"]);
    expect(selectPruneIds(traces, 1)).toEqual(["oldest", "middle"]);
  });

  test("default cap is the documented maximum", () => {
    const traces = Array.from({ length: MAX_TRACES + 3 }, (_, i) => ({
      id: `t${i}`,
      at: new Date(i * 1000).toISOString(),
    }));
    expect(selectPruneIds(traces)).toEqual(["t0", "t1", "t2"]);
  });
});

describe("legacy localStorage migration", () => {
  test("single tool call becomes a single-tool plan with honest null provenance", () => {
    const legacy = JSON.stringify([
      {
        id: "trace-1",
        prompt: "find invoices",
        tool_calls: [{ name: "search_messages", args: { query: "invoice" } }],
        timestamp: "2026-06-01T00:00:00.000Z",
      },
    ]);
    const out = migrateLegacyTraces(legacy);
    expect(out.length).toBe(1);
    expect(out[0].v).toBe(1);
    expect(out[0].skillId).toBe("gmail-agent");
    expect(out[0].promptSha256).toBeNull();
    expect(out[0].adapter.version).toBeNull();
    expect(out[0].plan).toEqual({
      tool: "search_messages",
      args: { query: "invoice" },
    });
    expect(out[0].execution).toBeNull();
  });

  test("multi tool calls become a steps plan", () => {
    const legacy = JSON.stringify([
      {
        prompt: "search then draft",
        tool_calls: [
          { name: "search_messages", args: { query: "q" } },
          { name: "create_draft", args: { to: "a@b.c" } },
        ],
      },
    ]);
    const out = migrateLegacyTraces(legacy);
    expect(out[0].plan).toEqual({
      steps: [
        { tool: "search_messages", args: { query: "q" } },
        { tool: "create_draft", args: { to: "a@b.c" } },
      ],
    });
  });

  test("junk entries and invalid JSON are dropped, not repaired", () => {
    expect(migrateLegacyTraces("not json")).toEqual([]);
    expect(migrateLegacyTraces('{"an":"object"}')).toEqual([]);
    const mixed = JSON.stringify([
      { prompt: "no calls", tool_calls: [] },
      { tool_calls: [{ name: "x", args: {} }] }, // no prompt
      { prompt: "ok", tool_calls: [{ name: "search_messages", args: {} }] },
    ]);
    expect(migrateLegacyTraces(mixed).length).toBe(1);
  });
});

describe("prompt hashing", () => {
  test("sha256Hex matches the known test vector", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
