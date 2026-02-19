// src/main.ts
import { createClient } from '@supabase/supabase-js'

// 1. Initialize Supabase with your credentials
const supabaseUrl = 'https://xoolmbmnzbsvcqeyqvyi.supabase.co'
const supabaseKey = 'sb_publishable_A1cLFAKbAg77TfTkD2RB-w_PahU316T'
const supabase = createClient(supabaseUrl, supabaseKey)

async function runDistributedJob() {
  // 2. Fetch a pending job (RPC or single select)
  // We'll grab one job that hasn't been started yet
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'pending')
    .limit(1)
    .single()

  if (error || !job) {
    console.log("No jobs available or error:", error)
    return
  }

  // 3. Lock the job so other users don't grab it
  await supabase
    .from('jobs')
    .update({ status: 'processing', started_at: new Date() })
    .eq('id', job.id)

  try {
    // 4. Run your simulation (insert your actual sim function here)
    const result = await runSimulation(job.payload)

    // 5. Submit results and mark as completed
    await supabase
      .from('jobs')
      .update({ 
        status: 'completed', 
        result: result, 
        completed_at: new Date() 
      })
      .eq('id', job.id)

    console.log(`Job ${job.id} completed successfully!`)
  } catch (err) {
    // If the sim fails, put it back to pending
    await supabase
      .from('jobs')
      .update({ status: 'pending' })
      .eq('id', job.id)
  }
}
import {runNextJob} from'./coordinator'
import fs from "node:fs";
import path from "node:path";
import { TopologyRenderer } from './visualization/TopologyRenderer.js';

import {
  SquareInversionReflect,
  computeInversionStepFromStart,
} from "./variants/square_inversion_reflect.js";

import { runVariant, writeOutputs } from "./run.js";
import type { RunConfig } from "./types.js";

// ---------- paths ----------
const BASE_DIR = process.cwd(); // e.g. C:\Users\me\Documents\GitHub\INVERSION-SIM
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
```typescript
//... (keep your existing imports and helpers)...

async function startWorker() {
 console.log("🚀 Worker Node Online. Connecting to Swarm...");

 // Loop forever to keep processing jobs
 while (true) {
 
 // Pass the simulation logic to the coordinator
 await runNextJob(async (config: RunConfig) => {
 
 // 1. Setup local run directory
 const runId = readRunCounter();
 const runName = `run_${String(runId).padStart(6, '0')}`;
 const outDir = path.join(RUNS_DIR, runName);
 ensureDir(outDir);
 
 // Increment local counter
 fs.writeFileSync(COUNTER_PATH, (runId + 1).toString(), "utf8");
 console.log(`⚙️ Processing Job in: ${outDir}`);

 // 2. Configure and Run the Variant
 const variant = new SquareInversionReflect(config);
 
 // Run the simulation
 const result = await runVariant(variant, config, outDir);
 
 return result || { status: "done", outDir };
 });

 // Wait 5 seconds before checking again
 await new Promise(r => setTimeout(r, 5000));
 }
}

// Start the worker
startWorker().catch(err => console.error("Fatal Worker Error:", err));
```
// ---------- config ----------
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

// ✅ multi inversion schedule (DO NOT set cfg.inversionStep)
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

  // Visualize the results
  const renderer = new TopologyRenderer(document.body);
  renderer.renderGrid(result.trajectory, cfg.sizeX, cfg.sizeY);
  renderer.renderTrajectory(result.trajectory);
  renderer.renderEvents(result.events);
  renderer.renderInversions(result.trajectory);
}

try {
  main();
} catch (err) {
  console.error("FATAL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
}

