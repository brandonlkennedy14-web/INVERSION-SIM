// src/browser.ts
import { TopologyRenderer } from './visualization/TopologyRenderer.js';
import { MirrorInversion } from './variants/mirror_inversion.js';
import { SquareClampReflect } from './variants/square_clamp_reflect.js';
import { SquareInversionReflect } from './variants/square_inversion_reflect.js';
import { SquareStickyReflect } from './variants/square_sticky_reflect.js';
import { runVariant } from './core.js';
import type { RunConfig, InversionKind } from './types.js';
import BotFleet from './botFleet.js';
import * as THREE from 'three';

let currentRenderer: TopologyRenderer | ThreeDRenderer | AbstractRenderer | null = null;
let topologyRenderer: TopologyRenderer | null = null;
let currentResult: any = null;
let currentCfg: RunConfig;
let currentVariant = MirrorInversion;
let botFleet: BotFleet | null = null;

class ThreeDRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private zoomLevel: number = 1;
  private trajectoryLine: THREE.Line | null = null;
  private eventSpheres: THREE.Mesh[] = [];
  private inversionCubes: THREE.Mesh[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);
    this.camera.position.z = 10;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);
  }

  render(result: any, cfg: RunConfig, maxIndex?: number) {
    this.scene.clear();

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);

    const effectiveMax = maxIndex ?? result.trajectory.length;

    // Render trajectory as 3D line with multi-color segments
    const segmentLength = Math.floor(result.trajectory.length / 4);
    const colors = [0xff0000, 0x0000ff, 0x00ff00, 0x800080]; // red, blue, green, purple

    for (let segment = 0; segment < 4; segment++) {
      const startIdx = segment * segmentLength;
      const endIdx = segment === 3 ? result.trajectory.length : (segment + 1) * segmentLength;
      const positions = [];
      for (let i = startIdx; i < Math.min(endIdx, effectiveMax); i++) {
        const state = result.trajectory[i];
        positions.push(state.x, state.y, state.phase * 2);
      }
      if (positions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const material = new THREE.LineBasicMaterial({ color: colors[segment] });
        const line = new THREE.Line(geometry, material);
        this.scene.add(line);
      }
    }

    // Render events as spheres
    for (const event of result.events) {
      const geometry = new THREE.SphereGeometry(0.1);
      const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(event.x, event.y, event.phaseAfter * 2);
      this.scene.add(sphere);
    }

    // Render inversions as cubes
    for (const state of result.trajectory.slice(0, effectiveMax)) {
      if (state.inverted) {
        const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const material = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(state.x, state.y, state.phase * 2);
        this.scene.add(cube);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  animateTrajectory(result: any, cfg: RunConfig, speed: number = 50) {
    let maxIndex = 0;
    const animate = () => {
      this.render(result, cfg, maxIndex);
      maxIndex += speed;
      if (maxIndex < result.trajectory.length) {
        requestAnimationFrame(animate);
      }
    };
    animate();
  }

  zoom(factor: number) {
    this.zoomLevel *= factor;
    this.camera.position.z *= factor;
    this.render(currentResult, currentCfg);
  }
}

class AbstractRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLElement;
  private zoomLevel: number = 1;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 800;
    this.canvas.height = 600;
    this.ctx = this.canvas.getContext('2d')!;
    container.appendChild(this.canvas);
  }

  render(result: any, cfg: RunConfig, maxIndex?: number) {
    this.ctx.clearRect(0, 0, 800, 600);
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, 800, 600);

    const effectiveMax = maxIndex ?? result.trajectory.length;

    // Abstract representation: phase space with multi-color segments
    const segmentLength = Math.floor(result.trajectory.length / 4);
    const colors = ['red', 'blue', 'green', 'purple'];

    for (let segment = 0; segment < 4; segment++) {
      const startIdx = segment * segmentLength;
      const endIdx = segment === 3 ? result.trajectory.length : (segment + 1) * segmentLength;
      this.ctx.strokeStyle = colors[segment]!;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();

      for (let i = Math.max(startIdx + 1, 1); i < Math.min(endIdx, effectiveMax); i++) {
        const p1 = result.trajectory[i - 1];
        const p2 = result.trajectory[i];
        if (i === Math.max(startIdx + 1, 1)) {
          this.ctx.moveTo((p1.x / cfg.sizeX) * 800, (p1.y / cfg.sizeY) * 600);
        }
        this.ctx.lineTo((p2.x / cfg.sizeX) * 800, (p2.y / cfg.sizeY) * 600);
      }
      this.ctx.stroke();
    }

    // Events as abstract shapes
    for (const event of result.events) {
      this.ctx.fillStyle = `hsl(${event.phaseAfter * 360}, 100%, 70%)`;
      this.ctx.beginPath();
      this.ctx.arc((event.x / cfg.sizeX) * 800, (event.y / cfg.sizeY) * 600, 10, 0, 2 * Math.PI);
      this.ctx.fill();
    }
  }

  animateTrajectory(result: any, cfg: RunConfig, speed: number = 50) {
    let maxIndex = 0;
    const animate = () => {
      this.render(result, cfg, maxIndex);
      maxIndex += speed;
      if (maxIndex < result.trajectory.length) {
        requestAnimationFrame(animate);
      }
    };
    animate();
  }

  zoom(factor: number) {
    this.zoomLevel *= factor;
    this.render(currentResult, currentCfg);
  }
}

