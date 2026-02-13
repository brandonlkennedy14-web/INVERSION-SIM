// src/simulations/ParticleSimulation.ts
// Simulation 1: Particle trajectory through different dimensions
// Handles dimension navigation, trajectory generation, anomaly detection

import { runVariant, writeOutputs } from '../core.js';
import { MirrorInversion } from '../variants/mirror_inversion.js';
import { SquareClampReflect } from '../variants/square_clamp_reflect.js';
import { SquareInversionReflect } from '../variants/square_inversion_reflect.js';
import { SquareStickyReflect } from '../variants/square_sticky_reflect.js';
import { AnomalyDetector } from '../anomaly_metrics.js';
import type { RunConfig, InversionKind } from '../types.js';
import type { SimulationBridge, SimulationEvent } from '../bridge/SimulationBridge.js';
import type { BlockchainSync } from '../bridge/BlockchainSync.js';

export interface DimensionState {
  name: string;
  kind: InversionKind;
  active: boolean;
  entryStep: number;
  exitStep: number | null;
  anomalies: any[];
}

export interface TrajectoryPoint {
  step: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  inverted: boolean;
  dimension: string;
}

export interface ParticleResult {
  trajectory: TrajectoryPoint[];
  events: any[];
  dimensions: DimensionState[];
  anomalies: any;
  config: RunConfig;
  metadata: {
    startTime: number;
    endTime: number;
    totalSteps: number;
    dimensionsVisited: string[];
  };
}

export interface ParticleBot {
  id: number;
  group: number;
  currentConfig: RunConfig;
  currentResult: ParticleResult | null;
  dimensionHistory: DimensionState[];
  trajectory: TrajectoryPoint[];
  geometricState: {
    theta: number;
    phi: number;
  };
}

export class ParticleSimulation {
  private bots: ParticleBot[];
  private anomalyDetector: AnomalyDetector;
  private bridge: SimulationBridge | null;
  private blockchainSync: BlockchainSync | null;
  private isRunning: boolean;
  private runCounter: number;
  private variants: any[];
  private dimensionSequence: InversionKind[];

  constructor(
    bridge?: SimulationBridge,
    blockchainSync?: BlockchainSync,
    numBots: number = 8
  ) {
    this.bots = [];
    this.anomalyDetector = new AnomalyDetector();
    this.bridge = bridge || null;
    this.blockchainSync = blockchainSync || null;
    this.isRunning = false;
    this.runCounter = 0;
    
    // Available variants for dimension navigation
    this.variants = [
      MirrorInversion,
      SquareClampReflect,
      SquareInversionReflect,
      SquareStickyReflect
    ];

    // Dimension sequence: GEOM -> SPHERE -> OBSERVER -> CAUSAL
    this.dimensionSequence = ['GEOM', 'SPHERE', 'OBSERVER', 'CAUSAL'];

    // Initialize bots
    this.initializeBots(numBots);
  }

  private initializeBots(numBots: number): void {
    for (let i = 0; i < numBots; i++) {
      const group = i % 2; // Two groups for braided logic
      const bot: ParticleBot = {
        id: i,
        group,
        currentConfig: this.generateConfig(),
        currentResult: null,
        dimensionHistory: [],
        trajectory: [],
        geometricState: {
          theta: (i * 2 * Math.PI) / numBots,
          phi: 0
        }
      };
      this.bots.push(bot);
    }
  }

  // Generate random configuration for dimension navigation
  private generateConfig(): RunConfig {
    const variant = this.variants[Math.floor(Math.random() * this.variants.length)];
    
    const sizeX = Math.floor(Math.random() * 16) + 5; // 5-20
    const sizeY = Math.floor(Math.random() * 16) + 5;
    const x0 = Math.floor(Math.random() * sizeX);
    const y0 = Math.floor(Math.random() * sizeY);
    const vx0 = Math.floor(Math.random() * 10) - 5;
    const vy0 = Math.floor(Math.random() * 10) - 5;
    const steps = Math.floor(Math.random() * 100000) + 10000;
    const multiplier = Math.random() > 0.5 ? 3 : 7;
    
    // Create dimension schedule based on sequence
    const inversionSchedule: { step: number; kind: InversionKind }[] = [];
    const stepIncrement = Math.floor(steps / (this.dimensionSequence.length + 1));
    
    this.dimensionSequence.forEach((kind, index) => {
      inversionSchedule.push({
        step: stepIncrement * (index + 1),
        kind
      });
    });

    return {
      sizeX,
      sizeY,
      x0,
      y0,
      vx0,
      vy0,
      phase0: 0,
      steps,
      multiplier,
      mod: 1000003,
      inversionSchedule
    };
  }

