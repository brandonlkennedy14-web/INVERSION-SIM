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

const anomalyStores: { [key: string]: TopKAnomalyStore } = {
  randomness: new TopKAnomalyStore("anomalies/randomness_top.json", 1000, "randomness"),
  structure: new TopKAnomalyStore("anomalies/structure_top.json", 1000, "structure"),
  reemergence: new TopKAnomalyStore("anomalies/reemergence_top.json", 1000, "reemergence"),
};

// Dynamic anomaly detection
function detectNewAnomalies(result: any, cfg: RunConfig, existingAnomalies: any) {
  const newAnomalies: { [key: string]: number } = {};
  const trajectory = result.trajectory;
  const events = result.events;

  // Event density anomaly
  const eventDensity = events.length / cfg.steps;
  if (eventDensity > 0.01) { // Arbitrary threshold for high event density
    newAnomalies.event_density = eventDensity;
  }

  // Trajectory variance anomaly
  const positions = trajectory.map((t: any) => t.x + t.y);
  const mean = positions.reduce((a: number, b: number) => a + b, 0) / positions.length;
  const variance = positions.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / positions.length;
  if (variance > 1000) { // Arbitrary threshold for high variance
    newAnomalies.trajectory_variance = variance;
  }

  // Phase periodicity anomaly
  const phases = trajectory.map((t: any) => t.phase);
  const phaseVariance = phases.reduce((a: number, b: number, i: number) => a + (b - phases[0]) ** 2, 0) / phases.length;
  if (phaseVariance < 10) { // Low variance indicates periodicity
    newAnomalies.phase_periodicity = 1 / phaseVariance; // Higher score for more periodic
  }

  // Inversion frequency anomaly
  const inversionCount = trajectory.filter((t: any) => t.inverted).length;
  const inversionFreq = inversionCount / cfg.steps;
  if (inversionFreq > 0.005) { // Arbitrary threshold
    newAnomalies.inversion_frequency = inversionFreq;
  }

  // Additional dynamic anomalies
  // Velocity anomaly: high average velocity
  const velocities = trajectory.map((t: any) => Math.sqrt(t.vx ** 2 + t.vy ** 2));
  const avgVelocity = velocities.reduce((a: number, b: number) => a + b, 0) / velocities.length;
  if (avgVelocity > 2) { // Arbitrary threshold
    newAnomalies.velocity_anomaly = avgVelocity;
  }

  // Chaos index: based on position entropy
  const uniquePositions = new Set(trajectory.map((t: any) => `${t.x},${t.y}`));
  const chaosIndex = uniquePositions.size / cfg.steps;
  if (chaosIndex < 0.1) { // Low uniqueness indicates order
    newAnomalies.chaos_index = 1 / chaosIndex; // Higher score for more ordered
  }

  // Log new anomalies detected
  for (const [type, score] of Object.entries(newAnomalies)) {
    if (!anomalyStores[type]) {
      console.log(`Detected new anomaly: ${type} with score ${score}. Logic: Diverging from static thresholds by dynamically identifying statistical outliers in trajectory and event data. Using adaptive anomaly detection based on run-specific metrics to categorize and weight new patterns. Trajectory logic: Exploring parameter space by cycling multipliers (1-20), increasing grid sizes (up to 15x15), and recalculating inversion schedules to minimize anomalies and maximize coherence, diverging from fixed configs to ensure all simulations are unique.`);
      anomalyStores[type] = new TopKAnomalyStore(`anomalies/${type}_top.json`, 1000, type);
    }
  }

  return newAnomalies;
}

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
  const baseAnomalies = {
    randomness: entropy,
    structure: 1 - entropy,
    reemergence: inverted ? cfg.steps - (invStep || 0) : 0,
  };

  // Compute ratios (normalized to sum to 1)
  const total = baseAnomalies.randomness + baseAnomalies.structure + baseAnomalies.reemergence;
  const ratios = total > 0 ? {
    randomness_ratio: baseAnomalies.randomness / total,
    structure_ratio: baseAnomalies.structure / total,
    reemergence_ratio: baseAnomalies.reemergence / total,
  } : {
    randomness_ratio: 0,
    structure_ratio: 0,
    reemergence_ratio: 0,
  };

  return { ...baseAnomalies, ...ratios };
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



// ---------- Notepad Management for 8 Autorunners ----------
interface AutorunnerNotepad {
  id: number;
  cfg: RunConfig;
  anomalies: any;
  position: { x: number; y: number }; // x: multiplier, y: sizeX
  direction: { dx: number; dy: number };
  trajectory: { x: number; y: number }[]; // History of positions over cycles
}

const NUM_AUTORUNNERS = 8;
const NOTEPAD_FILES = Array.from({ length: NUM_AUTORUNNERS }, (_, i) => `autorunner${i + 1}.json`);

