// src/bridge/SimulationBridge.ts
// Pub/Sub Event Bus for live updates between ParticleSimulation and CoordinationMap
// Provides fast, real-time communication separate from blockchain persistence

export interface SimulationEvent {
  type: 'trajectory' | 'anomaly' | 'coordination' | 'topology' | 'spectral' | 'stuckness';
  source: 'particle' | 'coordination';
  timestamp: number;
  botId: number;
  data: any;
  metadata?: {
    dimension?: string;
    phase?: number;
    score?: number;
  };
}

export interface EventSubscriber {
  (event: SimulationEvent): void;
}

export class SimulationBridge {
  private subscribers: Map<string, Set<EventSubscriber>>;
  private eventHistory: SimulationEvent[];
  private maxHistorySize: number;
  private updateInterval: number;
  private intervalId: NodeJS.Timeout | null;

  constructor(options: { maxHistorySize?: number; updateInterval?: number } = {}) {
    this.subscribers = new Map();
    this.eventHistory = [];
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.updateInterval = options.updateInterval || 100; // Default 100ms
    this.intervalId = null;
  }

  // Subscribe to specific event types
  subscribe(eventTypes: string[], callback: EventSubscriber): () => void {
    const unsubscribeFns: (() => void)[] = [];

    for (const eventType of eventTypes) {
      if (!this.subscribers.has(eventType)) {
        this.subscribers.set(eventType, new Set());
      }
      this.subscribers.get(eventType)!.add(callback);
      
      // Return unsubscribe function for this type
      unsubscribeFns.push(() => {
        const subs = this.subscribers.get(eventType);
        if (subs) {
          subs.delete(callback);
        }
      });
    }

    // Return combined unsubscribe function
    return () => {
      unsubscribeFns.forEach(fn => fn());
    };
  }

  // Publish event to all subscribers
  publish(event: SimulationEvent): void {
    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Notify subscribers
    const subs = this.subscribers.get(event.type);
    if (subs) {
      subs.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error(`Error in event subscriber for ${event.type}:`, error);
        }
      });
    }

    // Also notify wildcard subscribers
    const wildcards = this.subscribers.get('*');
    if (wildcards) {
      wildcards.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error(`Error in wildcard subscriber:`, error);
        }
      });
    }
  }

  // Start automatic broadcasting at configured interval
  startBroadcasting(): void {
    if (this.intervalId) return; // Already running
    
    this.intervalId = setInterval(() => {
      // Process any queued events or perform periodic sync
      this.performPeriodicSync();
    }, this.updateInterval);
  }

  // Stop automatic broadcasting
  stopBroadcasting(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Perform periodic synchronization between simulations
  private performPeriodicSync(): void {
    // This can be used to batch events or perform cleanup
    const recentEvents = this.getRecentEvents(100);
    
    // Emit sync event for coordination map to process
    if (recentEvents.length > 0) {
      this.publish({
        type: 'coordination',
        source: 'particle',
        timestamp: Date.now(),
        botId: -1, // System bot
        data: {
          syncType: 'periodic',
          eventCount: recentEvents.length,
          events: recentEvents
        }
      });
    }
  }

  // Get recent events from history
  getRecentEvents(count: number = 100): SimulationEvent[] {
    return this.eventHistory.slice(-count);
  }

  // Get events for specific bot
  getBotEvents(botId: number, eventTypes?: string[]): SimulationEvent[] {
    return this.eventHistory.filter(e => {
      if (e.botId !== botId) return false;
      if (eventTypes && !eventTypes.includes(e.type)) return false;
      return true;
    });
  }

  // Get events by type
  getEventsByType(type: string, count: number = 100): SimulationEvent[] {
    return this.eventHistory
      .filter(e => e.type === type)
      .slice(-count);
  }

  // Clear history
  clearHistory(): void {
    this.eventHistory = [];
  }

  // Get bridge statistics
  getStats(): {
    subscriberCount: number;
    historySize: number;
    isBroadcasting: boolean;
    updateInterval: number;
  } {
    let subscriberCount = 0;
    this.subscribers.forEach(subs => {
      subscriberCount += subs.size;
    });

    return {
      subscriberCount,
      historySize: this.eventHistory.length,
      isBroadcasting: this.intervalId !== null,
      updateInterval: this.updateInterval
    };
  }

  // Transform raw trajectory data to coordination metrics
  static transformToCoordinationMetrics(trajectoryData: any): any {
    const positions = trajectoryData.positions || [];
    const events = trajectoryData.events || [];
    
    // Calculate coordination metrics
    const metrics = {
      // Spatial coherence - how clustered positions are
      spatialCoherence: calculateSpatialCoherence(positions),
      
      // Temporal regularity - how periodic the events are
      temporalRegularity: calculateTemporalRegularity(events),
      
      // Dimensional coverage - which dimensions were visited
      dimensionalCoverage: trajectoryData.dimensions || [],
      
      // Anomaly density - events per step
      anomalyDensity: events.length / (trajectoryData.steps || 1),
      
      // Nonlocal correlation - cross-dimensional patterns
      nonlocalCorrelation: calculateNonlocalCorrelation(trajectoryData)
    };

    return metrics;
  }

  // Transform coordination data to visualization format
  static transformToVisualizationFormat(coordinationData: any): any {
    return {
      nodes: coordinationData.bots?.map((bot: any) => ({
        id: bot.id,
        x: bot.position?.x || 0,
        y: bot.position?.y || 0,
        z: bot.position?.z || 0,
        group: bot.group,
        metrics: bot.metrics
      })) || [],
      
      edges: coordinationData.connections?.map((conn: any) => ({
        source: conn.source,
        target: conn.target,
        strength: conn.strength,
        type: conn.type
      })) || [],
      
      clusters: coordinationData.clusters || [],
      timestamp: Date.now()
    };
  }
}

