import { runVariant } from "./run.js";
import { SquareInversionReflect, computeInversionStepFromStart } from "./variants/square_inversion_reflect.js";
import type { RunConfig } from "./types.js";
import fs from "node:fs";
import path from "node:path";

/* ---------------- RNG ---------------- */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function randInt(rng: () => number, a: number, b: number) {
  return a + ((rng() * (b - a + 1)) | 0);
}

/* ---------------- Top-K store ---------------- */
class TopKStore<T extends { score: number }> {
  items: T[] = [];
  constructor(public file: string, public K: number) {
    if (fs.existsSync(file)) {
      this.items = JSON.parse(fs.readFileSync(file, "utf8"));
    }
  }

  tryInsert(e: T) {
    if (this.items.length < this.K) {
      this.items.push(e);
      return;
    }
    let worst = 0;
    for (let i = 1; i < this.items.length; i++) {
      if (this.items[i].score < this.items[worst].score) worst = i;
    }
    if (e.score <= this.items[worst].score) return;
    this.items[worst] = e;
  }

  save() {
    this.items.sort((a, b) => b.score - a.score);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2));
  }
}

/* ---------------- Stores ---------------- */
const stores = {
  randomness: new TopKStore<any>("anomalies/randomness_top.json", 1000),
  structure: new TopKStore<any>("anomalies/structure_top.json", 1000),
  reemergence: new TopKStore<any>("anomalies/reemergence_top.json", 1000),
  tfast: new TopKStore<any>("anomalies/tstruct_fastest.json", 1000),
  tslow: new TopKStore<any>("anomalies/tstruct_slowest.json", 1000),
};

/* ---------------- One run ---------------- */
function runOne(runIndex: number, cfg: RunConfig, seed: number) {
  cfg.inversionStep = computeInversionStepFromStart(cfg);
  const result = runVariant(SquareInversionReflect, cfg);

  const inv = cfg.inversionStep!;
  const traj: any[] = result.trajectory;

  const inverted = traj[inv]?.inverted === true;

  const entropy = result.events.length / Math.max(cfg.steps, 1);

  const report = {
    runIndex,
    seed,
    cfg,
    inversionStep: inv,
    eventsCount: result.events.length,
    anomaly: {
      randomness: { maxEntropy: entropy },
      structure: { repeatRate: 1 - entropy },
      reemergence: { reemerges: inverted },
      timeToStructure: { t_struct: inverted ? inv : null },
    },
  };

  stores.randomness.tryInsert({ score: report.anomaly.randomness.maxEntropy, report });
  stores.structure.tryInsert({ score: report.anomaly.structure.repeatRate, report });
  if (inverted) stores.reemergence.tryInsert({ score: cfg.steps - inv, report });
  if (inv !== null) {
    stores.tfast.tryInsert({ score: -inv, report });
    stores.tslow.tryInsert({ score: inv, report });
  }

  return report;
}

/* ---------------- Main ---------------- */
const N = Number(process.argv[2] ?? 100);
const SEED = Number(process.argv[3] ?? 123456);

if (!Number.isFinite(N) || !Number.isFinite(SEED)) {
  throw new Error("Usage: npx tsx src/stress.ts <runs> <seed>");
}

const rng = makeRng(SEED);
const catalog: any[] = [];

for (let i = 1; i <= N; i++) {
  const cfg: RunConfig = {
    sizeX: randInt(rng, 3, 15),
    sizeY: randInt(rng, 3, 15),
    x0: randInt(rng, 0, 5),
    y0: randInt(rng, 0, 5),
    vx0: randInt(rng, -2, 2) || 1,
    vy0: randInt(rng, -2, 2) || 1,
    phase0: 0,
    steps: randInt(rng, 100, 5000),
    multiplier: randInt(rng, 2, 20),
    mod: 1000003,
  };

  const r = runOne(i, cfg, SEED);
  catalog.push(r);

  if (i % 10 === 0) {
    console.log("ok", { i, steps: cfg.steps, inv: r.inversionStep, events: r.eventsCount });
  }
}

Object.values(stores).forEach(s => s.save());
console.log("DONE");
