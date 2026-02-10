import { describe, it, expect } from "@jest/globals";
import { makeRng, randInt } from "./rng.js";
import { computeInversionStepFromStart } from "./variants/square_inversion_reflect.js";
import { runVariant } from "./run.js";
import { SquareInversionReflect } from "./variants/square_inversion_reflect.js";

const basicCfg = {
  sizeX: 5,
  sizeY: 7,
  x0: 1,
  y0: 1,
  vx0: 1,
  vy0: 1,
  phase0: 0,
  steps: 100,
  multiplier: 7,
  mod: 1000003,
};

describe("makeRng", () => {
  it("produces deterministic output for same seed", () => {
    const rng1 = makeRng(42);
    const rng2 = makeRng(42);
    expect(rng1()).toBeCloseTo(rng2());
    expect(rng1()).toBeCloseTo(rng2());
  });
});

describe("randInt", () => {
  it("returns values in range", () => {
    const rng = makeRng(123);
    for (let i = 0; i < 10; i++) {
      const v = randInt(rng, 1, 5);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

describe("computeInversionStepFromStart", () => {
  it("returns a step within range", () => {
    const step = computeInversionStepFromStart(basicCfg);
    expect(step).toBeGreaterThanOrEqual(1);
    expect(step).toBeLessThanOrEqual(basicCfg.steps - 1);
  });
});

describe("runVariant", () => {
  it("runs and returns trajectory/events", () => {
    const result = runVariant(SquareInversionReflect, basicCfg);
    expect(Array.isArray(result.trajectory)).toBe(true);
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.trajectory.length).toBeGreaterThan(0);
  });
});