// Helper functions for metric calculations
function calculateSpatialCoherence(positions: any[]): number {
  if (positions.length < 2) return 0;
  
  // Calculate centroid
  const centroid = positions.reduce((acc, pos) => ({
    x: acc.x + (pos.x || 0) / positions.length,
    y: acc.y + (pos.y || 0) / positions.length,
    z: acc.z + (pos.z || 0) / positions.length
  }), { x: 0, y: 0, z: 0 });
  
  // Calculate average distance from centroid
  const avgDistance = positions.reduce((sum, pos) => {
    const dx = (pos.x || 0) - centroid.x;
    const dy = (pos.y || 0) - centroid.y;
    const dz = (pos.z || 0) - centroid.z;
    return sum + Math.sqrt(dx*dx + dy*dy + dz*dz);
  }, 0) / positions.length;
  
  // Coherence is inverse of spread (normalized)
  return Math.max(0, 1 - avgDistance / 100);
}

function calculateTemporalRegularity(events: any[]): number {
  if (events.length < 2) return 0;
  
  // Calculate time differences between events
  const diffs = [];
  for (let i = 1; i < events.length; i++) {
    const t1 = events[i-1].step || events[i-1].timestamp || 0;
    const t2 = events[i].step || events[i].timestamp || 0;
    diffs.push(Math.abs(t2 - t1));
  }
  
  if (diffs.length === 0) return 0;
  
  // Calculate variance of differences
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / diffs.length;
  
  // Regularity is inverse of variance (normalized)
  return Math.max(0, 1 - variance / 10000);
}

function calculateNonlocalCorrelation(trajectoryData: any): number {
  // Check for patterns across different dimensions
  const dimensions = trajectoryData.dimensions || [];
  const inversions = trajectoryData.inversions || [];
  
  if (dimensions.length === 0 || inversions.length === 0) return 0;
  
  // Count how many dimensions show similar patterns
  let correlatedDimensions = 0;
  const dimensionPatterns = new Map();
  
  for (const inv of inversions) {
    const dim = inv.dimension || 'unknown';
    const pattern = `${inv.type}_${Math.floor(inv.phase * 10)}`;
    
    if (!dimensionPatterns.has(dim)) {
      dimensionPatterns.set(dim, new Set());
    }
    dimensionPatterns.get(dim).add(pattern);
  }
  
  // Check for pattern overlap between dimensions
  const patternSets = Array.from(dimensionPatterns.values());
  for (let i = 0; i < patternSets.length; i++) {
    for (let j = i + 1; j < patternSets.length; j++) {
      const intersection = new Set([...patternSets[i]].filter(x => patternSets[j].has(x)));
      if (intersection.size > 0) {
        correlatedDimensions++;
      }
    }
  }
  
  return Math.min(1, correlatedDimensions / Math.max(1, dimensions.length));
}

// Singleton instance for global use
let globalBridge: SimulationBridge | null = null;

export function getGlobalBridge(): SimulationBridge {
  if (!globalBridge) {
    globalBridge = new SimulationBridge();
  }
  return globalBridge;
}

export function resetGlobalBridge(): void {
  if (globalBridge) {
    globalBridge.stopBroadcasting();
    globalBridge.clearHistory();
  }
  globalBridge = new SimulationBridge();
}

export default SimulationBridge;
