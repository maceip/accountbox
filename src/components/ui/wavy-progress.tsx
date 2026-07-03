/**
 * Material 3 Expressive–style wavy progress indicators.
 *
 * Not used anywhere yet — parked here as a reusable primitive.
 *
 * Two components, both self-contained (no deps beyond React + cn):
 *   <WavyLinearProgress />   — scrolling sine "squiggle" with straight, tapered
 *                              ends, a gap before the flat remaining track, and
 *                              the M3 stop-indicator dot at the track end.
 *   <WavyCircularProgress /> — the sine bent into a circle (scalloped ring)
 *                              that rotates and wiggles while loading.
 *
 * Behavior mirrors M3 Expressive loading indicators:
 *   - omit `value`  -> indeterminate (full-length wave, continuously scrolling)
 *   - value: 0..100 -> determinate (wavy active part, flat inactive track)
 *   - honors prefers-reduced-motion (renders a static wave, no animation)
 *
 * Everything visual is a prop: color, trackColor, strokeWidth, amplitude,
 * wavelength/waves, speed, size. Colors default to currentColor so the usual
 * `className="text-primary"` pattern works.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* ------------------------------ shared bits ------------------------------ */

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Continuously advancing wave phase (radians), rAF-driven; frozen when off. */
function useWavePhase(speed: number, animate: boolean): number {
  const [phase, setPhase] = useState(0);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!animate || speed === 0) return;
    let raf = 0;
    const tick = (t: number) => {
      if (last.current !== null) {
        const dt = (t - last.current) / 1000;
        // One full wavelength scrolls past roughly every 1/speed seconds.
        setPhase((p) => (p + dt * speed * Math.PI * 2) % (Math.PI * 2 * 1e6));
      }
      last.current = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      last.current = null;
    };
  }, [speed, animate]);
  return phase;
}

const smoothstep = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/* --------------------------- path generators ----------------------------- */
/* Pure + exported so they can be unit-tested without a DOM.                 */