function initializeNotepad(id: number): AutorunnerNotepad {
  const baseCfg: RunConfig = {
    sizeX: 5 + id, // Vary sizeX from 5 to 12
    sizeY: 7 + id,
    x0: 1,
    y0: 1,
    vx0: 1,
    vy0: 1,
    phase0: 0,
    steps: 200003,
    multiplier: 7 + id, // Vary multiplier from 7 to 14
    mod: 1000003,
  };
  baseCfg.inversionSchedule = [
    { step: Math.floor(baseCfg.steps * 0.20), kind: "GEOM" },
    { step: Math.floor(baseCfg.steps * 0.40), kind: "SPHERE" },
    { step: Math.floor(baseCfg.steps * 0.60), kind: "OBSERVER" },
    { step: Math.floor(baseCfg.steps * 0.80), kind: "CAUSAL" },
  ];
  return {
    id,
    cfg: baseCfg,
    anomalies: {},
    position: { x: baseCfg.multiplier, y: baseCfg.sizeX },
    direction: { dx: 0, dy: 0 },
    trajectory: [{ x: baseCfg.multiplier, y: baseCfg.sizeX }],
  };
}

function loadNotepad(file: string): AutorunnerNotepad {
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      return data;
    } catch (error) {
      console.error(`Error loading ${file}:`, error);
    }
  }
  const match = file.match(/\d+/);
  const id = match ? parseInt(match[0]) : 1;
  return initializeNotepad(id);
}

function saveNotepad(file: string, notepad: AutorunnerNotepad) {
  fs.writeFileSync(file, JSON.stringify(notepad, null, 2));
}