function getConfigFromUI(): RunConfig {
  const reducedPrimeGrowth = (document.getElementById('reducedPrimeGrowth') as HTMLInputElement).checked;
  const steps = parseInt((document.getElementById('steps') as HTMLInputElement).value);
  const inversionSchedule = [];

  if ((document.getElementById('inversionGEOM') as HTMLInputElement).checked) {
    inversionSchedule.push({ step: Math.floor(steps * 0.20), kind: "GEOM" as InversionKind });
  }
  if ((document.getElementById('inversionSPHERE') as HTMLInputElement).checked) {
    inversionSchedule.push({ step: Math.floor(steps * 0.40), kind: "SPHERE" as InversionKind });
  }
  if ((document.getElementById('inversionOBSERVER') as HTMLInputElement).checked) {
    inversionSchedule.push({ step: Math.floor(steps * 0.60), kind: "OBSERVER" as InversionKind });
  }
  if ((document.getElementById('inversionCAUSAL') as HTMLInputElement).checked) {
    inversionSchedule.push({ step: Math.floor(steps * 0.80), kind: "CAUSAL" as InversionKind });
  }

  return {
    sizeX: parseInt((document.getElementById('sizeX') as HTMLInputElement).value),
    sizeY: parseInt((document.getElementById('sizeY') as HTMLInputElement).value),
    x0: parseInt((document.getElementById('x0') as HTMLInputElement).value),
    y0: parseInt((document.getElementById('y0') as HTMLInputElement).value),
    vx0: parseInt((document.getElementById('vx0') as HTMLInputElement).value),
    vy0: parseInt((document.getElementById('vy0') as HTMLInputElement).value),
    phase0: 0,
    steps: steps,
    multiplier: reducedPrimeGrowth ? 3 : 7,
    mod: 1000003,
    inversionSchedule: inversionSchedule,
  };
}

function getColorModeFromUI(): string {
  const colorModeSelect = document.getElementById('colorMode') as HTMLSelectElement;
  return colorModeSelect.value;
}

function runSimulation() {
  console.log("Running simulation in browser...");

  currentCfg = getConfigFromUI();
  currentResult = runVariant(currentVariant, currentCfg);

  console.log("Simulation complete");
  console.log(`Events: ${currentResult.events.length}`);
  console.log(`Trajectory points: ${currentResult.trajectory.length}`);

  // Default to 2D view
  switchToMode('2D');
}

