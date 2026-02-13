// src/simulations/SimulationManager.ts
// Main orchestrator that manages both ParticleSimulation and CoordinationMap
// Provides unified interface for running separated simulations with live updates

import { ParticleSimulation } from './ParticleSimulation.js';
import { CoordinationMap } from './CoordinationMap.js';
import { SimulationBridge, getGlobalBridge } from '../bridge/SimulationBridge.js';
import { BlockchainSync, createBlockchainSync } from '../bridge/BlockchainSync.js';
import { BlockchainManager } from '../blockchain.js';

export interface SimulationConfig {
  numParticleBots?: number;
  matrixSize?: number;
  updateInterval?: number;
  enableBlockchain?: boolean;
  bridgeOptions?: {
    maxHistorySize?: number;
    updateInterval?: number;
  };
  blockchainOptions?: {
    batchSize?: number;
    syncInterval?: number;
  };
}

export interface SimulationStatus {
  isRunning: boolean;
  particleStatus: {
    botCount: number;
    dimensionStats: { [key: string]: number };
    trajectorySummary: any;
  };
  coordinationStatus: {
    nodeCount: number;
    edgeCount: number;
    clusterCount: number;
    globalMetrics: any;
  };
  bridgeStatus: {
    subscriberCount: number;
    historySize: number;
    isBroadcasting: boolean;
  };
  blockchainStatus?: {
    pendingCount: number;
    totalCommits: number;
    isSyncing: boolean;
  } | undefined;

}

export class SimulationManager {
  private particleSim: ParticleSimulation;
  private coordinationMap: CoordinationMap;
  private bridge: SimulationBridge;
  private blockchainSync: BlockchainSync | null;
  private blockchain: BlockchainManager | null;
  private isRunning: boolean;
  private config: SimulationConfig;

  constructor(config: SimulationConfig = {}) {
    this.config = {
      numParticleBots: 8,
      matrixSize: 5,
      updateInterval: 100,
      enableBlockchain: true,
      ...config
    };

    // Initialize bridge (singleton)
    this.bridge = getGlobalBridge();

    // Initialize blockchain if enabled
    if (this.config.enableBlockchain) {
      this.blockchain = new BlockchainManager();
      this.blockchainSync = createBlockchainSync(this.blockchain, {
        batchSize: config.blockchainOptions?.batchSize || 10,
        syncInterval: config.blockchainOptions?.syncInterval || 5000
      });
    } else {
      this.blockchain = null;
      this.blockchainSync = null;
    }

    // Initialize simulations
    this.particleSim = new ParticleSimulation(
      this.bridge,
      this.blockchainSync ?? undefined,
      this.config.numParticleBots
    );

    this.coordinationMap = new CoordinationMap(
      this.bridge,
      this.blockchainSync ?? undefined,
      {
        matrixSize: this.config.matrixSize ?? 5,
        updateInterval: this.config.updateInterval ?? 100
      }
    );


    this.isRunning = false;
  }

