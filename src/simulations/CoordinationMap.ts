// src/simulations/CoordinationMap.ts
// Simulation 2: Representational map of nonlocal coordination
// Visualizes bot coordination across dimensions using data from ParticleSimulation
import { createClient } from 'https://jspm.dev/@supabase/supabase-js'

const supabase = createClient(
 'https://xoolmbmnzbsvcqeyqvyi.supabase.co',
 'sb_publishable_A1cLFAKbAg77TfTkD2RB-w_PahU316T'
)

export async function runNextJob(simulationFn) {
 console.log('Checking for jobs...')
 const { data: job } = await supabase.from('jobs').select('*').eq('status', 'pending').limit(1).single()

 if (!job) return console.log('Standing by.');

 await supabase.from('jobs').update({ status: 'processing' }).eq('id', job.id)

 try {
 const result = await simulationFn(job.config)
 await supabase.from('jobs').update({ status: 'completed', result }).eq('id', job.id)
 console.log('Success! 🚀')
 } catch (err) {
 await supabase.from('jobs').update({ status: 'failed', result: { error: err.message } }).eq('id', job.id)
 }
}
import type { SimulationBridge, SimulationEvent } from '../bridge/SimulationBridge.js';
import type { BlockchainSync } from '../bridge/BlockchainSync.js';

export interface CoordinationNode {
  id: number;
  group: number;
  position: {
    x: number;
    y: number;
    z: number;
  };
  velocity: {
    dx: number;
    dy: number;
    dz: number;
  };
  metrics: {
    resonance: number;      // Connectivity to other bots
    irreducibility: number; // Independence measure
    phaseDiversity: number; // Phase spread
    entropy: number;        // Coordination entropy
  };
  state: {
    currentDimension: string;
    trajectory: { x: number; y: number; z: number }[];
    intendedTrajectory: { x: number; y: number; z: number }[];
    orientationHistory: { x: number; y: number; z: number }[];
  };
  lastUpdate: number;
}

export interface CoordinationEdge {
  source: number;
  target: number;
  strength: number;
  type: 'cooperation' | 'competition' | 'neutral';
  harmonicCoupling: number;
  lastUpdate: number;
}

export interface CoordinationCluster {
  id: number;
  nodes: number[];
  centroid: { x: number; y: number; z: number };
  cohesion: number;
  label: string;
}

export interface CoordinationSnapshot {
  timestamp: number;
  nodes: CoordinationNode[];
  edges: CoordinationEdge[];
  clusters: CoordinationCluster[];
  globalMetrics: {
    averageResonance: number;
    averageIrreducibility: number;
    coordinationEntropy: number;
    emergenceScore: number;
  };
}

export class CoordinationMap {
  private nodes: Map<number, CoordinationNode>;
  private edges: Map<string, CoordinationEdge>;
  private clusters: Map<number, CoordinationCluster>;
  private bridge: SimulationBridge | null;
  private blockchainSync: BlockchainSync | null;
  private unsubscribeFn: (() => void) | null;
  private updateInterval: number;
  private intervalId: NodeJS.Timeout | null;
  private history: CoordinationSnapshot[];
  private maxHistorySize: number;
  private matrixSize: number;
  private scale: number;

  constructor(
    bridge?: SimulationBridge,
    blockchainSync?: BlockchainSync,
    options: {
      updateInterval?: number;
      maxHistorySize?: number;
      matrixSize?: number;
      scale?: number;
    } = {}
  ) {
    this.nodes = new Map();
    this.edges = new Map();
    this.clusters = new Map();
    this.bridge = bridge || null;
    this.blockchainSync = blockchainSync || null;
    this.unsubscribeFn = null;
    this.updateInterval = options.updateInterval || 100; // 100ms default
    this.intervalId = null;
    this.history = [];
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.matrixSize = options.matrixSize || 5; // 5x5x5 matrix
    this.scale = options.scale || 10;

    // Initialize 5x5x5 grid positions
    this.initializeGrid();
  }

