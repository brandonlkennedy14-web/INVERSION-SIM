// src/bridge/BlockchainSync.ts
// Manages blockchain persistence layer for final anomaly commits
// Separates real-time updates (fast) from verified storage (slow)

import { BlockchainManager } from '../blockchain.js';
import type { SimulationEvent } from './SimulationBridge.js';

export interface SyncOptions {
  batchSize?: number;
  syncInterval?: number;
  priorityThreshold?: number;
  categories?: string[];
}

export interface PendingCommit {
  id: string;
  event: SimulationEvent;
  timestamp: number;
  retryCount: number;
  priority: number;
}

export class BlockchainSync {
  private blockchain: BlockchainManager;
  private pendingCommits: PendingCommit[];
  private options: SyncOptions;
  private syncIntervalId: NodeJS.Timeout | null;
  private isProcessing: boolean;
  private commitStats: {
    totalCommits: number;
    failedCommits: number;
    lastSyncTime: number;
    averageCommitTime: number;
  };

  constructor(blockchain: BlockchainManager, options: SyncOptions = {}) {
    this.blockchain = blockchain;
    this.pendingCommits = [];
    this.options = {
      batchSize: options.batchSize || 10,
      syncInterval: options.syncInterval || 5000, // 5 seconds default
      priorityThreshold: options.priorityThreshold || 0.5,
      categories: options.categories || [
        'Event Density',
        'Phase Anomaly',
        'Spiral Phase Dynamics',
        'Simulation Summary',
        'randomness',
        'structure',
        'reemergence'
      ]
    };
    this.syncIntervalId = null;
    this.isProcessing = false;
    this.commitStats = {
      totalCommits: 0,
      failedCommits: 0,
      lastSyncTime: 0,
      averageCommitTime: 0
    };
  }

