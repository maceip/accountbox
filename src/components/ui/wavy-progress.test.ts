import { test, expect } from "bun:test";
import { linearWavePath, circularWavePath } from "./wavy-progress";

function points(d: string): Array<[number, number]> {
  return d
    .replace(/^M\s*/, "")
    .replace(/\s*Z$/, "")
    .split(" L ")
    .map((p) => p.split(" ").map(Number) as [number, number]);
}

test("linear: starts and ends ON the centerline (straight edges)", () => {
  const d = linearWavePath({ length: 200, amplitude: 4, wavelength: 40, phase: 1.3, taper: 30, midY: 10 });
  const pts = points(d);
  expect(pts[0][1]).toBeCloseTo(10, 1);
  expect(pts[pts.length - 1][1]).toBeCloseTo(10, 1);
});

test("linear: wave amplitude respected mid-span, never exceeded", () => {
  const d = linearWavePath({ length: 400, amplitude: 5, wavelength: 40, phase: 0, taper: 30, midY: 20 });
  const ys = points(d).map(([, y]) => y);
  const maxDev = Math.max(...ys.map((y) => Math.abs(y - 20)));
  expect(maxDev).toBeLessThanOrEqual(5.001); // never exceeds amplitude
  expect(maxDev).toBeGreaterThan(4); // actually wavy in the middle
});

test("linear: zero/negative length yields empty path", () => {
  expect(linearWavePath({ length: 0, amplitude: 3, wavelength: 40, phase: 0, taper: 10, midY: 5 })).toBe("");
});

test("circular: full sweep produces a closed, seamless loop", () => {
  const d = circularWavePath({ cx: 24, cy: 24, radius: 18, amplitude: 2, waves: 10, phase: 0.7 });
  expect(d.endsWith("Z")).toBe(true);
  const pts = points(d);
  const [x0, y0] = pts[0];
  const [x1, y1] = pts[pts.length - 1];
  // integer wave count -> first and last computed points coincide (no seam)
  expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(0.1);
});

test("circular: radius stays within base±amplitude", () => {
  const d = circularWavePath({ cx: 0, cy: 0, radius: 20, amplitude: 3, waves: 8, phase: 2 });
  for (const [x, y] of points(d)) {
    const r = Math.hypot(x, y);
    expect(r).toBeGreaterThanOrEqual(16.99);
    expect(r).toBeLessThanOrEqual(23.01);
  }
});

test("circular: partial sweep is open (no Z) and tapers at the ends", () => {
  const d = circularWavePath({ cx: 0, cy: 0, radius: 20, amplitude: 3, waves: 8, phase: 1, sweep: 0.6 });
  expect(d.endsWith("Z")).toBe(false);
  const pts = points(d);
  // open ends sit on the base radius (amplitude tapered to zero)
  expect(Math.hypot(...pts[0])).toBeCloseTo(20, 1);
  expect(Math.hypot(...pts[pts.length - 1])).toBeCloseTo(20, 1);
});