  // Start both simulations
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[SimulationManager] Already running');
      return;
    }

    console.log('[SimulationManager] Starting simulations...');

    // Start bridge broadcasting
    this.bridge.startBroadcasting();

    // Start blockchain sync if enabled
    if (this.blockchainSync) {
      this.blockchainSync.startSync();
    }

    // Start coordination map updates
    this.coordinationMap.startUpdates();

    // Start particle simulation
    this.particleSim.startContinuous(5000);

    this.isRunning = true;

    console.log('[SimulationManager] All simulations started');
  }

  // Stop both simulations
  stop(): void {
    if (!this.isRunning) return;

    console.log('[SimulationManager] Stopping simulations...');

    // Stop particle simulation
    this.particleSim.stopContinuous();

    // Stop coordination map
    this.coordinationMap.stopUpdates();

    // Stop blockchain sync
    if (this.blockchainSync) {
      this.blockchainSync.stopSync();
    }

    // Stop bridge
    this.bridge.stopBroadcasting();

    this.isRunning = false;

    console.log('[SimulationManager] All simulations stopped');
  }

  // Force blockchain sync
  async forceBlockchainSync(): Promise<void> {
    if (this.blockchainSync) {
      await this.blockchainSync.forceSync();
    }
  }

  // Get current status
  getStatus(): SimulationStatus {
    const particleSummary = this.particleSim.getTrajectorySummary();
    const coordinationSnapshot = this.coordinationMap.getCurrentSnapshot();
    const bridgeStats = this.bridge.getStats();

    return {
      isRunning: this.isRunning,
      particleStatus: {
        botCount: this.particleSim.getAllBots().length,
        dimensionStats: this.particleSim.getDimensionStats(),
        trajectorySummary: particleSummary
      },
      coordinationStatus: {
        nodeCount: this.coordinationMap.getStats().nodeCount,
        edgeCount: this.coordinationMap.getStats().edgeCount,
        clusterCount: this.coordinationMap.getStats().clusterCount,
        globalMetrics: coordinationSnapshot.globalMetrics
      },
      bridgeStatus: {
        subscriberCount: bridgeStats.subscriberCount,
        historySize: bridgeStats.historySize,
        isBroadcasting: bridgeStats.isBroadcasting
      },
      blockchainStatus: this.blockchainSync ? {
        pendingCount: this.blockchainSync.getStats().pendingCount,
        totalCommits: this.blockchainSync.getStats().totalCommits,
        isSyncing: this.blockchainSync.getStats().isSyncing
      } : undefined
    };
  }

  // Get particle simulation
  getParticleSimulation(): ParticleSimulation {
    return this.particleSim;
  }

  // Get coordination map
  getCoordinationMap(): CoordinationMap {
    return this.coordinationMap;
  }

  // Get bridge
  getBridge(): SimulationBridge {
    return this.bridge;
  }

  // Get blockchain sync
  getBlockchainSync(): BlockchainSync | null {
    return this.blockchainSync;
  }

  // Manual trigger: Run single particle iteration
  async runParticleIteration(): Promise<void> {
    await this.particleSim.runAllBots();
  }

  // Manual trigger: Update coordination map
  updateCoordination(): void {
    // Coordination map updates automatically via bridge
    // This method can be used to force a manual update if needed
    const snapshot = this.coordinationMap.getCurrentSnapshot();
    console.log('[SimulationManager] Coordination snapshot:', snapshot);
  }

  // Get live data for visualization
  getLiveData(): {
    particles: any[];
    coordination: any;
    bridgeStats: any;
  } {
    return {
      particles: this.particleSim.getAllBots().map(bot => ({
        id: bot.id,
        group: bot.group,
        position: bot.currentResult?.trajectory[bot.currentResult.trajectory.length - 1],
        dimension: bot.currentResult?.trajectory[bot.currentResult.trajectory.length - 1]?.dimension,
        anomalies: bot.currentResult?.anomalies
      })),
      coordination: this.coordinationMap.getCurrentSnapshot(),
      bridgeStats: this.bridge.getStats()
    };
  }

  // Reset all simulations
  reset(): void {
    this.stop();

    // Reset bridge
    this.bridge.clearHistory();

    // Clear blockchain pending if enabled
    if (this.blockchainSync) {
      this.blockchainSync.clearPending();
    }

    // Re-initialize simulations
    this.particleSim = new ParticleSimulation(
      this.bridge,
      this.blockchainSync ?? undefined,
      this.config.numParticleBots
    );

    this.coordinationMap = new CoordinationMap(
      this.bridge,
      this.blockchainSync ?? undefined,
      {
        matrixSize: this.config.matrixSize ?? 5,
        updateInterval: this.config.updateInterval ?? 100
      }
    );

    console.log('[SimulationManager] All simulations reset');
  }

  // Update configuration
  updateConfig(newConfig: Partial<SimulationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart if running to apply changes
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  // Export data for persistence
  exportData(): {
    particleData: any;
    coordinationData: any;
    bridgeHistory: any;
    timestamp: number;
  } {
    return {
      particleData: this.particleSim.getAllBots().map(bot => ({
        id: bot.id,
        trajectory: bot.trajectory,
        dimensions: bot.dimensionHistory,
        config: bot.currentConfig
      })),
      coordinationData: {
        nodes: this.coordinationMap.getAllNodes(),
        history: this.coordinationMap.getHistory()
      },
      bridgeHistory: this.bridge.getRecentEvents(1000),
      timestamp: Date.now()
    };
  }

  // Print summary to console
  printSummary(): void {
    const status = this.getStatus();
    
    console.log('\n=== SIMULATION MANAGER SUMMARY ===');
    console.log(`Running: ${status.isRunning}`);
    console.log(`\nParticle Simulation:`);
    console.log(`  - Bots: ${status.particleStatus.botCount}`);
    console.log(`  - Dimensions: ${JSON.stringify(status.particleStatus.dimensionStats)}`);
    console.log(`  - Avg Trajectory Length: ${status.particleStatus.trajectorySummary.averageLength.toFixed(2)}`);
    console.log(`\nCoordination Map:`);
    console.log(`  - Nodes: ${status.coordinationStatus.nodeCount}`);
    console.log(`  - Edges: ${status.coordinationStatus.edgeCount}`);
    console.log(`  - Clusters: ${status.coordinationStatus.clusterCount}`);
    console.log(`  - Emergence Score: ${status.coordinationStatus.globalMetrics.emergenceScore.toFixed(4)}`);
    console.log(`\nBridge:`);
    console.log(`  - Subscribers: ${status.bridgeStatus.subscriberCount}`);
    console.log(`  - History Size: ${status.bridgeStatus.historySize}`);
    console.log(`  - Broadcasting: ${status.bridgeStatus.isBroadcasting}`);
    
    if (status.blockchainStatus) {
      console.log(`\nBlockchain:`);
      console.log(`  - Pending: ${status.blockchainStatus.pendingCount}`);
      console.log(`  - Total Commits: ${status.blockchainStatus.totalCommits}`);
      console.log(`  - Syncing: ${status.blockchainStatus.isSyncing}`);
    }
    
    console.log('===================================\n');
  }
}

// Factory function
export function createSimulationManager(config?: SimulationConfig): SimulationManager {
  return new SimulationManager(config);
}

// Singleton instance
let globalManager: SimulationManager | null = null;

export function getGlobalSimulationManager(): SimulationManager {
  if (!globalManager) {
    globalManager = new SimulationManager();
  }
  return globalManager;
}

export function resetGlobalSimulationManager(): void {
  if (globalManager) {
    globalManager.stop();
  }
  globalManager = new SimulationManager();
}

export default SimulationManager;
