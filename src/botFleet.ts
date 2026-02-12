// src/botFleet.ts
import { runVariant, writeOutputs } from './core.js';
import { MirrorInversion } from './variants/mirror_inversion.js';
import { SquareClampReflect } from './variants/square_clamp_reflect.js';
import { SquareInversionReflect } from './variants/square_inversion_reflect.js';
import { SquareStickyReflect } from './variants/square_sticky_reflect.js';
import { AnomalyDetector } from './anomaly_metrics.js';
import { BlockchainManager } from './blockchain.js';
import type { RunConfig, InversionKind } from './types.js';
import fs from 'node:fs';

interface ConstraintFeedback {
  valid: boolean;
  message: string;
  suggestions?: string[];
}

class Bot {
  private id: number;
  private group: number;
  private constraints: string[] = [
    "Trajectory must have at least 100 points",
    "Events must be fewer than 1000",
    "Inversions must be positive",
    "Phase must be between 0 and 1",
    "Grid size must be reasonable (5-20)"
  ];
  private currentConfig: RunConfig;
  private history: { config: RunConfig; feedback: ConstraintFeedback }[] = [];

  constructor(id: number, group: number) {
    this.id = id;
    this.group = group;
    this.currentConfig = this.generateConfig();
  }

  // Generate a new config autonomously
  generateConfig(): RunConfig {
    const variants = [MirrorInversion, SquareClampReflect, SquareInversionReflect, SquareStickyReflect];
    const variant = variants[Math.floor(Math.random() * variants.length)];

    // Use braided logic: alternate assignment, but since groups are 2, use even/odd for simplicity
    const sizeX = Math.floor(Math.random() * 16) + 5; // 5-20
    const sizeY = Math.floor(Math.random() * 16) + 5;
    const x0 = Math.floor(Math.random() * sizeX);
    const y0 = Math.floor(Math.random() * sizeY);
    const vx0 = Math.floor(Math.random() * 10) - 5; // -5 to 4
    const vy0 = Math.floor(Math.random() * 10) - 5;
    const steps = Math.floor(Math.random() * 100000) + 10000; // 10k-110k
    const multiplier = Math.random() > 0.5 ? 3 : 7;
    const mod = 1000003;

    // Random inversion schedule
    const inversionKinds: InversionKind[] = ["GEOM", "SPHERE", "OBSERVER", "CAUSAL"];
    const inversionSchedule: { step: number; kind: InversionKind }[] = [];
    for (let i = 0; i < Math.floor(Math.random() * 4); i++) {
      const kind = inversionKinds[Math.floor(Math.random() * inversionKinds.length)]!;
      const step = Math.floor(steps * (0.2 + Math.random() * 0.6)); // 20%-80%
      inversionSchedule.push({ step, kind });
    }

    this.currentConfig = {
      sizeX, sizeY, x0, y0, vx0, vy0, phase0: 0, steps, multiplier, mod, inversionSchedule
    };
    return this.currentConfig;
  }

  // Run simulation and get feedback
  runSimulation(): any {
    if (!this.currentConfig) throw new Error("No config generated");
    const variants = [MirrorInversion, SquareClampReflect, SquareInversionReflect, SquareStickyReflect];
    const variant = variants[Math.floor(Math.random() * variants.length)];
    return runVariant(variant, this.currentConfig);
  }

  // Check constraints and provide feedback (COL method)
  checkConstraints(result: any): ConstraintFeedback {
    const violations: string[] = [];
    const suggestions: string[] = [];

    if (result.trajectory.length < 100) {
      violations.push("Trajectory too short");
      suggestions.push("Increase steps or adjust initial conditions");
    }
    if (result.events.length >= 1000) {
      violations.push("Too many events");
      suggestions.push("Reduce steps or change variant");
    }
    if (result.trajectory.some((s: any) => s.inverted < 0)) {
      violations.push("Negative inversions");
      suggestions.push("Check inversion logic");
    }
    if (result.trajectory.some((s: any) => s.phase < 0 || s.phase > 1)) {
      violations.push("Phase out of bounds");
      suggestions.push("Normalize phase calculation");
    }
    if (!this.currentConfig || this.currentConfig.sizeX < 5 || this.currentConfig.sizeX > 20 ||
        this.currentConfig.sizeY < 5 || this.currentConfig.sizeY > 20) {
      violations.push("Grid size unreasonable");
      suggestions.push("Set sizeX and sizeY between 5 and 20");
    }

    const valid = violations.length === 0;
    const message = valid ? "All constraints satisfied" : `Violations: ${violations.join(", ")}`;

    const feedback: ConstraintFeedback = { valid, message, suggestions };
    if (this.currentConfig) {
      this.history.push({ config: this.currentConfig, feedback });
    }
    return feedback;
  }

