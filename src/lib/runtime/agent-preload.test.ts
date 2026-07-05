import { describe, expect, test } from "bun:test";
import {
  MIN_GPU_BUFFER_BYTES,
  evaluateConnection,
  evaluateGpuSupport,
} from "./agent-preload";

const capable = {
  hasGpu: true,
  hasImmediateAddressSpace: true,
  hasSubgroups: true,
  deviceGranted: true,
} as const;

describe("evaluateGpuSupport", () => {
  test("rejects when WebGPU is absent", () => {
    const r = evaluateGpuSupport({ hasGpu: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("WebGPU");
  });

  test("rejects when WGSL immediate_address_space is missing (Android Chrome 149)", () => {
    const r = evaluateGpuSupport({ ...capable, hasImmediateAddressSpace: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("WGSL");
  });

  test("rejects when the adapter lacks subgroups", () => {
    const r = evaluateGpuSupport({ ...capable, hasSubgroups: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("subgroups");
  });

  test("rejects when the 1GiB device request is refused, naming the advertised budget", () => {
    const r = evaluateGpuSupport({
      ...capable,
      deviceGranted: false,
      advertisedMaxBufferBytes: 256 * 1024 * 1024,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain(
        `${Math.round(MIN_GPU_BUFFER_BYTES / 1024 / 1024)}MB`,
      );
      expect(r.reason).toContain("256MB advertised");
    }
  });

  test("rejects an ungranted device even when no budget was advertised", () => {
    const r = evaluateGpuSupport({ ...capable, deviceGranted: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("budget unknown");
  });

  test("accepts a fully capable device", () => {
    expect(evaluateGpuSupport({ ...capable }).ok).toBe(true);
  });

  test("accepts regardless of the advertised limit when the device was granted", () => {
    expect(
      evaluateGpuSupport({
        ...capable,
        advertisedMaxBufferBytes: 256 * 1024 * 1024,
      }).ok,
    ).toBe(true);
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