function switchToMode(mode: string) {
  const visualization = document.getElementById('visualization')!;
  visualization.innerHTML = '';

  if (currentRenderer) {
    // Clean up previous renderer if needed
  }

  const colorMode = getColorModeFromUI();

  if (mode === '2D') {
    topologyRenderer = new TopologyRenderer(visualization, 800, 600);
    topologyRenderer.setColorMode(colorMode);
    topologyRenderer.renderGrid(currentResult.trajectory, currentCfg.sizeX, currentCfg.sizeY);
    topologyRenderer.animateTrajectory(currentResult.trajectory, 50, true); // Enable looping
    topologyRenderer.renderEvents(currentResult.events);
    topologyRenderer.renderInversions(currentResult.trajectory);
    currentRenderer = topologyRenderer;
  } else if (mode === '3D') {
    currentRenderer = new ThreeDRenderer(visualization);
    (currentRenderer as ThreeDRenderer).animateTrajectory(currentResult, currentCfg);
  } else if (mode === 'Abstract') {
    currentRenderer = new AbstractRenderer(visualization);
    (currentRenderer as AbstractRenderer).animateTrajectory(currentResult, currentCfg);
  } else if (mode === 'Toroidal') {
    if (!topologyRenderer) {
      topologyRenderer = new TopologyRenderer(visualization, 800, 600);
    }
    topologyRenderer.setColorMode(colorMode);
    topologyRenderer.animateToroidal(currentResult.trajectory, currentCfg.sizeX, currentCfg.sizeY);
    currentRenderer = topologyRenderer;
  } else if (mode === 'Hyperbolic') {
    if (!topologyRenderer) {
      topologyRenderer = new TopologyRenderer(visualization, 800, 600);
    }
    topologyRenderer.setColorMode(colorMode);
    topologyRenderer.animateHyperbolic(currentResult.trajectory);
    currentRenderer = topologyRenderer;
  } else if (mode === 'PhaseSpace') {
    if (!topologyRenderer) {
      topologyRenderer = new TopologyRenderer(visualization, 800, 600);
    }
    topologyRenderer.setColorMode(colorMode);
    topologyRenderer.animatePhaseSpace(currentResult.trajectory);
    currentRenderer = topologyRenderer;
  }
}

function zoom(factor: number) {
  if (currentRenderer instanceof TopologyRenderer) {
    currentRenderer.zoom(factor);
  } else if (currentRenderer instanceof ThreeDRenderer) {
    currentRenderer.zoom(factor);
  } else if (currentRenderer instanceof AbstractRenderer) {
    currentRenderer.zoom(factor);
  }
}

// Event listeners
window.addEventListener('load', () => {
  const runSimBtn = document.getElementById('runSim');
  const mode2DBtn = document.getElementById('mode2D');
  const mode3DBtn = document.getElementById('mode3D');
  const modeAbstractBtn = document.getElementById('modeAbstract');
  const toroidalBtn = document.getElementById('toroidal');
  const hyperbolicBtn = document.getElementById('hyperbolic');
  const phaseSpaceBtn = document.getElementById('phaseSpace');
  const variantMirrorBtn = document.getElementById('variantMirror');
  const variantSquareClampBtn = document.getElementById('variantSquareClamp');
  const variantSquareInversionBtn = document.getElementById('variantSquareInversion');
  const variantSquareStickyBtn = document.getElementById('variantSquareSticky');
  const zoomInBtn = document.getElementById('zoomIn');
  const zoomOutBtn = document.getElementById('zoomOut');
  const colorModeSelect = document.getElementById('colorMode') as HTMLSelectElement;

  if (runSimBtn) runSimBtn.addEventListener('click', runSimulation);
  if (mode2DBtn) mode2DBtn.addEventListener('click', () => switchToMode('2D'));
  if (mode3DBtn) mode3DBtn.addEventListener('click', () => switchToMode('3D'));
  if (modeAbstractBtn) modeAbstractBtn.addEventListener('click', () => switchToMode('Abstract'));
  if (toroidalBtn) toroidalBtn.addEventListener('click', () => switchToMode('Toroidal'));
  if (hyperbolicBtn) hyperbolicBtn.addEventListener('click', () => switchToMode('Hyperbolic'));
  if (phaseSpaceBtn) phaseSpaceBtn.addEventListener('click', () => switchToMode('PhaseSpace'));
  if (variantMirrorBtn) variantMirrorBtn.addEventListener('click', () => { currentVariant = MirrorInversion; runSimulation(); });
  if (variantSquareClampBtn) variantSquareClampBtn.addEventListener('click', () => { currentVariant = SquareClampReflect; runSimulation(); });
  if (variantSquareInversionBtn) variantSquareInversionBtn.addEventListener('click', () => { currentVariant = SquareInversionReflect; runSimulation(); });
  if (variantSquareStickyBtn) variantSquareStickyBtn.addEventListener('click', () => { currentVariant = SquareStickyReflect; runSimulation(); });
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoom(1.2));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoom(0.8));

  // Add listeners for config inputs to update on change
  const configInputs = ['sizeX', 'sizeY', 'x0', 'y0', 'vx0', 'vy0', 'steps', 'reducedPrimeGrowth', 'inversionGEOM', 'inversionSPHERE', 'inversionOBSERVER', 'inversionCAUSAL'];
  configInputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('input', runSimulation);
      element.addEventListener('change', runSimulation);
    }
  });

  // Add listener for color mode
  if (colorModeSelect) {
    colorModeSelect.addEventListener('change', () => {
      const colorMode = getColorModeFromUI();
      if (topologyRenderer) {
        topologyRenderer.setColorMode(colorMode);
        // Re-render current view if it's 2D or advanced modes
        if (currentRenderer === topologyRenderer) {
          // Determine current mode and re-render
          // For simplicity, re-run simulation to update
          runSimulation();
        }
      }
    });
  }

  // Add listener for animation speed
  const animationSpeedInput = document.getElementById('animationSpeed') as HTMLInputElement;
  if (animationSpeedInput) {
    animationSpeedInput.addEventListener('input', () => {
      // Re-run simulation to apply new speed
      runSimulation();
    });
  }

  const runBotsBtn = document.getElementById('runBots');
  if (runBotsBtn) runBotsBtn.addEventListener('click', runBotFleet);

  const startContinuousBotsBtn = document.getElementById('startContinuousBots');
  if (startContinuousBotsBtn) startContinuousBotsBtn.addEventListener('click', startContinuousBotFleet);

  const stopContinuousBotsBtn = document.getElementById('stopContinuousBots');
  if (stopContinuousBotsBtn) stopContinuousBotsBtn.addEventListener('click', stopContinuousBotFleet);

  const displayCategoriesBtn = document.getElementById('displayCategories');
  if (displayCategoriesBtn) displayCategoriesBtn.addEventListener('click', displayTop10Anomalies);

  const displayLogicSummaryBtn = document.getElementById('displayLogicSummary');
  if (displayLogicSummaryBtn) displayLogicSummaryBtn.addEventListener('click', displayBotLogicSummary);

  // Initial run
  runSimulation();
});

