// src/types.ts

export type InversionKind = "GEOM" | "SPHERE" | "OBSERVER" | "CAUSAL";

export type InversionMark = {
  step: number;
  kind: InversionKind;
};

export type State = {
  step: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;

  // inversion metadata (optional)
  inverted?: boolean;
  inversionMask?: number;
};

export type Event = {
  step: number;
  eventType: string;
  phaseBefore: number;
  phaseAfter: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type Variant = {
  name: string;

  // Geometry/dynamics
  stepOnce: (s: State, cfg: RunConfig) => State;

  // Event detection + labeling
  detectEvents: (
    prev: State,
    next: State,
    cfg: RunConfig
  ) => { eventType: string }[];

  // Phase transition for a given event label
  applyPhase: (phase: number, eventType: string, cfg: RunConfig) => number;

  // Optional observer hook (only if you use it)
  observe?: (
    s: State,
    events: { eventType: string }[],
    cfg: RunConfig
  ) => { visible: boolean; tag?: string };
};

export type RunConfig = {
  sizeX: number;
  sizeY: number;
  x0: number;
  y0: number;
  vx0: number;
  vy0: number;
  phase0: number;
  steps: number;
  multiplier: number;
  mod: number;

  // legacy single inversion (optional)
  inversionStep?: number;

  // multi inversion protocol (optional)
  inversionSchedule?: InversionMark[];

  // optional variant knobs (if you used them elsewhere)
  reflectMode?: "clamp" | "reflect";
};
