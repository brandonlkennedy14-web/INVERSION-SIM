// src/main.ts
import fs from "node:fs";
import path from "node:path";

import {
  SquareInversionReflect,
  computeInversionStepFromStart,
} from "./variants/square_inversion_reflect.js";

import { runVariant, writeOutputs } from "./run.js";
import type { RunConfig } from "./types.js";

// ---------- paths ----------
const BASE_DIR = process.cwd(); // e.g. C:\\Users\\me\\Documents\\GitHub\\INVERSION-SIM
const RUNS_DIR = path.join(BASE_DIR, "runs");
const COUNTER_PATH = path.join(BASE_DIR, "run_counter.txt");

// ---------- helpers ----------
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readRunCounter(): number {
  // If you truly want "must exist" discipline, swap this for a throw.
  if (!fs.existsSync(COUNTER_PATH)) {
    // auto-init to 1 (first run will be run_000001)
    fs.writeFileSync(COUNTER_PATH, "1", "utf8");
    return 1;
  }

  const raw = fs.readFileSync(COUNTER_PATH, "utf8").trim();
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`run_counter.txt is invalid: "${raw}"`);
  }
  return n;
}

function writeRunCounter(n: number) {
  fs.writeFileSync(COUNTER_PATH, String(n), "utf8");
}

function formatRunName(n: number) {
  return `run_${String(n).padStart(6, "0")}`;
}

function allocateRunDir(): { runDir: string; runName: string } {
  ensureDir(RUNS_DIR);

  const n = readRunCounter();
  const runName = formatRunName(n);
  const runDir = path.join(RUNS_DIR, runName);

  if (fs.existsSync(runDir)) {
    // Safety: don't overwrite if counter drifted / user copied runs
    throw new Error(`Run directory already exists: ${runName} (${runDir})`);
  }

  fs.mkdirSync(runDir);

  // increment counter immediately (your append-only discipline)
  writeRunCounter(n + 1);

  return { runDir, runName };
}

function printSummary(args: {
  variantName: string;
  cfg: RunConfig;
  inversionStep: number;
  runDir: string;
  events: number;
}) {
  console.log("Variant:", args.variantName);
  console.log("Steps:", args.cfg.steps);
  console.log("InversionStep:", args.inversionStep);
  console.log("Grid:", `${args.cfg.sizeX}×${args.cfg.sizeY}`);
  console.log("Start:", `x0=${args.cfg.x0}, y0=${args.cfg.y0}`);
  console.log("Velocity:", `vx0=${args.cfg.vx0}, vy0=${args.cfg.vy0}`);
  console.log("Multiplier:", args.cfg.multiplier);
  console.log("Mod:", args.cfg.mod);
  console.log("Events:", args.events);
  console.log("Saved to:", args.runDir);
}

// ---------- config ----------

// Initialize constraint density counter
let constraintDensity: { [cell: string]: number } = {};

// Function to track density and compare against capacity
function trackDensityAndCheckCapacity(trajectories: any[], currentStep: number) {
  for (const trajectory of trajectories) {
    const cell = getCellForTrajectory(trajectory); 
    if (!constraintDensity[cell]) {
      constraintDensity[cell] = 0;
    }
    constraintDensity[cell]++;
  }

  // Capacity check and re-emergence trigger
  for (const cell in constraintDensity) {
    const density = constraintDensity[cell];
    const capacity = getCapacityForCell(cell); // Define this based on your geometry

    if (density > capacity) {
      // Trigger REEMERGENCE
      triggerReemergenceEvent(cell, currentStep);
    }
  }
}

// Define how you get the cell a trajectory is in
function getCellForTrajectory(trajectory: any): string {
  return `${trajectory.x}-${trajectory.y}`;
}

// Define the capacity of a cell (this can be dynamic depending on inversion geometry)
function getCapacityForCell(cell: string): number {
  return 1;  // Default capacity for now, you should scale it based on grid constraints
}

// Trigger a re-emergence event when density exceeds capacity
function triggerReemergenceEvent(cell: string, step: number) {
  console.log(`Re-emergence triggered at cell ${cell} during step ${step}`);
}

// ✅ multi inversion schedule (DO NOT set cfg.inversionStep)
const cfg: RunConfig = {
  sizeX: 5,
  sizeY: 7,
  x0: 1,
  y0: 1,
  vx0: 1,
  vy0: 1,
  phase0: 0,
  steps: 200003,
  multiplier: 7,
  mod: 1000003,
};

cfg.inversionSchedule = [
  { step: Math.floor(cfg.steps * 0.20), kind: "GEOM" },
  { step: Math.floor(cfg.steps * 0.40), kind: "SPHERE" },
  { step: Math.floor(cfg.steps * 0.60), kind: "OBSERVER" },
  { step: Math.floor(cfg.steps * 0.80), kind: "CAUSAL" },
];

console.log("Schedule:", cfg.inversionSchedule);

// ---------- main ----------
function main() {
  const { runDir, runName } = allocateRunDir();

  console.log("Variant:", SquareInversionReflect.name);
  console.log("Steps:", cfg.steps);
  console.log("InversionStep:", cfg.inversionStep);

  const result = runVariant(SquareInversionReflect, cfg);
  writeOutputs(runDir, runName, result, cfg);

  console.log("Simulation run complete");
  console.log(`Saved to: ${runDir}`);
  console.log(`Events: ${result.events.length}`);
  console.log(`Trajectory points: ${result.trajectory.length}`);
}

try {
  main();
} catch (err) {
  console.error("FATAL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
