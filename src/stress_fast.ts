import { runVariant } from "./run.js";
import {
  SquareInversionReflect,
  computeInversionStepFromStart,
} from "./variants/square_inversion_reflect.js";
import type { RunConfig } from "./types.js";
import { makeRng, randInt } from "./rng.js";

type RunStats = { steps: number; events: number; traj: number };

function makeCfg(rng: () => number): RunConfig {
  const cfg: RunConfig = {
    sizeX: randInt(rng, 3, 25),
    sizeY: randInt(rng, 3, 25),
    x0: randInt(rng, 0, 10),
    y0: randInt(rng, 0, 10),
    vx0: randInt(rng, -3, 3) || 1,
    vy0: randInt(rng, -3, 3) || 1,
    phase0: 0,
    steps: randInt(rng, 200003, 300001),
    multiplier: randInt(rng, 2, 50),
    mod: 1000003,
  };

  cfg.inversionStep = computeInversionStepFromStart(cfg);
  return cfg;
}

function runOne(cfg: RunConfig, seed: number): RunStats {
  const result = runVariant(SquareInversionReflect, cfg);

  // minimal checks (cheap)
  const inv = cfg.inversionStep!;
  const invertEvents = result.events.filter(e => e.eventType === "INVERT");
  if (invertEvents.length !== 1 || invertEvents[0].step !== inv) {
    throw new Error(`bad invert (seed=${seed})`);
  }
  if (!result.trajectory[inv] || result.trajectory[inv].inverted !== true) {
    throw new Error(`bad inverted flag (seed=${seed})`);
  }

  return {
    steps: cfg.steps,
    events: result.events.length,
    traj: result.trajectory.length,
  };
}

// --------------------
// CLI
// --------------------
// Normal mode:
//   npx tsx src/stress_fast.ts 200 424242
//
// Replay mode:
//   npx tsx src/stress_fast.ts replay 424242 137
//
const mode = process.argv[2] ?? "200";

if (mode === "replay") {
  const SEED = Number(process.argv[3] ?? 123456);
  const K = Number(process.argv[4] ?? 1);

  if (!Number.isFinite(SEED) || !Number.isFinite(K) || K < 1) {
    throw new Error(`Usage: replay <seed> <runIndex>=1..N`);
  }

  const rng = makeRng(SEED);

  // Advance deterministically to run K by generating configs K times.
  // (Fast: this does NOT run the sim for runs < K.)
  let cfg!: RunConfig;
  for (let i = 1; i <= K; i++) cfg = makeCfg(rng);

  console.log("REPLAY", { seed: SEED, runIndex: K });
  console.log("CFG", JSON.stringify(cfg, null, 2));

  const t0 = Date.now();
  const stats = runOne(cfg, SEED);
  const dt = (Date.now() - t0) / 1000;

  console.log("RESULT", {
    seconds: dt,
    ...stats,
    stepsPerSec: Math.floor(stats.steps / Math.max(dt, 1e-9)),
  });

  process.exit(0);
}

// Normal throughput mode
const N = Number(process.argv[2] ?? 200);
const SEED = Number(process.argv[3] ?? 123456);
if (!Number.isFinite(N) || !Number.isFinite(SEED) || N < 1) {
  throw new Error(`Usage: <runs> <seed>  e.g. 200 424242`);
}

const rng = makeRng(SEED);

const t0 = Date.now();
let totalSteps = 0;
let totalEvents = 0;

for (let i = 1; i <= N; i++) {
  const cfg = makeCfg(rng);
  const r = runOne(cfg, SEED);

  totalSteps += r.steps;
  totalEvents += r.events;

  if (i % 50 === 0) {
    const dt = (Date.now() - t0) / 1000;
    const sps = Math.floor(totalSteps / Math.max(dt, 1e-9));
    console.log(
      `ok ${i}/${N}  steps=${totalSteps}  events=${totalEvents}  steps/sec=${sps}`
    );
  }
}

const dt = (Date.now() - t0) / 1000;

console.log("FAST STRESS PASS", {
  seed: SEED,
  runs: N,
  seconds: dt,
  totalSteps,
  totalEvents,
  stepsPerSec: Math.floor(totalSteps / Math.max(dt, 1e-9)),
});
