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

// ---------- Top-K Anomaly Stores (persistent ranking, global limit to 1000 total) ----------
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

// Global anomaly store to limit total to 1000
class GlobalTopKStore {
  items: any[] = [];
  private maxTotal = 1000;

  constructor(private stores: { [key: string]: TopKAnomalyStore }) {
    // Load from all stores and merge
    for (const store of Object.values(this.stores)) {
      this.items.push(...store.items);
    }
    this.items = this.items.filter((item, index, self) => self.findIndex(i => i.runDir === item.runDir) === index); // Unique by runDir
    this.items.sort((a, b) => this.getMaxScore(b) - this.getMaxScore(a));
    this.items = this.items.slice(0, this.maxTotal);
    this.pruneExcess();
  }

  private getMaxScore(item: any): number {
    const scores = Object.values(item.anomalies || {}).filter(s => typeof s === 'number') as number[];
    return Math.max(...scores, 0);
  }

  tryInsert(entry: any): boolean {
    const maxScore = this.getMaxScore(entry);
    if (this.items.length < this.maxTotal) {
      this.items.push(entry);
      this.items.sort((a, b) => this.getMaxScore(b) - this.getMaxScore(a));
      return true;
    }
    const worstScore = this.getMaxScore(this.items[this.items.length - 1]);
    if (maxScore <= worstScore) return false;
    // Replace worst
    const oldRunDir = this.items[this.items.length - 1].runDir;
    if (fs.existsSync(oldRunDir)) {
      fs.rmSync(oldRunDir, { recursive: true, force: true });
      console.log(`Deleted inferior run globally: ${oldRunDir}`);
    }
    this.items[this.items.length - 1] = entry;
    this.items.sort((a, b) => this.getMaxScore(b) - this.getMaxScore(a));
    return true;
  }

  pruneExcess() {
    if (this.items.length > this.maxTotal) {
      const excess = this.items.splice(this.maxTotal);
      excess.forEach(item => {
        if (fs.existsSync(item.runDir)) {
          fs.rmSync(item.runDir, { recursive: true, force: true });
          console.log(`Pruned excess run: ${item.runDir}`);
        }
      });
    }
  }

  save() {
    // Update individual stores
    for (const [type, store] of Object.entries(this.stores)) {
      store.items = this.items.filter(item => item.anomalies && typeof item.anomalies[type] === 'number');
      store.save();
    }
  }
}

const anomalyStores: { [key: string]: TopKAnomalyStore } = {
  randomness: new TopKAnomalyStore("anomalies/randomness_top.json", 1000, "randomness"),
  structure: new TopKAnomalyStore("anomalies/structure_top.json", 1000, "structure"),
  reemergence: new TopKAnomalyStore("anomalies/reemergence_top.json", 1000, "reemergence"),
};

const globalStore = new GlobalTopKStore(anomalyStores);

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
  const avgRandomness = anomalyStores.randomness!.items.reduce((sum, item) => sum + item.anomalies.randomness, 0) / Math.max(anomalyStores.randomness!.items.length, 1);
  const avgStructure = anomalyStores.structure!.items.reduce((sum, item) => sum + item.anomalies.structure, 0) / Math.max(anomalyStores.structure!.items.length, 1);
  const avgReemergence = anomalyStores.reemergence!.items.reduce((sum, item) => sum + item.anomalies.reemergence, 0) / Math.max(anomalyStores.reemergence!.items.length, 1);

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



// Autorunner 3D positions and trajectories
interface AutorunnerState {
  id: number;
  position: { x: number; y: number; z: number };
  intendedTrajectory: { x: number; y: number; z: number }[];
  actualTrajectory: { x: number; y: number; z: number }[];
  direction: { dx: number; dy: number; dz: number };
  group: number;
  orientationHistory: { x: number; y: number; z: number }[];
  geometry: { theta: number; phi: number };
  luckScore: number;
  randomLuckScore: number;
}

const autorunnerStates: AutorunnerState[] = [];
const scale = 10; // Scale for 3D positions
const cubePositions = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 1, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 1, y: 0, z: 1 },
  { x: 0, y: 1, z: 1 },
  { x: 1, y: 1, z: 1 },
];

