import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.resolve('./');
const ANOMALIES_DIR = path.join(BASE_DIR, 'anomalies');
const RUNS_DIR = path.join(BASE_DIR, 'runs');
const SUMMARY_PATH = path.join(BASE_DIR, 'summary.txt');

// Read anomaly stores
function readAnomalyStore(file) {
  const filePath = path.join(ANOMALIES_DIR, file);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`Error reading ${file}:`, error);
      return [];
    }
  }
  return [];
}

// Generate deductions based on top anomalies
function generateDeductions(anomalies, type) {
  if (anomalies.length === 0) return `No ${type} anomalies detected.`;

  const top = anomalies[0];
  let deductions = `Top ${type} anomaly: Score ${top.anomalies[type]}, Run ${top.run}\n`;
  deductions += `Configuration: Multiplier ${top.cfg.multiplier}, Size ${top.cfg.sizeX}x${top.cfg.sizeY}, Steps ${top.cfg.steps}\n\n`;

  switch (type) {
    case 'randomness':
      deductions += `- High randomness indicates chaotic event distribution, potentially from high multipliers or large grids.\n`;
      deductions += `- Entropy correlates with system instability; lower thresholds suggest stable configurations.\n`;
      break;
    case 'structure':
      deductions += `- Structure measures order; high values suggest periodic or symmetric trajectories.\n`;
      deductions += `- Related to conserved quantities in dynamical systems.\n`;
      break;
    case 'reemergence':
      deductions += `- Reemergence distance indicates delayed symmetry breaking.\n`;
      deductions += `- Longer distances suggest robust phase transitions.\n`;
      break;
  }

  return deductions;
}

// Analyze latest runs for patterns
function analyzeLatestRuns() {
  if (!fs.existsSync(RUNS_DIR)) return 'No runs directory found.';
  const runDirs = fs.readdirSync(RUNS_DIR).filter(d => d.startsWith('run_')).sort().reverse().slice(0, 10);
  let analysis = 'Latest 10 runs analysis:\n';
  runDirs.forEach(runDir => {
    const configPath = path.join(RUNS_DIR, runDir, `${runDir}.config.json`);
    if (fs.existsSync(configPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        analysis += `- ${runDir}: Multiplier ${cfg.multiplier}, Size ${cfg.sizeX}x${cfg.sizeY}\n`;
      } catch (e) {
        analysis += `- ${runDir}: Config read error\n`;
      }
    }
  });
  return analysis;
}

// Main function
function generateSummary() {
  const randomnessAnomalies = readAnomalyStore('randomness_top.json');
  const structureAnomalies = readAnomalyStore('structure_top.json');
  const reemergenceAnomalies = readAnomalyStore('reemergence_top.json');

  let summary = 'INVERSION SIMULATION SUMMARY\n\n';
  summary += 'Logical Definitions:\n';
  summary += '- Randomness: Entropy measure of event distribution (higher = more chaotic).\n';
  summary += '- Structure: Complement of randomness (higher = more ordered).\n';
  summary += '- Reemergence: Steps to inversion point (higher = delayed breaking).\n\n';

  summary += 'Key Deductions:\n';
  summary += generateDeductions(randomnessAnomalies, 'randomness');
  summary += generateDeductions(structureAnomalies, 'structure');
  summary += generateDeductions(reemergenceAnomalies, 'reemergence');

  summary += '\nSimulation Results:\n';
  summary += `- Total randomness anomalies: ${randomnessAnomalies.length}\n`;
  summary += `- Total structure anomalies: ${structureAnomalies.length}\n`;
  summary += `- Total reemergence anomalies: ${reemergenceAnomalies.length}\n\n`;

  summary += analyzeLatestRuns();

  fs.writeFileSync(SUMMARY_PATH, summary);
  console.log('Summary generated at summary.txt');
}

generateSummary();
