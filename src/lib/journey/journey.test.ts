import { afterEach, describe, expect, test } from "bun:test";
import {
  JOURNEY_STEPS,
  __resetJourneyForTests,
  applyStepDone,
  completeJourneyStep,
  deriveStepStates,
  getJourney,
  grandfatherJourney,
  isJourneyComplete,
  parseStoredJourney,
  skipJourneyUnsupportedDevice,
} from "./journey";

afterEach(() => __resetJourneyForTests());

describe("deriveStepStates", () => {
  test("fresh journey: first step active, rest locked", () => {
    expect(deriveStepStates([])).toEqual({
      "chat-agent": "active",
      "first-skill": "locked",
      "connect-account": "locked",
    });
  });

  test("one done: next becomes active", () => {
    expect(deriveStepStates(["chat-agent"])).toEqual({
      "chat-agent": "done",
      "first-skill": "active",
      "connect-account": "locked",
    });
  });

  test("two done: last becomes active", () => {
    expect(deriveStepStates(["chat-agent", "first-skill"])).toEqual({
      "chat-agent": "done",
      "first-skill": "done",
      "connect-account": "active",
    });
  });

  test("all done: everything done, nothing active", () => {
    expect(deriveStepStates([...JOURNEY_STEPS])).toEqual({
      "chat-agent": "done",
      "first-skill": "done",
      "connect-account": "done",
    });
  });
});

describe("isJourneyComplete", () => {
  test("false until every step is done", () => {
    expect(isJourneyComplete([])).toBe(false);
    expect(isJourneyComplete(["chat-agent"])).toBe(false);
    expect(isJourneyComplete(["chat-agent", "first-skill"])).toBe(false);
  });

  test("true when all steps are done (any order)", () => {
    expect(
      isJourneyComplete(["connect-account", "chat-agent", "first-skill"]),
    ).toBe(true);
  });
});

describe("applyStepDone", () => {
  test("completes the active step", () => {
    expect(applyStepDone([], "chat-agent")).toEqual(["chat-agent"]);
  });

  test("refuses a locked step (out-of-order completion is a bug)", () => {
    expect(applyStepDone([], "connect-account")).toEqual([]);
    expect(applyStepDone([], "first-skill")).toEqual([]);
  });

  test("idempotent for an already-done step", () => {
    expect(applyStepDone(["chat-agent"], "chat-agent")).toEqual(["chat-agent"]);
  });

  test("walks the full progression in order", () => {
    let done = applyStepDone([], "chat-agent");
    done = applyStepDone(done, "first-skill");
    done = applyStepDone(done, "connect-account");
    expect(isJourneyComplete(done)).toBe(true);
  });
});

describe("parseStoredJourney", () => {
  test("null / empty -> fresh journey", () => {
    expect(parseStoredJourney(null)).toEqual({ v: 1, done: [] });
    expect(parseStoredJourney("")).toEqual({ v: 1, done: [] });
  });

  test("corrupt JSON -> fresh journey (fail-safe boot)", () => {
    expect(parseStoredJourney("{nope")).toEqual({ v: 1, done: [] });
  });

  test("unknown version -> fresh journey", () => {
    expect(
      parseStoredJourney(JSON.stringify({ v: 99, done: ["chat-agent"] })),
    ).toEqual({
      v: 1,
      done: [],
    });
  });

  test("unknown step ids are dropped, known ones kept", () => {
    const parsed = parseStoredJourney(
      JSON.stringify({ v: 1, done: ["chat-agent", "hack-the-planet"] }),
    );
    expect(parsed.done).toEqual(["chat-agent"]);
  });

  test("round-trips a grandfathered completion", () => {
    const parsed = parseStoredJourney(
      JSON.stringify({
        v: 1,
        done: [...JOURNEY_STEPS],
        completedVia: "grandfathered",
      }),
    );
    expect(isJourneyComplete(parsed.done)).toBe(true);
    expect(parsed.completedVia).toBe("grandfathered");
  });

  test("invalid completedVia is dropped", () => {
    const parsed = parseStoredJourney(
      JSON.stringify({ v: 1, done: [], completedVia: "cheated" }),
    );
    expect(parsed.completedVia).toBeUndefined();
  });
});

describe("journey store", () => {
  test("walking all steps completes via steps", () => {
    completeJourneyStep("chat-agent");
    completeJourneyStep("first-skill");
    completeJourneyStep("connect-account");
    const j = getJourney();
    expect(j.complete).toBe(true);
    expect(j.completedVia).toBe("steps");
  });

  test("grandfathering completes a fresh journey", () => {
    grandfatherJourney();
    const j = getJourney();
    expect(j.complete).toBe(true);
    expect(j.completedVia).toBe("grandfathered");
  });

  test("grandfathering is refused mid-journey (OAuth return is step 3, not grandfathering)", () => {
    completeJourneyStep("chat-agent");
    grandfatherJourney();
    const j = getJourney();
    expect(j.complete).toBe(false);
    expect(j.steps["first-skill"]).toBe("active");
  });

  test("unsupported-device skip completes with an honest label", () => {
    skipJourneyUnsupportedDevice();
    const j = getJourney();
    expect(j.complete).toBe(true);
    expect(j.completedVia).toBe("unsupported-device");
  });

  test("progressed reflects any step done", () => {
    expect(getJourney().progressed).toBe(false);
    completeJourneyStep("chat-agent");
    expect(getJourney().progressed).toBe(true);
  });
});