  // Queue an event for blockchain commit
  queueCommit(event: SimulationEvent, priority: number = 1): string {
    const id = `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const pendingCommit: PendingCommit = {
      id,
      event,
      timestamp: Date.now(),
      retryCount: 0,
      priority
    };

    // Insert based on priority (higher priority first)
    const insertIndex = this.pendingCommits.findIndex(p => p.priority < priority);
    if (insertIndex === -1) {
      this.pendingCommits.push(pendingCommit);
    } else {
      this.pendingCommits.splice(insertIndex, 0, pendingCommit);
    }

    // Limit queue size
    if (this.pendingCommits.length > 1000) {
      // Remove lowest priority items
      this.pendingCommits = this.pendingCommits.slice(0, 1000);
    }

    return id;
  }

  // Start automatic synchronization
  startSync(): void {
    if (this.syncIntervalId) return; // Already running

    this.syncIntervalId = setInterval(() => {
      this.processBatch();
    }, this.options.syncInterval);

    console.log(`[BlockchainSync] Started with interval ${this.options.syncInterval}ms`);
  }

  // Stop automatic synchronization
  stopSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      console.log('[BlockchainSync] Stopped');
    }
  }

  // Process a batch of pending commits
  private async processBatch(): Promise<void> {
    if (this.isProcessing) return; // Prevent concurrent processing
    if (this.pendingCommits.length === 0) return;

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Take batch of highest priority items
      const batch = this.pendingCommits.splice(0, this.options.batchSize);
      
      console.log(`[BlockchainSync] Processing batch of ${batch.length} commits`);

      for (const commit of batch) {
        await this.commitToBlockchain(commit);
      }

      // Update stats
      const commitTime = Date.now() - startTime;
      this.commitStats.lastSyncTime = Date.now();
      this.commitStats.averageCommitTime = 
        (this.commitStats.averageCommitTime * this.commitStats.totalCommits + commitTime) / 
        (this.commitStats.totalCommits + batch.length);
      this.commitStats.totalCommits += batch.length;

    } catch (error) {
      console.error('[BlockchainSync] Batch processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // Commit single event to blockchain
  private async commitToBlockchain(commit: PendingCommit): Promise<boolean> {
    try {
      const { event } = commit;
      
      // Determine category based on event type
      const category = this.mapEventToCategory(event);
      
      // Prepare data for blockchain
      const blockchainData = {
        runDir: `sim_${event.botId}_${event.timestamp}`,
        score: event.metadata?.score || this.calculateScore(event),
        timestamp: new Date(event.timestamp).toISOString(),
        data: event.data,
        category: category,
        source: event.source,
        type: event.type,
        botId: event.botId,
        metadata: event.metadata
      };

      // Post to blockchain
      await this.blockchain.postAnomaly(category, blockchainData);
      
      console.log(`[BlockchainSync] Committed ${commit.id} to ${category}`);
      return true;

    } catch (error) {
      console.error(`[BlockchainSync] Failed to commit ${commit.id}:`, error);
      
      // Retry logic
      if (commit.retryCount < 3) {
        commit.retryCount++;
        // Re-queue with lower priority
        this.queueCommit(commit.event, commit.priority * 0.8);
      } else {
        this.commitStats.failedCommits++;
      }
      
      return false;
    }
  }

  // Map simulation event to blockchain category
  private mapEventToCategory(event: SimulationEvent): string {
    const categoryMap: { [key: string]: string } = {
      'trajectory': 'Event Density',
      'anomaly': 'Phase Anomaly',
      'coordination': 'Spiral Phase Dynamics',
      'topology': 'Simulation Summary',
      'spectral': 'randomness',
      'stuckness': 'structure'
    };

    return categoryMap[event.type] || 'Simulation Summary';
  }

  // Calculate importance score for event
  private calculateScore(event: SimulationEvent): number {
    let score = 0;

    // Base score from metadata
    if (event.metadata?.score) {
      score += event.metadata.score;
    }

    // Boost for certain event types
    const typeBoosts: { [key: string]: number } = {
      'anomaly': 2.0,
      'stuckness': 1.5,
      'spectral': 1.3,
      'coordination': 1.2,
      'topology': 1.1,
      'trajectory': 1.0
    };
    score *= (typeBoosts[event.type] || 1.0);

    // Boost for high-priority bots
    if (event.botId < 4) {
      score *= 1.2; // First 4 bots are "leader" bots
    }

    return Math.min(score, 1000); // Cap at 1000
  }

  // Force immediate sync of all pending commits
  async forceSync(): Promise<void> {
    console.log(`[BlockchainSync] Force syncing ${this.pendingCommits.length} commits`);
    
    while (this.pendingCommits.length > 0) {
      await this.processBatch();
    }
  }

  // Get sync statistics
  getStats(): {
    pendingCount: number;
    totalCommits: number;
    failedCommits: number;
    lastSyncTime: number;
    averageCommitTime: number;
    isSyncing: boolean;
  } {
    return {
      pendingCount: this.pendingCommits.length,
      ...this.commitStats,
      isSyncing: this.syncIntervalId !== null
    };
  }

  // Get pending commits (for debugging)
  getPendingCommits(): PendingCommit[] {
    return [...this.pendingCommits];
  }

  // Clear pending commits
  clearPending(): void {
    this.pendingCommits = [];
  }

  // Update sync options
  updateOptions(options: Partial<SyncOptions>): void {
    this.options = { ...this.options, ...options };
    
    // Restart if interval changed
    if (options.syncInterval && this.syncIntervalId) {
      this.stopSync();
      this.startSync();
    }
  }

  // Check if event should be committed immediately (bypass batching)
  shouldCommitImmediately(event: SimulationEvent): boolean {
    // High priority events
    if (event.type === 'stuckness' && event.data?.isStuck) {
      return true;
    }
    
    // Critical anomalies
    if (event.type === 'anomaly' && event.metadata?.score && event.metadata.score > 0.9) {
      return true;
    }

    return false;
  }

  // Immediate commit (for critical events)
  async commitImmediate(event: SimulationEvent): Promise<boolean> {
    const id = this.queueCommit(event, 10); // Highest priority
    const commit = this.pendingCommits.find(p => p.id === id);
    
    if (commit) {
      // Remove from queue and commit immediately
      const index = this.pendingCommits.indexOf(commit);
      this.pendingCommits.splice(index, 1);
      return await this.commitToBlockchain(commit);
    }
    
    return false;
  }
}

// Factory function for creating sync instance
export function createBlockchainSync(
  blockchain: BlockchainManager,
  options?: SyncOptions
): BlockchainSync {
  return new BlockchainSync(blockchain, options);
}

export default BlockchainSync;