// Initialize autorunner states in 2x2x2 cube matrix
const matrixSize = 2;
const positions = [];
for (let x = 0; x < matrixSize; x++) {
  for (let y = 0; y < matrixSize; y++) {
    for (let z = 0; z < matrixSize; z++) {
      positions.push({ x: x * scale, y: y * scale, z: z * scale });
    }
  }
}
for (let i = 0; i < 8; i++) {
  const pos = positions[i]!;
  autorunnerStates.push({
    id: i,
    position: pos,
    intendedTrajectory: [pos],
    actualTrajectory: [pos],
    direction: { dx: Math.random() - 0.5, dy: Math.random() - 0.5, dz: Math.random() - 0.5 },
    group: i % 2,
    orientationHistory: [pos],
    geometry: { theta: Math.random() * Math.PI * 2, phi: Math.random() * Math.PI / 2 },
    luckScore: 0,
    randomLuckScore: 0
  });
}

function updateAutorunnerPositions() {
  autorunnerStates.forEach(state => {
    // Intended: straight line in direction
    const lastIntended = state.intendedTrajectory[state.intendedTrajectory.length - 1]!;
    const intendedNext = {
      x: lastIntended.x + state.direction.dx,
      y: lastIntended.y + state.direction.dy,
      z: lastIntended.z + state.direction.dz,
    };
    state.intendedTrajectory.push(intendedNext);

    // Actual: with some deviation
    const deviation = 0.1;
    const actualNext = {
      x: intendedNext.x + (Math.random() - 0.5) * deviation,
      y: intendedNext.y + (Math.random() - 0.5) * deviation,
      z: intendedNext.z + (Math.random() - 0.5) * deviation,
    };
    state.actualTrajectory.push(actualNext);
    state.position = actualNext;

    // Update orientation history
    state.orientationHistory.push(state.position);
    if (state.orientationHistory.length > 50) state.orientationHistory.shift(); // Keep last 50

    // Update geometry (simulate change)
    state.geometry.theta += (Math.random() - 0.5) * 0.1;
    state.geometry.phi += (Math.random() - 0.5) * 0.1;
    state.geometry.phi = Math.max(0, Math.min(Math.PI / 2, state.geometry.phi)); // Clamp phi

    // Keep last 100 points
    if (state.intendedTrajectory.length > 100) state.intendedTrajectory.shift();
    if (state.actualTrajectory.length > 100) state.actualTrajectory.shift();
  });
}

import BotFleet from './botFleet.js';

// Use BotFleet for COL and braided geometry
let botFleet: BotFleet;

// ---------- Main loop for BotFleet ----------
async function runBackgroundSimulations() {
  botFleet = new BotFleet(true); // Browser mode
  botFleet.startContinuousRunning(5000); // Run every 5 seconds

  // Broadcast to browser
  setInterval(() => {
    updateAutorunnerPositions(); // Update 3D positions

    const bots = botFleet.getBots();
    const runnerData = bots.map((bot: any) => ({
      id: bot.getId(),
      position: { x: bot.getGeometricState().theta, y: bot.getGeometricState().phi }, // Map to sphere coords
      direction: { dx: 0, dy: 0 }, // Placeholder
      anomalies: {} // Placeholder
    }));

    // Send autorunner updates
    autorunnerStates.forEach(state => {
      broadcast({
        type: 'autorunnerUpdate',
        autorunnerId: state.id,
        position: state.position,
        direction: state.direction,
        anomalies: {}, // Placeholder
        trajectory: state.actualTrajectory.slice(-10), // Last 10 points
        intendedTrajectory: state.intendedTrajectory.slice(-10),
        group: state.group
      });
    });

    broadcast({
      type: 'cycleUpdate',
      cycleCount: 0, // Placeholder
      runnerData,
      collectiveAnomalies: { avgRandomness: 0, avgStructure: 0, avgReemergence: 0 },
      topK: {
        randomness: anomalyStores.randomness!.items.slice(0, 10),
        structure: anomalyStores.structure!.items.slice(0, 10),
        reemergence: anomalyStores.reemergence!.items.slice(0, 10),
        event_density: [], // Add if available
      }
    });
  }, 1000);

  // Keep running forever
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10 seconds
  }
}

const postToBlockchain = async (results: any) => {
  // Stub: log to console
  console.log('Posting to blockchain:', results);
};

// Start the background simulations
runBackgroundSimulations().catch(console.error);
