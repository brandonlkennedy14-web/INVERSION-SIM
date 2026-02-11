// This script runs continuous background simulations and posts results to a blockchain.
// Auto-runs forever, checks for optimality using PDF logic, reruns with adjustments.

import fs from "node:fs";
import path from "node:path";
import { runVariant, writeOutputs } from "./core.js";
import { AnomalyDetector } from "./anomaly_metrics.js";
import { SquareInversionReflect } from "./variants/square_inversion_reflect.js";
import type { RunConfig } from "./types.js";

// ---------- paths ----------
const BASE_DIR = path.resolve("../Documents/GitHub/INVERSION-SIM"); // Adjust if needed
const RUNS_DIR = path.join(BASE_DIR, "runs");
const COUNTER_PATH = path.join(BASE_DIR, "run_counter.txt");

// ---------- helpers ----------
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readRunCounter(): number {
  if (!fs.existsSync(COUNTER_PATH)) {
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
    throw new Error(`Run directory already exists: ${runName} (${runDir})`);
  }
  fs.mkdirSync(runDir);
  writeRunCounter(n + 1);
  return { runDir, runName };
}

// ---------- PDF-inspired optimization checks ----------
function checkBandStructure(events: any[]): boolean {
  // Check if event step differences are quantized (band structure like in Corner-Event Band Structure PDF)
  if (events.length < 2) return false;
  const diffs = [];
  for (let i = 1; i < events.length; i++) {
    diffs.push(events[i].step - events[i-1].step);
  }
  // Check if diffs are multiples of some small number (quantized bands)
  const minDiff = Math.min(...diffs);
  const quantized = diffs.every(d => d % minDiff === 0);
  return quantized;
}

function checkPrimeEnvelopes(trajectory: any[], cfg: RunConfig): boolean {
  // Check for prime singularities (envelopes, dynamics from Primes as Singularities PDF)
  // Simple check: look for phase/position patterns at prime steps
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23]; // small primes
  let envelopeCount = 0;
  for (const p of primes) {
    if (p < cfg.steps) {
      const point = trajectory[p];
      if (point && (point.phase % p === 0 || point.x % p === 0 || point.y % p === 0)) {
        envelopeCount++;
      }
    }
  }
  return envelopeCount > primes.length / 2; // At least half match
}

function spectralAnalysis(trajectory: any[]): boolean {
  // Simple spectral analysis: check for periodicity in phases (FFT-like, from PDFs)
  // Compute autocorrelation or simple frequency check
  const phases = trajectory.map(p => p.phase);
  if (phases.length < 10) return false;
  // Simple check: variance of phases should be low if periodic
  const mean = phases.reduce((a, b) => a + b, 0) / phases.length;
  const variance = phases.reduce((a, b) => a + (b - mean) ** 2, 0) / phases.length;
  return variance < 1; // Arbitrary threshold for "structured" spectrum
}

// ---------- Anomaly computation (like stress.ts) ----------
function computeAnomalies(result: any, cfg: RunConfig) {
  const entropy = result.events.length / Math.max(cfg.steps, 1);
  const inverted = result.trajectory.some((t: any) => t.inverted);
  const invStep = cfg.inversionStep || cfg.inversionSchedule?.[0]?.step || null;
  return {
    randomness: entropy,
    structure: 1 - entropy,
    reemergence: inverted ? cfg.steps - (invStep || 0) : 0,
  };
}

// ---------- Main loop ----------
async function runBackgroundSimulations() {
  let cfg: RunConfig = {
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

  const detector = new AnomalyDetector([0.5, 0.5, 100]); // Thresholds for randomness, structure, reemergence

  let runCount = 0;
  while (true) {
    runCount++;
    console.log(`Starting run ${runCount} with multiplier ${cfg.multiplier}, size ${cfg.sizeX}x${cfg.sizeY}`);

    const result = runVariant(SquareInversionReflect, cfg);
    const anomalies = computeAnomalies(result, cfg);
    const anomalyData = [anomalies.randomness, anomalies.structure, anomalies.reemergence];
    const detectedAnomalies = detector.detectAnomalies(anomalyData);

    const bandOk = checkBandStructure(result.events);
    const primeOk = checkPrimeEnvelopes(result.trajectory, cfg);
    const spectralOk = spectralAnalysis(result.trajectory);

    const isOptimal = detectedAnomalies.length === 0 && bandOk && primeOk && spectralOk;

    console.log(`Run ${runCount}: Anomalies: ${detectedAnomalies.length}, Band: ${bandOk}, Prime: ${primeOk}, Spectral: ${spectralOk}, Optimal: ${isOptimal}`);

    // Always save, but log optimality
    const { runDir, runName } = allocateRunDir();
    writeOutputs(runDir, runName, result, cfg);

    // Log results
    const logEntry = {
      run: runCount,
      cfg,
      anomalies,
      detectedAnomalies,
      bandOk,
      primeOk,
      spectralOk,
      isOptimal,
      runDir,
    };
    console.log('Results:', logEntry);

    // Post to blockchain (stub)
    await postToBlockchain(logEntry);

    // Adjust config if not optimal
    if (!isOptimal) {
      cfg.multiplier = (cfg.multiplier % 20) + 1; // Cycle multiplier
      cfg.sizeX = Math.min(cfg.sizeX + 1, 15);
      cfg.sizeY = Math.min(cfg.sizeY + 1, 15);
      // Recalculate schedule
      cfg.inversionSchedule = [
        { step: Math.floor(cfg.steps * 0.20), kind: "GEOM" },
        { step: Math.floor(cfg.steps * 0.40), kind: "SPHERE" },
        { step: Math.floor(cfg.steps * 0.60), kind: "OBSERVER" },
        { step: Math.floor(cfg.steps * 0.80), kind: "CAUSAL" },
      ];
    }

    // Wait a bit before next run (optional, since infinite loop)
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
  }
}

const postToBlockchain = async (results) => {
  // Stub: log to console
  console.log('Posting to blockchain:', results);
};

// Start the background simulations
runBackgroundSimulations().catch(console.error);
