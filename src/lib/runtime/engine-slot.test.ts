import { afterEach, describe, expect, test } from "bun:test";
import {
  __resetEngineSlotForTests,
  claimEngineSlot,
  currentEngineSlotOwner,
  engineLockHeld,
  releaseEngineSlot,
  slotDecision,
  watchEngineSlotFree,
} from "./engine-slot";

afterEach(() => __resetEngineSlotForTests());

describe("slotDecision (pure)", () => {
  test("empty slot -> acquire", () => {
    expect(slotDecision(null, "chat")).toBe("acquire");
  });

  test("same model -> keep (no displacement, no re-lock)", () => {
    expect(slotDecision("chat", "chat")).toBe("keep");
    expect(slotDecision("skill:gmail-agent", "skill:gmail-agent")).toBe("keep");
  });

  test("different model -> displace", () => {
    expect(slotDecision("chat", "skill:gmail-agent")).toBe("displace");
    expect(slotDecision("skill:gmail-agent", "chat")).toBe("displace");
  });
});

describe("engineLockHeld (pure)", () => {
  test("held when the engine lock name appears", () => {
    expect(engineLockHeld([{ name: "accountbox-agent-engine" }])).toBe(true);
    expect(
      engineLockHeld([{ name: "other" }, { name: "accountbox-agent-engine" }]),
    ).toBe(true);
  });

  test("free when absent, empty, or undefined", () => {
    expect(engineLockHeld([{ name: "other" }])).toBe(false);
    expect(engineLockHeld([])).toBe(false);
    expect(engineLockHeld(undefined)).toBe(false);
  });
});

describe("watchEngineSlotFree (no navigator.locks in bun)", () => {
  test("is a safe no-op without the Web Locks API", () => {
    const cancel = watchEngineSlotFree(() => {
      throw new Error("must not fire without locks API");
    });
    expect(typeof cancel).toBe("function");
    cancel();
  });
});

describe("claimEngineSlot (no navigator.locks in bun -> cross-tab check skipped)", () => {
  test("first claim acquires; owner recorded", async () => {
    expect(await claimEngineSlot("chat", () => {})).toBe(true);
    expect(currentEngineSlotOwner()).toBe("chat");
  });

  test("swap displaces the previous owner exactly once", async () => {
    let displaced = 0;
    await claimEngineSlot("chat", () => displaced++);
    await claimEngineSlot("skill:gmail-agent", () => {});
    expect(displaced).toBe(1);
    expect(currentEngineSlotOwner()).toBe("skill:gmail-agent");
  });

  test("re-claim by the same owner does NOT displace", async () => {
    let displaced = 0;
    await claimEngineSlot("chat", () => displaced++);
    await claimEngineSlot("chat", () => displaced++);
    expect(displaced).toBe(0);
    expect(currentEngineSlotOwner()).toBe("chat");
  });

  test("a displaced owner's dispose error does not break the swap", async () => {
    await claimEngineSlot("chat", () => {
      throw new Error("dispose exploded");
    });
    expect(await claimEngineSlot("skill:gmail-agent", () => {})).toBe(true);
    expect(currentEngineSlotOwner()).toBe("skill:gmail-agent");
  });

  test("release by the owner empties the slot", async () => {
    await claimEngineSlot("chat", () => {});
    releaseEngineSlot("chat");
    expect(currentEngineSlotOwner()).toBeNull();
  });

  test("stale release from a displaced runtime is a no-op", async () => {
    await claimEngineSlot("chat", () => {});
    await claimEngineSlot("skill:gmail-agent", () => {});
    releaseEngineSlot("chat"); // chat was displaced; it may not free the slot
    expect(currentEngineSlotOwner()).toBe("skill:gmail-agent");
  });
});
