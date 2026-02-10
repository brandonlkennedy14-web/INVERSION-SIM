import type { RunConfig, State, Variant } from "../types.js";

// This variant introduces a 'sticky' boundary: when a particle hits a wall, it stays there for one step before reflecting.
export const SquareStickyReflect: Variant = {
  name: "square.sticky_reflect",

  stepOnce: (s: State, cfg: RunConfig): State => {
    // If the particle is 'stuck', release it and reflect velocity
    if ((s as any).stuck) {
      return {
        ...s,
        x: s.x + (s.vx > 0 ? 1 : s.vx < 0 ? -1 : 0),
        y: s.y + (s.vy > 0 ? 1 : s.vy < 0 ? -1 : 0),
        vx: -s.vx,
        vy: -s.vy,
        step: s.step + 1,
        phase: s.phase,
        stuck: false,
      };
    }
    // Normal move
    let x = s.x + s.vx;
    let y = s.y + s.vy;
    let vx = s.vx;
    let vy = s.vy;
    let stuck = false;
    if (x < 0 || x > cfg.sizeX) {
      x = x < 0 ? 0 : cfg.sizeX;
      vx = 0;
      stuck = true;
    }
    if (y < 0 || y > cfg.sizeY) {
      y = y < 0 ? 0 : cfg.sizeY;
      vy = 0;
      stuck = true;
    }
    return {
      ...s,
      x,
      y,
      vx,
      vy,
      step: s.step + 1,
      phase: s.phase,
      stuck,
    };
  },

  detectEvents: (prev: State, next: State, cfg: RunConfig) => {
    const events = [];
    if ((next as any).stuck && !(prev as any).stuck) {
      events.push({ eventType: "sticky.enter" });
    }
    if (!(next as any).stuck && (prev as any).stuck) {
      events.push({ eventType: "sticky.exit" });
    }
    return events;
  },

  applyPhase: (phase, eventType, cfg) => {
    // No phase change for sticky events
    return phase;
  },
};