function runBotFleet() {
  console.log("Running bot fleet...");
  if (!botFleet) {
    botFleet = new BotFleet();
  }
  botFleet.runIteration();
  const group0Results = botFleet.getGroupResults(0);
  const group1Results = botFleet.getGroupResults(1);
  console.log("Group 0 results:", group0Results);
  console.log("Group 1 results:", group1Results);
  // Display results in UI or console
  alert(`Bot fleet run complete. Group 0: ${group0Results.length} bots, Group 1: ${group1Results.length} bots. Check console for details.`);
}

function startContinuousBotFleet() {
  console.log("Starting continuous bot fleet...");
  if (!botFleet) {
    botFleet = new BotFleet();
  }
  botFleet.startContinuousRunning(5000); // Run every 5 seconds
  // Auto-update logic summary every 5 seconds
  setInterval(() => {
    displayBotLogicSummary();
  }, 5000);
  alert("Bot fleet started continuously. Check console for updates.");
}

function stopContinuousBotFleet() {
  console.log("Stopping continuous bot fleet...");
  if (botFleet) {
    botFleet.stopContinuousRunning();
  }
  alert("Bot fleet stopped.");
}

function displayBotCategories() {
  if (!botFleet) {
    alert("No bot fleet running.");
    return;
  }
  const categories = botFleet.getCategories();
  let message = "Bot Categories:\n";
  for (const [cat, data] of categories) {
    message += `${cat}: ${data.length} entries\n`;
  }
  alert(message);
}

function displayTop10Anomalies() {
  if (!botFleet) {
    alert("No bot fleet running.");
    return;
  }
  const categories = botFleet.getCategories();
  const allAnomalies: any[] = [];
  for (const [category, anomalies] of categories) {
    anomalies.forEach(anomaly => {
      allAnomalies.push({ ...anomaly, category });
    });
  }
  allAnomalies.sort((a, b) => b.score - a.score);
  const top10 = allAnomalies.slice(0, 10);

  const tableBody = document.querySelector('#anomaliesTable tbody');
  if (tableBody) {
    tableBody.innerHTML = '';
    top10.forEach((anomaly, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${anomaly.category}</td>
        <td>${anomaly.score}</td>
        <td>${anomaly.description || 'N/A'}</td>
        <td>${new Date(anomaly.timestamp).toLocaleString()}</td>
      `;
      tableBody.appendChild(row);
    });
  }
}

function displayBotLogicSummary() {
  if (!botFleet) {
    alert("No bot fleet running.");
    return;
  }
  const summary = botFleet.getLogicSummary();
  const summaryText = document.getElementById('logicSummaryText');
  if (summaryText) {
    summaryText.textContent = summary;
  } else {
    alert(summary);
  }
}
