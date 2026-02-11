// anomaly_metrics.ts

import type { State, Event } from './types.js';

/**
 * Enhanced Anomaly Detection and Signature Generation
 * Flexible for bot-defined anomaly criteria
 */
export interface Anomaly {
  id: string;
  score: number;
  category: string;
  description: string;
  timestamp: string;
  source: string; // e.g., 'simulation', 'bot'
}

export class AnomalyDetector {
    private thresholds: number[];
    private customCriteria: ((data: any) => Anomaly[])[] = [];

    constructor(thresholds: number[] = []) {
        this.thresholds = thresholds;
    }

    // Add custom anomaly detection criteria (for bots)
    addCustomCriterion(criterion: (data: any) => Anomaly[]) {
        this.customCriteria.push(criterion);
    }

    // Detect anomalies from simulation results
    detectAnomaliesFromResult(result: { trajectory: State[], events: Event[], config: any }, source: string = 'simulation'): Anomaly[] {
        const anomalies: Anomaly[] = [];

        // Default: Anomalies based on event counts or trajectory phases
        const eventCount = result.events.length;
        if (eventCount > 5) { // Arbitrary threshold
            anomalies.push({
                id: `event_${Date.now()}`,
                score: eventCount,
                category: 'Event Density',
                description: `High event count: ${eventCount}`,
                timestamp: new Date().toISOString(),
                source
            });
        }

        const phaseData = result.trajectory.map(s => s.phase);
        const phaseAnomalies = this.detectAnomalies(phaseData);
        phaseAnomalies.forEach((val, idx) => {
            anomalies.push({
                id: `phase_${idx}_${Date.now()}`,
                score: val,
                category: 'Phase Anomaly',
                description: `Phase value: ${val}`,
                timestamp: new Date().toISOString(),
                source
            });
        });

        // Apply custom criteria
        this.customCriteria.forEach(criterion => {
            anomalies.push(...criterion(result));
        });

        return anomalies;
    }

    detectAnomalies(data: number[]): number[] {
        return data.filter((value, index) => {
            return value > (this.thresholds[index] || 0);
        });
    }

    generateSignatures(anomalies: number[]): string[] {
        return anomalies.map(anomaly => `Sig_${anomaly}_${new Date().toISOString()}`);
    }
}