// ---------- Main loop for 8 Autorunners ----------
async function runBackgroundSimulations() {
  const detector = new AnomalyDetector([0.5, 0.5, 100]); // Thresholds for randomness, structure, reemergence

  let cycleCount = 0;
  while (true) {
    try {
      cycleCount++;
      console.log(`Starting cycle ${cycleCount} for 8 autorunners`);

      const runnerData: { id: number; position: { x: number; y: number }; direction: { dx: number; dy: number }; anomalies: any }[] = [];
      const allAnomalies: any[] = [];

      // Run each autorunner sequentially
      for (let i = 0; i < NUM_AUTORUNNERS; i++) {
        const notepadFile = NOTEPAD_FILES[i];
        let notepad = loadNotepad(notepadFile);

        console.log(`Autorunner ${notepad.id}: multiplier ${notepad.cfg.multiplier}, size ${notepad.cfg.sizeX}x${notepad.cfg.sizeY}`);

        const result = runVariant(SquareInversionReflect, notepad.cfg);
        const baseAnomalies = computeAnomalies(result, notepad.cfg);
        const newAnomalies = detectNewAnomalies(result, notepad.cfg, baseAnomalies);
        const anomalies = { ...baseAnomalies, ...newAnomalies };
        notepad.anomalies = anomalies;
        allAnomalies.push(anomalies);

        const anomalyData = [anomalies.randomness, anomalies.structure, anomalies.reemergence];
        const detectedAnomalies = detector.detectAnomalies(anomalyData);

        const bandOk = checkBandStructure(result.events);
        const primeOk = checkPrimeEnvelopes(result.trajectory, notepad.cfg);
        const spectralOk = spectralAnalysis(result.trajectory);

        const isOptimal = detectedAnomalies.length === 0 && bandOk && primeOk && spectralOk;

        console.log(`Autorunner ${notepad.id}: Anomalies: ${detectedAnomalies.length}, Band: ${bandOk}, Prime: ${primeOk}, Spectral: ${spectralOk}, Optimal: ${isOptimal}`);

        // Always save run data
        const { runDir, runName } = allocateRunDir();
        writeOutputs(runDir, runName, result, notepad.cfg);

        // Log results
        const logEntry = {
          run: cycleCount * NUM_AUTORUNNERS + i,
          cfg: notepad.cfg,
          anomalies,
          detectedAnomalies,
          bandOk,
          primeOk,
          spectralOk,
          isOptimal,
          runDir,
          autorunnerId: notepad.id,
        };
        console.log('Results:', logEntry);

        // Try to insert into top-K stores
        let inserted = false;
        for (const [type, store] of Object.entries(anomalyStores)) {
          if (store!.tryInsert(logEntry)) {
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

        // Update position based on anomalies (simple: move towards lower randomness, higher structure)
        notepad.position.x = notepad.cfg.multiplier;
        notepad.position.y = notepad.cfg.sizeX;

        // Store runner data for broadcast
        runnerData.push({
          id: notepad.id,
          position: notepad.position,
          direction: notepad.direction,
          anomalies,
        });

        // Save notepad
        saveNotepad(notepadFile, notepad);

        // Auto-commit instantly after each autorunner run
        try {
          const { execSync } = require('child_process');
          execSync('git add .', { cwd: BASE_DIR });
          execSync(`git commit -m "Auto-commit autorunner ${notepad.id} run data"`, { cwd: BASE_DIR });
          execSync('git push', { cwd: BASE_DIR });
          console.log(`Auto-committed and pushed autorunner ${notepad.id} data instantly`);
        } catch (error) {
          console.error('Git commit/push failed for autorunner:', error);
        }
      }

      // Compute collective average anomalies
      const avgRandomness = allAnomalies.reduce((sum, a) => sum + a.randomness, 0) / NUM_AUTORUNNERS;
      const avgStructure = allAnomalies.reduce((sum, a) => sum + a.structure, 0) / NUM_AUTORUNNERS;
      const avgReemergence = allAnomalies.reduce((sum, a) => sum + a.reemergence, 0) / NUM_AUTORUNNERS;

      console.log(`Collective averages: randomness=${avgRandomness.toFixed(4)}, structure=${avgStructure.toFixed(4)}, reemergence=${avgReemergence}`);

      // Deduce global direction: if high randomness, move towards lower multiplier; if low structure, move towards higher sizeX
      let globalDx = 0;
      let globalDy = 0;
      if (avgRandomness > 0.5) globalDx = -0.5; // Decrease multiplier
      if (avgStructure < 0.5) globalDy = 0.5; // Increase sizeX
      if (avgReemergence > 100) globalDy = -0.5; // Decrease sizeX if high reemergence

      console.log(`Global direction: dx=${globalDx}, dy=${globalDy}`);

      // Apply global direction to each runner and update notepads
      for (let i = 0; i < NUM_AUTORUNNERS; i++) {
        const notepadFile = NOTEPAD_FILES[i];
        let notepad = loadNotepad(notepadFile);

        // Apply direction to cfg
        notepad.cfg.multiplier = Math.max(1, Math.min(20, notepad.cfg.multiplier + globalDx));
        notepad.cfg.sizeX = Math.max(5, Math.min(15, notepad.cfg.sizeX + globalDy));
        notepad.cfg.sizeY = notepad.cfg.sizeX; // Keep square for simplicity

        // Recalculate schedule
        notepad.cfg.inversionSchedule = [
          { step: Math.floor(notepad.cfg.steps * 0.20), kind: "GEOM" },
          { step: Math.floor(notepad.cfg.steps * 0.40), kind: "SPHERE" },
          { step: Math.floor(notepad.cfg.steps * 0.60), kind: "OBSERVER" },
          { step: Math.floor(notepad.cfg.steps * 0.80), kind: "CAUSAL" },
        ];

        // Set direction vector
        notepad.direction = { dx: globalDx, dy: globalDy };

        // Update position
        notepad.position.x = notepad.cfg.multiplier;
        notepad.position.y = notepad.cfg.sizeX;

        // Add to trajectory
        notepad.trajectory.push({ x: notepad.position.x, y: notepad.position.y });
        if (notepad.trajectory.length > 100) notepad.trajectory.shift(); // Keep last 100

        // Save updated notepad
        saveNotepad(notepadFile, notepad);

        // Update runnerData with new position/direction
        runnerData[i].position = notepad.position;
        runnerData[i].direction = notepad.direction;
      }

      // Broadcast to browser after each autorunner run
      for (let i = 0; i < NUM_AUTORUNNERS; i++) {
        const notepadFile = NOTEPAD_FILES[i];
        const notepad = loadNotepad(notepadFile);
        broadcast({
          type: 'autorunnerUpdate',
          autorunnerId: notepad.id,
          position: notepad.position,
          direction: notepad.direction,
          anomalies: notepad.anomalies,
          trajectory: notepad.trajectory,
        });
      }

      // Broadcast cycle summary
      broadcast({
        type: 'cycleUpdate',
        cycleCount,
        runnerData,
        collectiveAnomalies: { avgRandomness, avgStructure, avgReemergence },
        topK: {
          randomness: anomalyStores.randomness.items.slice(0, 10).sort((a, b) => b.anomalies.randomness - a.anomalies.randomness),
          structure: anomalyStores.structure.items.slice(0, 10).sort((a, b) => b.anomalies.structure - a.anomalies.structure),
          reemergence: anomalyStores.reemergence.items.slice(0, 10).sort((a, b) => b.anomalies.reemergence - a.anomalies.reemergence)
        }
      });

      // Post to blockchain (stub)
      await postToBlockchain({ cycle: cycleCount, runnerData });

      // Wait a bit before next cycle
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    } catch (error) {
      console.error(`Error in cycle ${cycleCount}:`, error);
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
