// src/variants/square_clamp_reflect.ts
import type { RunConfig, State, Variant } from "../types";

/**
 * This variant is intentionally "behavior-preserving by default":
 * - Default boundary behavior is the original CLAMP+REFLECT (no leftover distance after wall hit).
 * - Corner classification defaults to main diagonal corners: (0,0) and (sizeX,sizeY).
 *
 * Extra instrumentation + options are enabled only if you set flags in cfg (treated as optional).
 */

/** Optional config (kept loose so you don't have to edit RunConfig yet) */
type SquareVariantOptions = {
  // Boundary handling
  reflectMode?: "clamp" | "reflect"; // default: "clamp" (original behavior)

  // Corner classification
  cornerMode?: "mainDiag" | "antiDiag" | "parity" | "velocity"; // default: "mainDiag"

  // Extra events (off by default)
  emitEdgeEvents?: boolean;        // edges (x=0/x=sizeX or y=0/y=sizeY)
  emitNearCornerEvents?: boolean;  // near-corner (within N lattice units)
  nearCornerDist?: number;         // default: 1

  // Phase rules (defaults match your existing logic)
  cornerOffEventType?: string;     // default: "corner.off"
  cornerDiagEventType?: string;    // default: "corner.diag"
};

function opts(cfg: RunConfig): SquareVariantOptions {
  return (cfg as unknown as SquareVariantOptions) ?? {};
}

function assertValidConfig(cfg: RunConfig) {
  // cheap sanity guards (prevent silent nonsense)
  if (!Number.isFinite(cfg.sizeX) || !Number.isFinite(cfg.sizeY)) {
    throw new Error(`Invalid sizeX/sizeY: ${cfg.sizeX}, ${cfg.sizeY}`);
  }
  if (cfg.sizeX <= 0 || cfg.sizeY <= 0) {
    throw new Error(`sizeX/sizeY must be > 0. Got ${cfg.sizeX}, ${cfg.sizeY}`);
  }
  if (!Number.isFinite(cfg.mod) || cfg.mod <= 0) {
    throw new Error(`mod must be a positive number. Got ${cfg.mod}`);
  }
  if (!Number.isFinite(cfg.multiplier)) {
    throw new Error(`multiplier must be a finite number. Got ${cfg.multiplier}`);
  }
}

/**
 * Original behavior: clamp to wall and flip velocity, discarding leftover distance.
 * This is what your logs match, so it stays as the default.
 */
function clampReflect(pos: number, vel: number, lo: number, hi: number) {
  let p = pos + vel;
  let v = vel;
  if (p < lo) { p = lo; v = -v; }
  if (p > hi) { p = hi; v = -v; }
  return { p, v };
}

/**
 * True reflection with leftover distance:
 * Reflect on [lo, hi] even if the step would cross multiple walls.
 * Useful if you later allow large |vel| or continuous-ish stepping.
 */
function reflectWithRemainder(pos: number, vel: number, lo: number, hi: number) {
  const L = hi - lo;
  if (L <= 0) return { p: lo, v: -vel };

  // map to [0, L]
  const x0 = pos - lo;
  const x1 = x0 + vel;

  // fold onto [0, L] using period 2L
  const period = 2 * L;
  // robust modulo for negatives
  const m = ((x1 % period) + period) % period;

  let pFold: number;
  let flipped = false;
  if (m <= L) {
    pFold = m;
    flipped = false;
  } else {
    pFold = period - m;
    flipped = true;
  }

  // Determine if velocity direction flips:
  // if we're on the "reflected" side, invert vel.
  const v1 = flipped ? -vel : vel;

  return { p: lo + pFold, v: v1 };
}

function isOnEdgeX(x: number, cfg: RunConfig) {
  return x === 0 || x === cfg.sizeX;
}
function isOnEdgeY(y: number, cfg: RunConfig) {
  return y === 0 || y === cfg.sizeY;
}
function isCorner(x: number, y: number, cfg: RunConfig) {
  return isOnEdgeX(x, cfg) && isOnEdgeY(y, cfg);
}

function cornerClass(
  next: State,
  cfg: RunConfig,
  cornerMode: NonNullable<SquareVariantOptions["cornerMode"]>
): "diag" | "off" {
  const x = next.x;
  const y = next.y;

  switch (cornerMode) {
    case "mainDiag": {
      // (0,0) and (sizeX,sizeY)
      const diag =
        (x === 0 && y === 0) ||
        (x === cfg.sizeX && y === cfg.sizeY);
      return diag ? "diag" : "off";
    }
    case "antiDiag": {
      // (0,sizeY) and (sizeX,0)
      const diag =
        (x === 0 && y === cfg.sizeY) ||
        (x === cfg.sizeX && y === 0);
      return diag ? "diag" : "off";
    }
    case "parity": {
      // split corners by parity of (x+y)
      const diag = ((x + y) % 2) === 0;
      return diag ? "diag" : "off";
    }
    case "velocity": {
      // split by sign of vx*vy at the instant (gives a dynamics-coupled classification)
      const diag = (next.vx * next.vy) >= 0;
      return diag ? "diag" : "off";
    }
    default:
      return "off";
  }
}