  // Iterate based on feedback (COL: no answers, only constraints)
  iterate(feedback: ConstraintFeedback): RunConfig {
    if (feedback.valid) {
      // Slightly perturb for exploration
      this.generateConfig();
    } else {
      // Adjust based on suggestions (simple heuristics)
      if (feedback.suggestions && feedback.suggestions.includes("Increase steps")) {
        this.currentConfig.steps *= 1.5;
      }
      if (feedback.suggestions && feedback.suggestions.includes("Reduce steps")) {
        this.currentConfig.steps *= 0.5;
      }
      if (feedback.suggestions && feedback.suggestions.includes("Set sizeX and sizeY between 5 and 20")) {
        this.currentConfig.sizeX = Math.max(5, Math.min(20, this.currentConfig.sizeX));
        this.currentConfig.sizeY = Math.max(5, Math.min(20, this.currentConfig.sizeY));
      }
      // Re-generate otherwise
      this.generateConfig();
    }
    return this.currentConfig;
  }

  getId(): number { return this.id; }
  getGroup(): number { return this.group; }
  getHistory(): any[] { return this.history; }
}

export class BotFleet {
  private bots: Bot[] = [];
  private groups: Bot[][] = [[], []];
  private anomalyDetector: AnomalyDetector;
  private categories: Map<string, any[]> = new Map();
  private runCounter: number = 0;
  private totalSimulations: number = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private blockchainManager: BlockchainManager;
  private logicChangeLog: string[] = [];
  private isBrowser: boolean;

  constructor(isBrowser: boolean = false) {
    this.isBrowser = isBrowser;
    // Create 8 bots, split into 2 groups using braided logic (alternating)
    for (let i = 0; i < 8; i++) {
      const group = i % 2; // 0 or 1
      const bot = new Bot(i, group);
      this.bots.push(bot);
      this.groups[group].push(bot);
    }
    this.anomalyDetector = new AnomalyDetector();
    this.blockchainManager = new BlockchainManager();
    this.initializeCategories();
    if (this.isBrowser) {
      this.loadFromLocalStorage();
    }
  }

  private initializeCategories(): void {
    this.categories.set('Event Density', []);
    this.categories.set('Phase Anomaly', []);
    this.categories.set('Spiral Phase Dynamics', []);
  }

  // Start continuous running in background
  startContinuousRunning(intervalMs: number = 5000): void {
    if (this.intervalId) return; // Already running
    this.intervalId = setInterval(async () => {
      this.runIteration();
      await this.sortRunsData();
      this.deleteNonTopRuns();
      this.refineLogic();
    }, intervalMs);
  }