  // Run single bot through dimension navigation
  async runBot(botId: number): Promise<ParticleResult> {
    const bot = this.bots.find(b => b.id === botId);
    if (!bot) throw new Error(`Bot ${botId} not found`);

    const startTime = Date.now();
    const config = bot.currentConfig;
    
    // Run simulation
    const variant = this.variants[Math.floor(Math.random() * this.variants.length)];
    const rawResult = runVariant(variant, config);

    // Transform to particle result format
    const result = this.transformToParticleResult(rawResult, config, startTime);
    
    // Update bot state
    bot.currentResult = result;
    bot.trajectory = result.trajectory;
    bot.dimensionHistory = result.dimensions;

    // Detect anomalies
    const anomalies = this.anomalyDetector.detectAnomaliesFromResult(rawResult, `bot_${botId}`);
    result.anomalies = anomalies;

    // Publish events to bridge
    this.publishTrajectoryEvents(bot, result);
    this.publishAnomalyEvents(bot, result, anomalies);

    // Queue for blockchain sync
    if (this.blockchainSync) {
      this.queueForBlockchain(bot, result, anomalies);
    }

    // Save outputs
    const runName = `particle_${String(++this.runCounter).padStart(6, '0')}`;
    writeOutputs('runs', runName, rawResult, config);

    return result;
  }

  // Transform raw result to particle result format
  private transformToParticleResult(
    rawResult: any,
    config: RunConfig,
    startTime: number
  ): ParticleResult {
    const trajectory: TrajectoryPoint[] = rawResult.trajectory.map((state: any, index: number) => ({
      step: index,
      x: state.x,
      y: state.y,
      vx: state.vx,
      vy: state.vy,
      phase: state.phase,
      inverted: state.inverted,
      dimension: this.getDimensionAtStep(index, config)
    }));

    const dimensions = this.extractDimensionStates(trajectory, config);
    const dimensionsVisited = [...new Set(trajectory.map(t => t.dimension))];

    return {
      trajectory,
      events: rawResult.events,
      dimensions,
      anomalies: {},
      config,
      metadata: {
        startTime,
        endTime: Date.now(),
        totalSteps: config.steps,
        dimensionsVisited
      }
    };
  }

  // Get current dimension at a specific step
  private getDimensionAtStep(step: number, config: RunConfig): string {
    let currentDimension = 'BASE';
    
    if (config.inversionSchedule) {
      for (const inv of config.inversionSchedule) {
        if (step >= inv.step) {
          currentDimension = inv.kind;
        }
      }
    }
    
    return currentDimension;
  }

  // Extract dimension states from trajectory
  private extractDimensionStates(
    trajectory: TrajectoryPoint[],
    config: RunConfig
  ): DimensionState[] {
    const states: DimensionState[] = [];
    
    if (!config.inversionSchedule) return states;

    for (const inv of config.inversionSchedule) {
      const entryStep = inv.step;
      const exitStep = this.findExitStep(trajectory, inv.kind, entryStep);
      
      const dimensionAnomalies = trajectory
        .filter(t => t.step >= entryStep && t.step <= (exitStep || trajectory.length))
        .filter(t => t.inverted)
        .map(t => ({
          step: t.step,
          phase: t.phase,
          position: { x: t.x, y: t.y }
        }));

      states.push({
        name: inv.kind,
        kind: inv.kind,
        active: true,
        entryStep,
        exitStep,
        anomalies: dimensionAnomalies
      });
    }

    return states;
  }

  // Find when bot exits a dimension
  private findExitStep(
    trajectory: TrajectoryPoint[],
    kind: InversionKind,
    entryStep: number
  ): number | null {
    // Find next dimension entry or end of trajectory
    const nextEntry = trajectory.find(t => 
      t.step > entryStep && t.dimension !== kind && t.dimension !== 'BASE'
    );
    
    return nextEntry ? nextEntry.step : null;
  }

  // Publish trajectory events to bridge
  private publishTrajectoryEvents(bot: ParticleBot, result: ParticleResult): void {
    if (!this.bridge) return;

    // Publish trajectory update
    this.bridge.publish({
      type: 'trajectory',
      source: 'particle',
      timestamp: Date.now(),
      botId: bot.id,
      data: {
        trajectory: result.trajectory.slice(-100), // Last 100 points
        dimensions: result.dimensions.map(d => d.name),
        currentDimension: result.trajectory[result.trajectory.length - 1]?.dimension
      },
      metadata: {
        dimension: result.trajectory[result.trajectory.length - 1]?.dimension,
        phase: result.trajectory[result.trajectory.length - 1]?.phase
      }
    });

    // Publish dimension transitions
    result.dimensions.forEach(dim => {
      this.bridge!.publish({
        type: 'topology',
        source: 'particle',
        timestamp: Date.now(),
        botId: bot.id,
        data: {
          dimension: dim.name,
          entryStep: dim.entryStep,
          exitStep: dim.exitStep,
          anomalyCount: dim.anomalies.length
        },
        metadata: {
          dimension: dim.name,
          phase: 0
        }
      });
    });
  }

