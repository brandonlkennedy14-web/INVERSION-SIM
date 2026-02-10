// src/variants/square_inversion_reflect.ts
import type { RunConfig, State, Variant } from "../types.js";
import { SquareClampReflect } from "./square_clamp_reflect.js";

// Deterministic mixing from "starting position in our reality"
export function computeInversionStepFromStart(cfg: RunConfig): number {

  // Convert inputs into a stable 32-bit seed (no randomness, no external definition)
  let h = 2166136261 | 0; // FNV-ish start

  const mix = (n: number) => {
    const x = (n | 0) ^ (n >>> 16);
    h ^= x;
    h = Math.imul(h, 16777619);
    h |= 0;
  };

  mix(cfg.sizeX);
  mix(cfg.sizeY);
  mix(cfg.x0);
  mix(cfg.y0);
  mix(cfg.vx0);
  mix(cfg.vy0);
  mix(cfg.phase0);
  mix(cfg.multiplier);
  mix(cfg.mod);

    const steps = Math.max(1, cfg.steps | 0);

  // If steps is 1, there is no "mid-run" to invert inside.
  if (steps <= 1) return 0;

  // Map to [0, steps-1]
  const u = (h >>> 0) % steps;

  // Force inversion to happen strictly inside the run: [1, steps-1]
  if (u === 0) return 1;

  return u;

}

function cfgWithReflectMode(cfg: RunConfig, mode: "clamp" | "reflect"): RunConfig {
  // SquareClampReflect reads cfg.reflectMode via a loose optional options object,
  // so we can attach it without changing your RunConfig type.
  return Object.assign({}, cfg, { reflectMode: mode });
}

export const SquareInversionReflect: Variant = {
  name: "square.inversion_reflect.start_defined",

  stepOnce: (s: State, cfg: RunConfig): State => {
    const inversionStep = computeInversionStepFromStart(cfg);

    // before inversionStep => clamp, after => reflect (geometry availability swap)
    const mode: "clamp" | "reflect" = s.step < inversionStep ? "clamp" : "reflect";
    const cfg2 = cfgWithReflectMode(cfg, mode);

    return SquareClampReflect.stepOnce(s, cfg2);
  },

  detectEvents: (prev: State, next: State, cfg: RunConfig) => {
    const inversionStep = computeInversionStepFromStart(cfg);

    // Pass through base events (corners / edges / near-corner, etc)
    const base = SquareClampReflect.detectEvents(prev, next, cfgWithReflectMode(cfg, "clamp")) ?? [];

    // Emit a single inversion marker event at the moment we cross the threshold
    const crossed = prev.step < inversionStep && next.step >= inversionStep;
    if (!crossed) return base;

    return [
      ...base,
      {
        eventType: "inversion.swap",
        inversionStep,
        from: "clamp",
        to: "reflect",
      },
    ];
  },

  applyPhase: (phase, eventType, cfg) => {
    // inversion marker does not change phase (instrumentation only)
    if (eventType === "inversion.swap") return phase;

    // delegate to the base phase rules (corner.off multiply, corner.diag +1)
    return SquareClampReflect.applyPhase(phase, eventType, cfg);
  },
};
