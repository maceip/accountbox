import { describe, expect, test } from "bun:test";
import {
  MIN_GPU_BUFFER_BYTES,
  evaluateConnection,
  evaluateGpuSupport,
} from "./agent-preload";

describe("evaluateGpuSupport", () => {
  test("rejects when WebGPU is absent", () => {
    const r = evaluateGpuSupport({ hasGpu: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("WebGPU");
  });

  test("rejects a GPU with a too-small buffer budget", () => {
    const r = evaluateGpuSupport({
      hasGpu: true,
      maxBufferSize: 256 * 1024 * 1024,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("buffer budget");
  });

  test("accepts exactly the minimum budget", () => {
    expect(
      evaluateGpuSupport({ hasGpu: true, maxBufferSize: MIN_GPU_BUFFER_BYTES })
        .ok,
    ).toBe(true);
  });

  test("accepts a desktop-class budget", () => {
    expect(evaluateGpuSupport({ hasGpu: true, maxBufferSize: 4.29e9 }).ok).toBe(
      true,
    );
  });

  test("accepts when the limit is unknown (older adapters)", () => {
    expect(evaluateGpuSupport({ hasGpu: true }).ok).toBe(true);
  });
});

describe("evaluateConnection", () => {
  test("allows when the API is unavailable (Safari/Firefox, desktops)", () => {
    expect(evaluateConnection(null)).toBe("allow");
  });

  test("defers on data saver", () => {
    expect(evaluateConnection({ saveData: true, effectiveType: "4g" })).toBe(
      "defer",
    );
  });

  test("defers on cellular radio", () => {
    expect(evaluateConnection({ type: "cellular", effectiveType: "4g" })).toBe(
      "defer",
    );
  });

  test("defers on 2g/3g-class links", () => {
    expect(evaluateConnection({ effectiveType: "slow-2g" })).toBe("defer");
    expect(evaluateConnection({ effectiveType: "2g" })).toBe("defer");
    expect(evaluateConnection({ effectiveType: "3g" })).toBe("defer");
  });

  test("allows on wifi/ethernet-class 4g estimate", () => {
    expect(evaluateConnection({ type: "wifi", effectiveType: "4g" })).toBe(
      "allow",
    );
    expect(evaluateConnection({ effectiveType: "4g" })).toBe("allow");
  });
});
