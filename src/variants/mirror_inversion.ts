// src/variants/mirror_inversion.ts
import type { RunConfig, State, Variant } from "../types.js";
import { SquareClampReflect } from "./square_clamp_reflect.js";

export const MirrorInversion: Variant = {
  name: "mirror.inversion",

  stepOnce: (s: State, cfg: RunConfig): State => {
    // Introduce mirror at center, reflect if crossing
    const mirrorX = Math.floor(cfg.sizeX / 2);
    const next = SquareClampReflect.stepOnce(s, cfg);

    // If crossing mirror, invert velocity and position
    if ((s.x < mirrorX && next.x >= mirrorX) || (s.x > mirrorX && next.x <= mirrorX)) {
      return { ...next, vx: -next.vx, x: mirrorX - (next.x - mirrorX) };
    }

    return next;
  },

  detectEvents: (prev: State, next: State, cfg: RunConfig) => {
    const base = SquareClampReflect.detectEvents(prev, next, cfg);
    const mirrorX = Math.floor(cfg.sizeX / 2);

    // Detect mirror crossing
    if ((prev.x < mirrorX && next.x >= mirrorX) || (prev.x > mirrorX && next.x <= mirrorX)) {
      return [...base, { eventType: "mirror.cross" }];
    }

    return base;
  },

  applyPhase: (phase, eventType, cfg) => {
    if (eventType === "mirror.cross") {
      return -phase; // Phase inversion on mirror cross
    }
    return SquareClampReflect.applyPhase(phase, eventType, cfg);
  },
};