function manhattanDistToNearestCorner(x: number, y: number, cfg: RunConfig) {
  const corners = [
    [0, 0],
    [0, cfg.sizeY],
    [cfg.sizeX, 0],
    [cfg.sizeX, cfg.sizeY],
  ] as const;

  let best = Infinity;
  for (const [cx, cy] of corners) {
    const d = Math.abs(x - cx) + Math.abs(y - cy);
    if (d < best) best = d;
  }
  return best;
}

export const SquareClampReflect: Variant = {
  name: "square.clamp_reflect.corner_mult_or_plus1",

  stepOnce: (s: State, cfg: RunConfig): State => {
    assertValidConfig(cfg);

    const o = opts(cfg);
    const mode: NonNullable<SquareVariantOptions["reflectMode"]> = o.reflectMode ?? "clamp";

    const xr =
      mode === "reflect"
        ? reflectWithRemainder(s.x, s.vx, 0, cfg.sizeX)
        : clampReflect(s.x, s.vx, 0, cfg.sizeX);

    const yr =
      mode === "reflect"
        ? reflectWithRemainder(s.y, s.vy, 0, cfg.sizeY)
        : clampReflect(s.y, s.vy, 0, cfg.sizeY);

    return {
      step: s.step + 1,
      x: xr.p, y: yr.p,
      vx: xr.v, vy: yr.v,
      phase: s.phase, // phase updates happen via events
    };
  },

  detectEvents: (prev: State, next: State, cfg: RunConfig) => {
    const o = opts(cfg);

    const cornerOff = o.cornerOffEventType ?? "corner.off";
    const cornerDiag = o.cornerDiagEventType ?? "corner.diag";

    const out: Array<{ eventType: string; [k: string]: any }> = [];

    // Optional edge-hit events (off by default)
    if (o.emitEdgeEvents) {
      const prevOnX = isOnEdgeX(prev.x, cfg);
      const nextOnX = isOnEdgeX(next.x, cfg);
      const prevOnY = isOnEdgeY(prev.y, cfg);
      const nextOnY = isOnEdgeY(next.y, cfg);

      // Emit only on transitions to avoid spamming repeated edge frames
      if (!prevOnX && nextOnX) out.push({ eventType: "edge.hit.x", edge: "x", x: next.x, y: next.y });
      if (!prevOnY && nextOnY) out.push({ eventType: "edge.hit.y", edge: "y", x: next.x, y: next.y });
    }

    // Optional near-corner events (off by default)
    if (o.emitNearCornerEvents) {
      const dist = Math.max(0, Math.floor(o.nearCornerDist ?? 1));
      const dPrev = manhattanDistToNearestCorner(prev.x, prev.y, cfg);
      const dNext = manhattanDistToNearestCorner(next.x, next.y, cfg);

      // Trigger when entering the near-corner zone
      if (dPrev > dist && dNext <= dist) {
        out.push({
          eventType: "near.corner.enter",
          dist: dNext,
          x: next.x, y: next.y,
        });
      }
      // And when leaving
      if (dPrev <= dist && dNext > dist) {
        out.push({
          eventType: "near.corner.exit",
          dist: dPrev,
          x: next.x, y: next.y,
        });
      }
    }

    // Corner events (the original core signal)
    if (!isCorner(next.x, next.y, cfg)) return out;

    const mode: NonNullable<SquareVariantOptions["cornerMode"]> = o.cornerMode ?? "mainDiag";
    const cls = cornerClass(next, cfg, mode);

    const eventType = cls === "diag" ? cornerDiag : cornerOff;

    // Payload helps leaderboard/metrics without changing behavior
    out.push({
      eventType,
      cornerClass: cls,
      cornerKey: `${next.x},${next.y}`,
      // Include a little state snapshot so the runner can log richer data if desired
      x: next.x, y: next.y, vx: next.vx, vy: next.vy,
      // A tiny hint for later "geometry swap" tagging
      geometry: "square",
      reflectMode: o.reflectMode ?? "clamp",
      cornerMode: mode,
    });

    return out;
  },

  applyPhase: (phase: number, eventType: string, cfg: RunConfig) => {
    const o = opts(cfg);
    const cornerOff = o.cornerOffEventType ?? "corner.off";
    const cornerDiag = o.cornerDiagEventType ?? "corner.diag";

    // Preserve your exact rules:
    // - off-corners: multiply mod M
    // - diag-corners: +1 mod M
    if (eventType === cornerOff) {
      return (phase * cfg.multiplier) % cfg.mod;
    }
    if (eventType === cornerDiag) {
      return (phase + 1) % cfg.mod;
    }

    // Other event channels don't change phase (instrumentation only)
    return phase;
  },
};
