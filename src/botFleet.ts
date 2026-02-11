// src/botFleet.ts
import { runVariant } from './core.js';
import { MirrorInversion } from './variants/mirror_inversion.js';
import { SquareClampReflect } from './variants/square_clamp_reflect.js';
import { SquareInversionReflect } from './variants/square_inversion_reflect.js';
import { SquareStickyReflect } from './variants/square_sticky_reflect.js';
import type { RunConfig, InversionKind } from './types.js';

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
  private currentConfig: RunConfig | null = null;
  private history: { config: RunConfig; feedback: ConstraintFeedback }[] = [];

  constructor(id: number, group: number) {
    this.id = id;
    this.group = group;
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
    if (this.currentConfig!.sizeX < 5 || this.currentConfig!.sizeX > 20 ||
        this.currentConfig!.sizeY < 5 || this.currentConfig!.sizeY > 20) {
      violations.push("Grid size unreasonable");
      suggestions.push("Set sizeX and sizeY between 5 and 20");
    }

    const valid = violations.length === 0;
    const message = valid ? "All constraints satisfied" : `Violations: ${violations.join(", ")}`;

    const feedback: ConstraintFeedback = { valid, message, suggestions };
    this.history.push({ config: this.currentConfig!, feedback });
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
        this.currentConfig!.steps *= 1.5;
      }
      if (feedback.suggestions && feedback.suggestions.includes("Reduce steps")) {
        this.currentConfig!.steps *= 0.5;
      }
      if (feedback.suggestions && feedback.suggestions.includes("Set sizeX and sizeY between 5 and 20")) {
        this.currentConfig!.sizeX = Math.max(5, Math.min(20, this.currentConfig!.sizeX));
        this.currentConfig!.sizeY = Math.max(5, Math.min(20, this.currentConfig!.sizeY));
      }
      // Re-generate otherwise
      this.generateConfig();
    }
    return this.currentConfig!;
  }

  getId(): number { return this.id; }
  getGroup(): number { return this.group; }
  getHistory(): any[] { return this.history; }
}

export class BotFleet {
  private bots: Bot[] = [];
  private groups: Bot[][] = [[], []];

  constructor() {
    // Create 8 bots, split into 2 groups using braided logic (alternating)
    for (let i = 0; i < 8; i++) {
      const group = i % 2; // 0 or 1
      const bot = new Bot(i, group);
      this.bots.push(bot);
      this.groups[group].push(bot);
    }
  }

  // Run one iteration for all bots
  runIteration(): void {
    for (const bot of this.bots) {
      const config = bot.generateConfig();
      const result = bot.runSimulation();
      const feedback = bot.checkConstraints(result);
      bot.iterate(feedback);
    }
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
}

export default BotFleet;