  // Initialize 5x5x5 grid of coordination nodes
  private initializeGrid(): void {
    let id = 0;
    for (let x = 0; x < this.matrixSize; x++) {
      for (let y = 0; y < this.matrixSize; y++) {
        for (let z = 0; z < this.matrixSize; z++) {
          const node: CoordinationNode = {
            id,
            group: id % 2, // Two groups for braided logic
            position: {
              x: x * this.scale,
              y: y * this.scale,
              z: z * this.scale
            },
            velocity: {
              dx: (Math.random() - 0.5) * 0.1,
              dy: (Math.random() - 0.5) * 0.1,
              dz: (Math.random() - 0.5) * 0.1
            },
            metrics: {
              resonance: 0.5,
              irreducibility: 0.5,
              phaseDiversity: 0.5,
              entropy: 0.5
            },
            state: {
              currentDimension: 'BASE',
              trajectory: [{ x: x * this.scale, y: y * this.scale, z: z * this.scale }],
              intendedTrajectory: [{ x: x * this.scale, y: y * this.scale, z: z * this.scale }],
              orientationHistory: [{ x: x * this.scale, y: y * this.scale, z: z * this.scale }]
            },
            lastUpdate: Date.now()
          };
          
          this.nodes.set(id, node);
          id++;
        }
      }
    }

    // Initialize edges between nearby nodes
    this.initializeEdges();
  }