  // Publish anomaly events to bridge
  private publishAnomalyEvents(
    bot: ParticleBot,
    result: ParticleResult,
    anomalies: any
  ): void {
    if (!this.bridge) return;

    // Calculate overall anomaly score
    const anomalyScore = this.calculateAnomalyScore(anomalies);

    this.bridge.publish({
      type: 'anomaly',
      source: 'particle',
      timestamp: Date.now(),
      botId: bot.id,
      data: {
        anomalies,
        dimensions: result.dimensionsVisited,
        trajectoryLength: result.trajectory.length,
        eventCount: result.events.length
      },
      metadata: {
        score: anomalyScore,
        dimension: result.trajectory[result.trajectory.length - 1]?.dimension
      }
    });
  }

  // Calculate overall anomaly score
  private calculateAnomalyScore(anomalies: any): number {
    const scores = Object.values(anomalies).filter(v => typeof v === 'number') as number[];
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  // Queue results for blockchain synchronization
  private queueForBlockchain(
    bot: ParticleBot,
    result: ParticleResult,
    anomalies: any
  ): void {
    if (!this.blockchainSync) return;

    // Queue trajectory event
    this.blockchainSync.queueCommit({
      type: 'trajectory',
      source: 'particle',
      timestamp: Date.now(),
      botId: bot.id,
      data: {
        trajectoryLength: result.trajectory.length,
        dimensions: result.dimensions.map(d => d.name),
        metadata: result.metadata
      },
      metadata: {
        score: this.calculateAnomalyScore(anomalies),
        dimension: result.trajectory[result.trajectory.length - 1]?.dimension
      }
    }, 1);

    // Queue anomaly event if significant
    if (this.calculateAnomalyScore(anomalies) > 0.5) {
      this.blockchainSync.queueCommit({
        type: 'anomaly',
        source: 'particle',
        timestamp: Date.now(),
        botId: bot.id,
        data: anomalies,
        metadata: {
          score: this.calculateAnomalyScore(anomalies),
          dimension: 'multiple'
        }
      }, 2);
    }
  }

  // Run all bots through dimension navigation
  async runAllBots(): Promise<ParticleResult[]> {
    const results: ParticleResult[] = [];
    
    for (const bot of this.bots) {
      const result = await this.runBot(bot.id);
      results.push(result);
    }

    return results;
  }

  // Start continuous dimension navigation
  startContinuous(intervalMs: number = 5000): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log(`[ParticleSimulation] Started continuous navigation (${intervalMs}ms interval)`);

    const runLoop = async () => {
      while (this.isRunning) {
        await this.runAllBots();
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    };

    runLoop();
  }

  // Stop continuous navigation
  stopContinuous(): void {
    this.isRunning = false;
    console.log('[ParticleSimulation] Stopped continuous navigation');
  }

  // Get bot by ID
  getBot(botId: number): ParticleBot | undefined {
    return this.bots.find(b => b.id === botId);
  }

  // Get all bots
  getAllBots(): ParticleBot[] {
    return this.bots;
  }

  // Get bots by group
  getBotsByGroup(group: number): ParticleBot[] {
    return this.bots.filter(b => b.group === group);
  }

  // Get dimension statistics
  getDimensionStats(): { [key: string]: number } {
    const stats: { [key: string]: number } = {};
    
    for (const bot of this.bots) {
      if (bot.currentResult) {
        for (const dim of bot.currentResult.dimensions) {
          stats[dim.name] = (stats[dim.name] || 0) + 1;
        }
      }
    }

    return stats;
  }

  // Get trajectory summary
  getTrajectorySummary(): {
    totalTrajectories: number;
    averageLength: number;
    totalAnomalies: number;
    dimensionCoverage: { [key: string]: number };
  } {
    let totalLength = 0;
    let totalAnomalies = 0;
    const dimensionCoverage: { [key: string]: number } = {};

    for (const bot of this.bots) {
      if (bot.currentResult) {
        totalLength += bot.currentResult.trajectory.length;
        totalAnomalies += Object.keys(bot.currentResult.anomalies).length;
        
        for (const dim of bot.currentResult.dimensions) {
          dimensionCoverage[dim.name] = (dimensionCoverage[dim.name] || 0) + 1;
        }
      }
    }

    return {
      totalTrajectories: this.bots.filter(b => b.currentResult).length,
      averageLength: totalLength / Math.max(1, this.bots.filter(b => b.currentResult).length),
      totalAnomalies,
      dimensionCoverage
    };
  }

  // Update bot configuration
  updateBotConfig(botId: number, config: Partial<RunConfig>): void {
    const bot = this.bots.find(b => b.id === botId);
    if (bot) {
      bot.currentConfig = { ...bot.currentConfig, ...config };
    }
  }

  // Regenerate all bot configs
  regenerateAllConfigs(): void {
    for (const bot of this.bots) {
      bot.currentConfig = this.generateConfig();
    }
  }
}

export default ParticleSimulation;