  // Stop continuous running
  stopContinuousRunning(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Run one iteration for all bots, write outputs, detect anomalies
  runIteration(): void {
    for (const bot of this.bots) {
      const config = bot.generateConfig();
      const result = bot.runSimulation();
      const feedback = bot.checkConstraints(result);

      // Write outputs to runs/
      const runName = `run_${String(++this.runCounter).padStart(6, '0')}`;
      writeOutputs('runs', runName, result, config);

      // Detect anomalies
      const anomalies = this.anomalyDetector.detectAnomaliesFromResult(result, `bot_${bot.getId()}`);
      // Add to history
      bot.getHistory().push({ config, feedback, anomalies });

      bot.iterate(feedback);

      // Increment total simulations
      this.totalSimulations++;
    }

    // Check for auto upload every 5000 simulations
    if (this.totalSimulations % 5000 === 0) {
      this.uploadSimulationSummaryToBlockchain();
    }
  }

  // Sort runs/ data into categories based on anomalies, post to blockchain, and limit to top 1000
  async sortRunsData(): Promise<void> {
    const runsDir = 'runs';
    if (!fs.existsSync(runsDir)) return;
    const runDirs = fs.readdirSync(runsDir).filter(d => d.startsWith('run_'));

    for (const runDir of runDirs) {
      const eventsPath = `${runsDir}/${runDir}/${runDir}.events.csv`;
      const trajectoryPath = `${runsDir}/${runDir}/${runDir}.trajectory.json`;
      if (fs.existsSync(eventsPath) && fs.existsSync(trajectoryPath)) {
        const eventsCsv = fs.readFileSync(eventsPath, 'utf-8');
        const trajectoryJson = JSON.parse(fs.readFileSync(trajectoryPath, 'utf-8'));

        // Parse events
        const events = eventsCsv.split('\n').slice(1).map(line => {
          const parts = line.split(',');
          if (parts.length < 8) return null;
          const [step, eventType, phaseBefore, phaseAfter, x, y, vx, vy] = parts;
          return { step: parseInt(step || '0'), eventType: eventType || '', phaseBefore: parseFloat(phaseBefore || '0'), phaseAfter: parseFloat(phaseAfter || '0'), x: parseFloat(x || '0'), y: parseFloat(y || '0'), vx: parseFloat(vx || '0'), vy: parseFloat(vy || '0') };
        }).filter((e): e is NonNullable<typeof e> => e !== null && e.step !== undefined);

        // Detect categories and post to blockchain
        const eventCount = events.length;
        if (eventCount > 5) {
          const data = { runDir, events, trajectory: trajectoryJson, score: eventCount };
          await this.blockchainManager.postAnomaly('Event Density', data);
        }

        const phaseData = trajectoryJson.map((s: any) => s.phase);
        const phaseAnomalies = this.anomalyDetector.detectAnomalies(phaseData);
        if (phaseAnomalies.length > 0) {
          const data = { runDir, events, trajectory: trajectoryJson, anomalies: phaseAnomalies, score: Math.max(...phaseAnomalies) };
          await this.blockchainManager.postAnomaly('Phase Anomaly', data);
        }

        // Check for Spiral Phase Dynamics: multiplicative jumps
        const phaseJumps = events.map(e => e.phaseAfter - e.phaseBefore);
        const hasMultiplicative = phaseJumps.some(jump => jump > 1 && (jump % 7 === 0 || jump % 3 === 0)); // Check for *7 or *3
        if (hasMultiplicative) {
          const data = { runDir, events, trajectory: trajectoryJson, score: phaseJumps.filter(j => j > 1 && (j % 7 === 0 || j % 3 === 0)).length };
          await this.blockchainManager.postAnomaly('Spiral Phase Dynamics', data);
        }
      }
    }

    // Update local categories from blockchain (top 1000 sorted by score descending)
    for (const category of ['Event Density', 'Phase Anomaly', 'Spiral Phase Dynamics']) {
      const topAnomalies = await this.blockchainManager.getTopAnomalies(category, 1000);
      this.categories.set(category, topAnomalies.sort((a, b) => b.score - a.score));
    }

    // Write categories to categories/ folder
    const categoriesDir = 'categories';
    fs.mkdirSync(categoriesDir, { recursive: true });
    for (const [category, data] of this.categories) {
      fs.writeFileSync(`${categoriesDir}/${category.replace(/\s+/g, '_')}.json`, JSON.stringify(data, null, 2));
    }
  }

  // Delete runs not in top 1000 for any category
  deleteNonTopRuns(): void {
    const runsDir = 'runs';
    if (!fs.existsSync(runsDir)) return;
    const runDirs = fs.readdirSync(runsDir).filter(d => d.startsWith('run_'));

    const topRunDirs = new Set<string>();
    for (const category of ['Event Density', 'Phase Anomaly', 'Spiral Phase Dynamics']) {
      const categoryData = this.categories.get(category) || [];
      categoryData.forEach(anomaly => topRunDirs.add(anomaly.runDir));
    }

    for (const runDir of runDirs) {
      if (!topRunDirs.has(runDir)) {
        fs.rmSync(`${runsDir}/${runDir}`, { recursive: true, force: true });
      }
    }
  }

  // Refine logic based on data: add new criteria, vary configs
  refineLogic(): void {
    // Analyze categories to find patterns
    const spiralData = this.categories.get('Spiral Phase Dynamics');
    if (spiralData && spiralData.length > 0) {
      // Add custom criterion for spacing bands
      this.anomalyDetector.addCustomCriterion((result) => {
        const events = result.events;
        const spacings = [];
        for (let i = 1; i < events.length; i++) {
          spacings.push(events[i].step - events[i-1].step);
        }
        const uniqueSpacings = [...new Set(spacings)];
        if (uniqueSpacings.length <= 5) { // Discrete bands
          return [{
            id: `spacing_${Date.now()}`,
            score: uniqueSpacings.length,
            category: 'Spacing Bands',
            description: `Discrete spacings: ${uniqueSpacings.join(',')}`,
            timestamp: new Date().toISOString(),
            source: 'bot_logic'
          }];
        }
        return [];
      });
      this.logicChangeLog.push(`Added custom anomaly detection criterion for discrete spacing bands in event spacings.`);

      // Vary configs: change multiplier/mod for more anomalies
      let configChanges = 0;
      for (const bot of this.bots) {
        if (bot.getHistory().length > 5) {
          const lastConfig = bot.getHistory()[bot.getHistory().length - 1].config;
          lastConfig.multiplier = lastConfig.multiplier === 7 ? 3 : 7; // Alternate
          lastConfig.mod = Math.floor(Math.random() * 1000000) + 1000000; // Vary mod
          configChanges++;
        }
      }
      if (configChanges > 0) {
        this.logicChangeLog.push(`Varied configurations for ${configChanges} bots by alternating multipliers and randomizing mods.`);
      }
    }

    // Log current actions
    this.logicChangeLog.push(`Bot fleet iteration completed. Bots coordinated via blockchain. Anomalies detected and categorized.`);
  }

  // Get results from a group
  getGroupResults(group: number): any[] {
    return this.groups[group].map(bot => ({
      id: bot.getId(),
      history: bot.getHistory()
    }));
  }

  // Get all bots
  getBots(): Bot[] {
    return this.bots;
  }

  // Get categories
  getCategories(): Map<string, any[]> {
    return this.categories;
  }

  // Get logic change log
  getLogicChangeLog(): string[] {
    return this.logicChangeLog;
  }

  // Upload simulation summary to blockchain for auto deleter bots
  private async uploadSimulationSummaryToBlockchain(): Promise<void> {
    const summary = {
      totalSimulations: this.totalSimulations,
      totalRuns: this.runCounter,
      categories: Object.fromEntries(this.categories),
      timestamp: new Date().toISOString(),
      message: "Auto upload every 5000 simulations for deleter bots"
    };

    // Post to a special category for deleter bots
    await this.blockchainManager.postAnomaly('Simulation Summary', summary);
    this.logicChangeLog.push(`Uploaded simulation summary to blockchain: ${this.totalSimulations} total simulations.`);
  }

  // Summarize current logic of the bots
  getLogicSummary(): string {
    let summary = "Bot Fleet Logic Summary:\n\n";
    summary += `Total Bots: ${this.bots.length}\n`;
    summary += `Groups: 2 (Braided Logic: Alternating Assignment)\n`;
    summary += `Total Simulations Run: ${this.totalSimulations}\n\n`;

    summary += "Bot Logic:\n";
    summary += "- Each bot generates random configurations autonomously.\n";
    summary += "- Configurations include grid size (5-20), initial position/velocity, steps (10k-110k), multiplier (3 or 7), mod (1000003), and random inversion schedules.\n";
    summary += "- Bots run simulations using variants: MirrorInversion, SquareClampReflect, SquareInversionReflect, SquareStickyReflect.\n";
    summary += "- After simulation, bots check constraints: trajectory length >=100, events <1000, positive inversions, phase 0-1, grid size 5-20.\n";
    summary += "- Feedback is provided (valid/invalid with suggestions).\n";
    summary += "- Iteration: If valid, perturb config; if invalid, adjust based on suggestions (e.g., increase steps, reduce steps, fix grid size).\n\n";

    summary += "Fleet Operations:\n";
    summary += "- Continuous running: Every 5 seconds, run iteration, sort data, delete non-top runs, refine logic.\n";
    summary += "- Anomaly Detection: Detect from simulation results, categories: Event Density, Phase Anomaly, Spiral Phase Dynamics.\n";
    summary += "- Blockchain Integration: Post anomalies to smart contract, retrieve top 1000 per category.\n";
    summary += "- Auto Upload: Every 5000 simulations, upload summary to blockchain for auto deleter bots.\n";
    summary += "- Storage Management: Keep only top 1000 runs per category locally, delete others.\n";
    summary += "- Logic Refinement: Analyze Spiral Phase Dynamics to add custom criteria (e.g., spacing bands), vary configs.\n\n";

    summary += "Recent Logic Changes:\n";
    const recentChanges = this.logicChangeLog.slice(-10); // Last 10 changes
    if (recentChanges.length > 0) {
      recentChanges.forEach((change, index) => {
        summary += `${index + 1}. ${change}\n`;
      });
    } else {
      summary += "No recent changes.\n";
    }
    summary += "\n";

    summary += "Current Categories:\n";
    for (const [cat, data] of this.categories) {
      summary += `${cat}: ${data.length} entries\n`;
    }

    return summary;
  }
}

export default BotFleet;