export function linearWavePath(opts: {
  /** total drawable length in px */
  length: number;
  amplitude: number;
  wavelength: number;
  phase: number;
  /** px over which the wave flattens at each end (straight edges) */
  taper: number;
  /** vertical center */
  midY: number;
  step?: number;
}): string {
  const { length, amplitude, wavelength, phase, taper, midY, step = 2 } = opts;
  if (length <= 0) return "";
  const pts: string[] = [];
  for (let x = 0; x <= length; x += step) {
    const envelope =
      taper > 0 ? smoothstep(x / taper) * smoothstep((length - x) / taper) : 1;
    const y =
      midY +
      amplitude * envelope * Math.sin((x / wavelength) * Math.PI * 2 + phase);
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  // Ensure the exact endpoint is included (straight, envelope=0 there).
  pts.push(`${length.toFixed(2)} ${midY.toFixed(2)}`);
  return `M ${pts.join(" L ")}`;
}

export function circularWavePath(opts: {
  cx: number;
  cy: number;
  /** base ring radius */
  radius: number;
  amplitude: number;
  /** number of full waves around the ring (integer keeps the loop seamless) */
  waves: number;
  phase: number;
  /** fraction of the circle to draw, 0..1 (1 = closed loop) */
  sweep?: number;
  /** start angle in radians (default: 12 o'clock) */
  start?: number;
  /** radians over which amplitude tapers at open ends */
  taper?: number;
  segments?: number;
}): string {
  const {
    cx,
    cy,
    radius,
    amplitude,
    waves,
    phase,
    sweep = 1,
    start = -Math.PI / 2,
    taper = 0.5,
    segments = 180,
  } = opts;
  if (sweep <= 0) return "";
  const closed = sweep >= 0.9999;
  const total = Math.PI * 2 * sweep;
  const pts: string[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * total;
    const envelope = closed
      ? 1
      : taper > 0
        ? smoothstep(t / taper) * smoothstep((total - t) / taper)
        : 1;
    const r = radius + amplitude * envelope * Math.sin(waves * t + phase);
    const a = start + t;
    pts.push(
      `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`,
    );
  }
  return `M ${pts.join(" L ")}${closed ? " Z" : ""}`;
}

/** Flat arc (no wave) for the inactive remainder of the circular track. */
function flatArcPath(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  segments = 64,
): string {
  if (a1 <= a0) return "";
  const pts: string[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = a0 + ((a1 - a0) * i) / segments;
    pts.push(
      `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`,
    );
  }
  return `M ${pts.join(" L ")}`;
}

/* ------------------------------ linear ----------------------------------- */

export interface WavyLinearProgressProps {
  /** 0..100; omit for indeterminate */
  value?: number;
  width?: number;
  strokeWidth?: number;
  /** wave height from centerline, px */
  amplitude?: number;
  /** px per full wave */
  wavelength?: number;
  /** wavelengths scrolled per second */
  speed?: number;
  /** stroke of the active (wavy) part; any CSS color */
  color?: string;
  /** stroke of the inactive track */
  trackColor?: string;
  /** px gap between the active wave head and the track (M3 style) */
  gap?: number;
  /** M3 stop indicator dot at the far end of the track */
  showStopIndicator?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function WavyLinearProgress({
  value,
  width = 240,
  strokeWidth = 4,
  amplitude = 3,
  wavelength = 40,
  speed = 1,
  color = "currentColor",
  trackColor = "color-mix(in srgb, currentColor 24%, transparent)",
  gap = 4,
  showStopIndicator = true,
  className,
  "aria-label": ariaLabel = "Loading",
}: WavyLinearProgressProps) {
  const reduced = usePrefersReducedMotion();
  const indeterminate = value === undefined || Number.isNaN(value);
  const phase = useWavePhase(speed, !reduced);
  // Wave scrolls toward the head (negative phase direction reads as forward).
  const p = -phase;

  const height = 2 * amplitude + strokeWidth + 2;
  const midY = height / 2;
  const clamped = indeterminate ? 100 : Math.min(100, Math.max(0, value));
  const inset = strokeWidth / 2;
  const usable = width - strokeWidth;
  const activeLen = (clamped / 100) * usable;
  const trackStart = inset + activeLen + gap;
  const trackEnd = inset + usable - (showStopIndicator ? strokeWidth * 1.5 : 0);

  return (
    <svg
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      fill="none"
    >
      {/* active: the squiggle */}
      {activeLen > 0 && (
        <path
          d={linearWavePath({
            length: activeLen,
            amplitude,
            wavelength,
            phase: p,
            taper: Math.min(wavelength * 0.75, activeLen / 2),
            midY,
          })}
          transform={`translate(${inset} 0)`}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {/* inactive: flat track with gap */}
      {!indeterminate && trackEnd > trackStart && (
        <line
          x1={trackStart}
          y1={midY}
          x2={trackEnd}
          y2={midY}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      )}
      {/* M3 stop indicator */}
      {!indeterminate && showStopIndicator && (
        <circle
          cx={inset + usable}
          cy={midY}
          r={strokeWidth / 2}
          fill={trackColor}
        />
      )}
    </svg>
  );
}

/* ------------------------------ circular --------------------------------- */

export interface WavyCircularProgressProps {
  /** 0..100; omit for indeterminate */
  value?: number;
  /** outer box, px */
  size?: number;
  strokeWidth?: number;
  amplitude?: number;
  /** whole waves around the ring */
  waves?: number;
  /** wave wiggle speed (phase cycles/sec) */
  speed?: number;
  /** full rotations/sec while indeterminate */
  rotateSpeed?: number;
  color?: string;
  trackColor?: string;
  /** degrees of gap around the active arc's ends (determinate, M3 style) */
  gapDegrees?: number;
  className?: string;
  "aria-label"?: string;
}

export function WavyCircularProgress({
  value,
  size = 48,
  strokeWidth = 4,
  amplitude = 2.5,
  waves = 10,
  speed = 1,
  rotateSpeed = 0.35,
  color = "currentColor",
  trackColor = "color-mix(in srgb, currentColor 24%, transparent)",
  gapDegrees = 14,
  className,
  "aria-label": ariaLabel = "Loading",
}: WavyCircularProgressProps) {
  const reduced = usePrefersReducedMotion();
  const indeterminate = value === undefined || Number.isNaN(value);
  const phase = useWavePhase(speed, !reduced);
  // Slow rotation is phase-derived too, so one rAF loop drives everything.
  const rotation =
    indeterminate && !reduced
      ? (phase / (Math.PI * 2)) * (rotateSpeed / Math.max(speed, 0.0001)) * 360
      : 0;

  const c = size / 2;
  const radius = (size - strokeWidth) / 2 - amplitude;
  const clamped = indeterminate ? 100 : Math.min(100, Math.max(0, value));
  const sweep = clamped / 100;
  const start = -Math.PI / 2;
  const gapRad = (gapDegrees * Math.PI) / 180;

  return (
    <svg
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("overflow-visible", className)}
      fill="none"
      style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
    >
      {/* active: the wavy arc (or full wiggling ring when indeterminate) */}
      {sweep > 0 && (
        <path
          d={circularWavePath({
            cx: c,
            cy: c,
            radius,
            amplitude,
            waves,
            phase,
            sweep,
            start,
          })}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {/* inactive: flat remainder track with gaps at both ends */}
      {!indeterminate && sweep < 1 && (
        <path
          d={flatArcPath(
            c,
            c,
            radius,
            start + Math.PI * 2 * sweep + gapRad,
            start + Math.PI * 2 - gapRad,
          )}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
