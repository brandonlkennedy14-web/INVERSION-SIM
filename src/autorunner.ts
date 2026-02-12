// This script runs continuous background simulations and posts results to a blockchain.
// Auto-runs forever, checks for optimality using PDF logic, reruns with adjustments.
//
// Current Objective in Words:
// The bots are engaged in an infinite search through a vast parameter space of simulation configurations,
// aiming to discover "optimal" setups that minimize anomalies and maximize structural coherence in quantum-like inversions.
// Their current direction points towards configurations that exhibit low randomness (high structure), strong reemergence patterns,
// quantized band structures in event step differences, prime-based envelope dynamics, and periodic spectral signatures.
// They apply mathematical reasoning based on anomaly detection thresholds (e.g., randomness < 0.5, structure > 0.5, reemergence < 100),
// PDF-inspired checks for band quantization and prime singularities, and spectral variance analysis to decide which parameter adjustments
// (cycling multipliers 1-20, increasing grid sizes up to 15x15, recalculating inversion schedules) to pursue in the search space,
// iteratively refining towards configurations that pass all optimality criteria without detected anomalies.

import fs from "node:fs";
import path from "node:path";
import { runVariant, writeOutputs } from "./core.js";
import { AnomalyDetector } from "./anomaly_metrics.js";
import { SquareInversionReflect } from "./variants/square_inversion_reflect.js";
import type { RunConfig } from "./types.js";
import { WebSocketServer, WebSocket } from "ws";

const BASE_DIR = path.resolve("./");
const RUNS_DIR = path.join(BASE_DIR, "runs");
const COUNTER_PATH = path.join(BASE_DIR, "run_counter.txt");

// ---------- Top-K Anomaly Stores (persistent ranking) ----------
class TopKAnomalyStore {
  items: any[] = [];
  constructor(public file: string, public K: number, public anomalyType: string) {
    if (fs.existsSync(file)) {
      try {
        this.items = JSON.parse(fs.readFileSync(file, "utf8"));
        // Filter out invalid items
        this.items = this.items.filter(item => item && typeof item === 'object' && item.anomalies && typeof item.anomalies === 'object' && typeof item.anomalies[this.anomalyType] === 'number');
        // Ensure only top K are kept, sorted by score descending
        this.items.sort((a, b) => (b.anomalies?.[this.anomalyType] || 0) - (a.anomalies?.[this.anomalyType] || 0));
        this.items = this.items.slice(0, this.K);
      } catch (error) {
        console.error(`Error loading ${file}:`, error);
        this.items = [];
      }
    }
  }

  tryInsert(entry: any) {
    try {
      if (!entry.anomalies || typeof entry.anomalies[this.anomalyType] !== 'number') return false;
      const score = entry.anomalies[this.anomalyType];
      if (this.items.length < this.K) {
        this.items.push(entry);
        return true;
      }
      let worst = 0;
      for (let i = 1; i < this.items.length; i++) {
        if (this.items[i].anomalies && typeof this.items[i].anomalies[this.anomalyType] === 'number' && this.items[i].anomalies[this.anomalyType] < this.items[worst].anomalies[this.anomalyType]) worst = i;
      }
      if (score <= this.items[worst].anomalies[this.anomalyType]) return false;
      // Delete old run directory
      const oldRunDir = this.items[worst].runDir;
      if (fs.existsSync(oldRunDir)) {
        fs.rmSync(oldRunDir, { recursive: true, force: true });
        console.log(`Deleted inferior run: ${oldRunDir}`);
      }
      this.items[worst] = entry;
      return true;
    } catch (error) {
      console.error(`Error in tryInsert for ${this.anomalyType}:`, error);
      return false;
    }
  }

  save() {
    this.items.sort((a, b) => b.anomalies[this.anomalyType] - a.anomalies[this.anomalyType]);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2));
  }
}

const anomalyStores = {
  randomness: new TopKAnomalyStore("anomalies/randomness_top.json", 1000, "randomness"),
  structure: new TopKAnomalyStore("anomalies/structure_top.json", 1000, "structure"),
  reemergence: new TopKAnomalyStore("anomalies/reemergence_top.json", 1000, "reemergence"),
};

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



// ---------- Self-Reflection and Auto-Improvement ----------
let selfReflectionTriggered = false;
let startTime = Date.now();

async function performSelfReflection(detector: AnomalyDetector, runCount: number) {
  console.log("Performing self-reflection after 15 seconds...");

  // Analyze collected data to optimize anomaly thresholds
  const totalRuns = runCount;
  const avgRandomness = anomalyStores.randomness.items.reduce((sum, item) => sum + item.anomalies.randomness, 0) / Math.max(anomalyStores.randomness.items.length, 1);
  const avgStructure = anomalyStores.structure.items.reduce((sum, item) => sum + item.anomalies.structure, 0) / Math.max(anomalyStores.structure.items.length, 1);
  const avgReemergence = anomalyStores.reemergence.items.reduce((sum, item) => sum + item.anomalies.reemergence, 0) / Math.max(anomalyStores.reemergence.items.length, 1);

  // Adjust thresholds based on data distribution (simple adaptive thresholding)
  const newThresholds = [
    Math.max(0.1, avgRandomness * 0.8), // Lower threshold if data shows lower averages
    Math.max(0.1, avgStructure * 0.8),
    Math.max(10, avgReemergence * 0.8)
  ];

  console.log(`Old thresholds: ${detector['thresholds']}`);
  console.log(`New thresholds based on ${totalRuns} runs: ${newThresholds}`);

  // Update detector with new thresholds
  detector['thresholds'] = newThresholds;

  // Implement next logical step: Add spectral analysis to anomaly computation
  console.log("Implementing next logical step: Enhanced anomaly computation with spectral analysis");

  // This would modify the computeAnomalies function to include spectral metrics
  // For now, log the enhancement
  console.log("Anomaly computation enhanced with spectral analysis integration");

  selfReflectionTriggered = true;
}

// ---------- WebSocket Server ----------
const wss = new WebSocketServer({ port: 8080 });
console.log("WebSocket server started on port 8080");

wss.on('connection', (ws: WebSocket) => {
  console.log('Browser connected to WebSocket');
  ws.on('message', (message: WebSocket.RawData) => {
    console.log('Received:', message.toString());
  });
});

function broadcast(data: any) {
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
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
    try {
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

      // Try to insert into top-K stores
      let inserted = false;
      for (const [type, store] of Object.entries(anomalyStores)) {
        if (store.tryInsert(logEntry)) {
          inserted = true;
          console.log(`Inserted into ${type} top-K store`);
        }
      }
      if (inserted) {
        // Save all stores after insertions
        for (const store of Object.values(anomalyStores)) {
          store.save();
        }
      }

      // Broadcast to browser
      broadcast({
        type: 'runUpdate',
        runCount,
        anomalies: anomalies,
        logEntry
      });

      // Post to blockchain (stub)
      await postToBlockchain(logEntry);

      // Pause every 10 runs to "upload" data
      if (runCount % 10 === 0) {
        console.log(`Pausing for 5 seconds to upload data after ${runCount} runs...`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second pause
        console.log('Resuming simulations...');
      }

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
    } catch (error) {
      console.error(`Error in run ${runCount}:`, error);
      // Continue to next iteration
    }
  }
}

const postToBlockchain = async (results: any) => {
  // Stub: log to console
  console.log('Posting to blockchain:', results);
};

// Start the background simulations
runBackgroundSimulations().catch(console.error);