  // Initialize edges based on spatial proximity
  private initializeEdges(): void {
    const nodes = Array.from(this.nodes.values());
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const node1 = nodes[i];
        const node2 = nodes[j];
        
        // Type guard - ensure nodes exist
        if (!node1 || !node2) continue;
        
        // Calculate distance
        const dx = node1.position.x - node2.position.x;
        const dy = node1.position.y - node2.position.y;
        const dz = node1.position.z - node2.position.z;
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        // Create edge if within threshold (adjacent in grid)
        if (distance <= this.scale * 1.5) {
          const edgeKey = this.getEdgeKey(node1.id, node2.id);
          const edge: CoordinationEdge = {
            source: node1.id,
            target: node2.id,
            strength: 1 - (distance / (this.scale * 1.5)),
            type: node1.group === node2.group ? 'cooperation' : 'neutral',
            harmonicCoupling: 0,
            lastUpdate: Date.now()
          };
          
          this.edges.set(edgeKey, edge);
        }
      }
    }
  }


  // Get unique key for edge
  private getEdgeKey(source: number, target: number): string {
    return source < target ? `${source}_${target}` : `${target}_${source}`;
  }

  // Subscribe to bridge events
  subscribeToBridge(): void {
    if (!this.bridge) return;

    // Subscribe to all relevant event types
    this.unsubscribeFn = this.bridge.subscribe(
      ['trajectory', 'anomaly', 'topology', 'coordination', 'spectral'],
      (event: SimulationEvent) => {
        this.handleBridgeEvent(event);
      }
    );

    console.log('[CoordinationMap] Subscribed to bridge events');
  }

  // Unsubscribe from bridge
  unsubscribeFromBridge(): void {
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
      console.log('[CoordinationMap] Unsubscribed from bridge');
    }
  }

  // Handle events from bridge
  private handleBridgeEvent(event: SimulationEvent): void {
    switch (event.type) {
      case 'trajectory':
        this.updateFromTrajectory(event);
        break;
      case 'anomaly':
        this.updateFromAnomaly(event);
        break;
      case 'topology':
        this.updateFromTopology(event);
        break;
      case 'coordination':
        this.updateFromCoordination(event);
        break;
      case 'spectral':
        this.updateFromSpectral(event);
        break;
    }
  }

  // Update coordination map from trajectory event
  private updateFromTrajectory(event: SimulationEvent): void {
    const node = this.nodes.get(event.botId);
    if (!node) return;

    const trajectory = event.data.trajectory || [];
    if (trajectory.length === 0) return;

    // Update current position from latest trajectory point
    const latest = trajectory[trajectory.length - 1];
    const prevPosition = { ...node.position };

    // Smooth position update
    node.position.x += (latest.x - node.position.x) * 0.1;
    node.position.y += (latest.y - node.position.y) * 0.1;
    node.position.z += (latest.z || 0 - node.position.z) * 0.1;

    // Update velocity
    node.velocity.dx = node.position.x - prevPosition.x;
    node.velocity.dy = node.position.y - prevPosition.y;
    node.velocity.dz = node.position.z - prevPosition.z;

    // Update trajectory history
    node.state.trajectory.push({ ...node.position });
    if (node.state.trajectory.length > 100) {
      node.state.trajectory.shift();
    }

    // Update intended trajectory (projected forward)
    const intendedNext = {
      x: node.position.x + node.velocity.dx * 5,
      y: node.position.y + node.velocity.dy * 5,
      z: node.position.z + node.velocity.dz * 5
    };
    node.state.intendedTrajectory.push(intendedNext);
    if (node.state.intendedTrajectory.length > 100) {
      node.state.intendedTrajectory.shift();
    }

    // Update orientation history
    node.state.orientationHistory.push({ ...node.position });
    if (node.state.orientationHistory.length > 50) {
      node.state.orientationHistory.shift();
    }

    // Update dimension
    if (event.data.currentDimension) {
      node.state.currentDimension = event.data.currentDimension;
    }

    node.lastUpdate = Date.now();
  }

  // Update from anomaly event
  private updateFromAnomaly(event: SimulationEvent): void {
    const node = this.nodes.get(event.botId);
    if (!node) return;

    // Adjust metrics based on anomaly data
    const anomalies = event.data.anomalies || {};
    const score = event.metadata?.score || 0;

    // Higher anomaly score = lower coherence = higher irreducibility
    node.metrics.irreducibility = Math.min(1, node.metrics.irreducibility + score * 0.1);
    node.metrics.resonance = Math.max(0, node.metrics.resonance - score * 0.05);

    // Update edges based on anomaly patterns
    this.updateEdgesFromAnomaly(node, anomalies, score);
  }

  // Update edges based on anomaly patterns
  private updateEdgesFromAnomaly(
    node: CoordinationNode,
    anomalies: any,
    score: number
  ): void {
    // Find edges connected to this node
    for (const edge of this.edges.values()) {
      if (edge.source === node.id || edge.target === node.id) {
        // Adjust edge strength based on anomaly
        edge.strength = Math.max(0, edge.strength - score * 0.1);
        edge.harmonicCoupling = Math.min(1, edge.harmonicCoupling + score * 0.05);
        edge.lastUpdate = Date.now();
      }
    }
  }

  // Update from topology event
  private updateFromTopology(event: SimulationEvent): void {
    const node = this.nodes.get(event.botId);
    if (!node) return;

    // Update dimension state
    if (event.data.dimension) {
      node.state.currentDimension = event.data.dimension;
    }

    // Adjust metrics based on dimension transitions
    const anomalyCount = event.data.anomalyCount || 0;
    node.metrics.entropy = Math.min(1, node.metrics.entropy + anomalyCount * 0.01);
  }

  // Update from coordination event
  private updateFromCoordination(event: SimulationEvent): void {
    // Handle sync events from other coordination maps or system
    if (event.data.syncType === 'periodic') {
      // Process batch of events
      const events = event.data.events || [];
      events.forEach((e: SimulationEvent) => this.handleBridgeEvent(e));
    }
  }

  // Update from spectral event
  private updateFromSpectral(event: SimulationEvent): void {
    const node = this.nodes.get(event.botId);
    if (!node) return;

    // Update phase diversity based on spectral data
    const periodicityScore = event.data.periodicityScore || 0;
    node.metrics.phaseDiversity = Math.min(1, node.metrics.phaseDiversity + periodicityScore * 0.1);
  }

  // Start continuous updates
  startUpdates(): void {
    if (this.intervalId) return;

    this.subscribeToBridge();

    this.intervalId = setInterval(() => {
      this.performUpdate();
    }, this.updateInterval);

    console.log(`[CoordinationMap] Started updates (${this.updateInterval}ms interval)`);
  }

  // Stop continuous updates
  stopUpdates(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.unsubscribeFromBridge();
    console.log('[CoordinationMap] Stopped updates');
  }

  // Perform single update cycle
  private performUpdate(): void {
    // Update all node positions based on velocities
    for (const node of this.nodes.values()) {
      // Apply velocity with damping
      node.position.x += node.velocity.dx * 0.5;
      node.position.y += node.velocity.dy * 0.5;
      node.position.z += node.velocity.dz * 0.5;

      // Damping
      node.velocity.dx *= 0.95;
      node.velocity.dy *= 0.95;
      node.velocity.dz *= 0.95;

      // Keep within bounds
      const maxPos = this.matrixSize * this.scale;
      node.position.x = Math.max(0, Math.min(maxPos, node.position.x));
      node.position.y = Math.max(0, Math.min(maxPos, node.position.y));
      node.position.z = Math.max(0, Math.min(maxPos, node.position.z));
    }

    // Update edge strengths based on node proximity
    this.updateEdgeStrengths();

    // Detect and update clusters
    this.updateClusters();

    // Calculate global metrics
    const globalMetrics = this.calculateGlobalMetrics();

    // Create snapshot
    const snapshot: CoordinationSnapshot = {
      timestamp: Date.now(),
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      clusters: Array.from(this.clusters.values()),
      globalMetrics
    };

    // Add to history
    this.history.push(snapshot);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // Publish coordination update to bridge
    if (this.bridge) {
      this.bridge.publish({
        type: 'coordination',
        source: 'coordination',
        timestamp: Date.now(),
        botId: -1, // System
        data: {
          snapshot: this.getCurrentSnapshot(),
          globalMetrics
        },
        metadata: {
          score: globalMetrics.emergenceScore
        }
      });
    }

    // Queue for blockchain if significant emergence
    if (this.blockchainSync && globalMetrics.emergenceScore > 0.7) {
      this.blockchainSync.queueCommit({
        type: 'coordination',
        source: 'coordination',
        timestamp: Date.now(),
        botId: -1,
        data: globalMetrics,
        metadata: {
          score: globalMetrics.emergenceScore
        }
      }, 3);
    }
  }

  // Update edge strengths based on node proximity and metrics
  private updateEdgeStrengths(): void {
    for (const edge of this.edges.values()) {
      const source = this.nodes.get(edge.source);
      const target = this.nodes.get(edge.target);
      
      if (!source || !target) continue;

      // Calculate current distance
      const dx = source.position.x - target.position.x;
      const dy = source.position.y - target.position.y;
      const dz = source.position.z - target.position.z;
      const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

      // Update strength based on distance and group compatibility
      const baseStrength = 1 - (distance / (this.scale * 2));
      const groupBonus = source.group === target.group ? 0.2 : 0;
      const metricCompatibility = 1 - Math.abs(source.metrics.resonance - target.metrics.resonance);

      edge.strength = Math.max(0, Math.min(1, baseStrength + groupBonus + metricCompatibility * 0.3));
      edge.harmonicCoupling = (edge.harmonicCoupling + edge.strength) / 2;
    }
  }

  // Detect and update clusters
  private updateClusters(): void {
    // Simple clustering: group nodes by proximity and group membership
    const visited = new Set<number>();
    let clusterId = 0;
    this.clusters.clear();

    for (const node of this.nodes.values()) {
      if (visited.has(node.id)) continue;

      // Start new cluster
      const clusterNodes: number[] = [];
      const queue: number[] = [node.id];
      visited.add(node.id);

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        clusterNodes.push(currentId);

        // Find connected nodes
        for (const edge of this.edges.values()) {
          if (edge.strength < 0.3) continue; // Weak edges don't count

          const neighborId = edge.source === currentId ? edge.target :
                            edge.target === currentId ? edge.source : -1;
          
          if (neighborId !== -1 && !visited.has(neighborId)) {
            const neighbor = this.nodes.get(neighborId);
            if (neighbor && neighbor.group === node.group) {
              queue.push(neighborId);
              visited.add(neighborId);
            }
          }
        }
      }

      // Create cluster if large enough
      if (clusterNodes.length >= 3) {
        const centroid = this.calculateCentroid(clusterNodes);
        const cohesion = this.calculateCohesion(clusterNodes);

        this.clusters.set(clusterId, {
          id: clusterId,
          nodes: clusterNodes,
          centroid,
          cohesion,
          label: `Cluster_${clusterId}_G${node.group}`
        });

        clusterId++;
      }
    }
  }

  // Calculate centroid of nodes
  private calculateCentroid(nodeIds: number[]): { x: number; y: number; z: number } {
    const positions = nodeIds.map(id => this.nodes.get(id)?.position).filter(p => p !== undefined) as { x: number; y: number; z: number }[];
    
    if (positions.length === 0) return { x: 0, y: 0, z: 0 };

    return {
      x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
      y: positions.reduce((sum, p) => sum + p.y, 0) / positions.length,
      z: positions.reduce((sum, p) => sum + p.z, 0) / positions.length
    };
  }

  // Calculate cluster cohesion
  private calculateCohesion(nodeIds: number[]): number {
    const centroid = this.calculateCentroid(nodeIds);
    
    const distances = nodeIds.map(id => {
      const pos = this.nodes.get(id)?.position;
      if (!pos) return 0;
      const dx = pos.x - centroid.x;
      const dy = pos.y - centroid.y;
      const dz = pos.z - centroid.z;
      return Math.sqrt(dx*dx + dy*dy + dz*dz);
    });

    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    return Math.max(0, 1 - avgDistance / (this.scale * 2));
  }

  // Calculate global metrics
  private calculateGlobalMetrics(): {
    averageResonance: number;
    averageIrreducibility: number;
    coordinationEntropy: number;
    emergenceScore: number;
  } {
    const nodes = Array.from(this.nodes.values());
    
    if (nodes.length === 0) {
      return {
        averageResonance: 0,
        averageIrreducibility: 0,
        coordinationEntropy: 0,
        emergenceScore: 0
      };
    }

    const averageResonance = nodes.reduce((sum, n) => sum + n.metrics.resonance, 0) / nodes.length;
    const averageIrreducibility = nodes.reduce((sum, n) => sum + n.metrics.irreducibility, 0) / nodes.length;

    // Calculate entropy from edge distribution
    const edgeStrengths = Array.from(this.edges.values()).map(e => e.strength);
    const coordinationEntropy = edgeStrengths.length > 0 
      ? edgeStrengths.reduce((sum, s) => sum + s * Math.log(s + 0.001), 0) / edgeStrengths.length
      : 0;

    // Emergence score based on cluster quality and metric diversity
    const clusterCount = this.clusters.size;
    const metricDiversity = Math.abs(averageResonance - averageIrreducibility);
    const emergenceScore = Math.min(1, (clusterCount / 10) + metricDiversity);

    return {
      averageResonance,
      averageIrreducibility,
      coordinationEntropy,
      emergenceScore
    };
  }

  // Get current snapshot
  getCurrentSnapshot(): CoordinationSnapshot {
    return {
      timestamp: Date.now(),
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      clusters: Array.from(this.clusters.values()),
      globalMetrics: this.calculateGlobalMetrics()
    };
  }

  // Get history
  getHistory(): CoordinationSnapshot[] {
    return [...this.history];
  }

  // Get node by ID
  getNode(id: number): CoordinationNode | undefined {
    return this.nodes.get(id);
  }

  // Get all nodes
  getAllNodes(): CoordinationNode[] {
    return Array.from(this.nodes.values());
  }

  // Get edges for node
  getEdgesForNode(nodeId: number): CoordinationEdge[] {
    return Array.from(this.edges.values()).filter(
      e => e.source === nodeId || e.target === nodeId
    );
  }

  // Get statistics
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    clusterCount: number;
    historySize: number;
    isUpdating: boolean;
  } {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      clusterCount: this.clusters.size,
      historySize: this.history.length,
      isUpdating: this.intervalId !== null
    };
  }
}

export default CoordinationMap;
