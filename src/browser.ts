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

// Global variables
let currentCfg: RunConfig;
let currentResult: any;
let currentVariant: any = SquareInversionReflect;
let topologyRenderer: TopologyRenderer | null = null;
let currentRenderer: any = null;
let ws: WebSocket;
let botFleet: BotFleet | null = null;

let botsData: any[] = [];


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
        const material = new THREE.LineBasicMaterial({ color: colors[segment] || 0xff0000 });
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

  animateTrajectory(result: any, cfg: RunConfig, speed: number = 0.1) {
    let maxIndex = 0;
    const animate = () => {
      this.render(result, cfg, maxIndex);
      maxIndex += speed;
      if (maxIndex >= result.trajectory.length) {
        maxIndex = 0; // Loop back to start
      }
      requestAnimationFrame(animate);
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

  animateTrajectory(result: any, cfg: RunConfig, speed: number = 0.5) {
    let maxIndex = 0;
    const animate = () => {
      this.render(result, cfg, maxIndex);
      maxIndex += speed;
      if (maxIndex >= result.trajectory.length) {
        maxIndex = 0; // Loop back to start
      }
      requestAnimationFrame(animate);
    };
    animate();
  }

  zoom(factor: number) {
    this.zoomLevel *= factor;
    this.render(currentResult, currentCfg);
  }
}

function getConfigFromUI(): RunConfig {
  const sizeX = parseInt((document.getElementById('sizeX') as HTMLInputElement).value) || 5;
  const sizeY = parseInt((document.getElementById('sizeY') as HTMLInputElement).value) || 7;
  const x0 = parseFloat((document.getElementById('x0') as HTMLInputElement).value) || 1;
  const y0 = parseFloat((document.getElementById('y0') as HTMLInputElement).value) || 1;
  const vx0 = parseFloat((document.getElementById('vx0') as HTMLInputElement).value) || 1;
  const vy0 = parseFloat((document.getElementById('vy0') as HTMLInputElement).value) || 1;
  const steps = parseInt((document.getElementById('steps') as HTMLInputElement).value) || 200003;
  const multiplier = parseInt((document.getElementById('multiplier') as HTMLInputElement)?.value) || 7; // Assuming there's a multiplier input, else default
  const inversionGEOM = (document.getElementById('inversionGEOM') as HTMLInputElement).checked;
  const inversionSPHERE = (document.getElementById('inversionSPHERE') as HTMLInputElement).checked;
  const inversionOBSERVER = (document.getElementById('inversionOBSERVER') as HTMLInputElement).checked;
  const inversionCAUSAL = (document.getElementById('inversionCAUSAL') as HTMLInputElement).checked;

  const inversionSchedule: { step: number; kind: InversionKind }[] = [];
  if (inversionGEOM) inversionSchedule.push({ step: Math.floor(steps * 0.20), kind: "GEOM" });
  if (inversionSPHERE) inversionSchedule.push({ step: Math.floor(steps * 0.40), kind: "SPHERE" });
  if (inversionOBSERVER) inversionSchedule.push({ step: Math.floor(steps * 0.60), kind: "OBSERVER" });
  if (inversionCAUSAL) inversionSchedule.push({ step: Math.floor(steps * 0.80), kind: "CAUSAL" });

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
    inversionSchedule,
  };
}

function getColorModeFromUI(): string {
  const colorModeSelect = document.getElementById('colorMode') as HTMLSelectElement;
  return colorModeSelect ? colorModeSelect.value : 'normal';
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
  } else if (mode === '3DAutorunner') {
    autorunner3DRenderer = new Autorunner3DRenderer(visualization);
    currentRenderer = autorunner3DRenderer;
    // Initial render
    autorunner3DRenderer.render();
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

// Autorunner data storage
let autorunners: Map<number, any> = new Map();
let autorunnerAnimations: Map<number, { startPos: { x: number; y: number; z: number }; endPos: { x: number; y: number; z: number }; startTime: number; duration: number }> = new Map();
let animationFrameId: number | null = null;
let autorunnerStates: any[] = [];

// Initialize autorunnerStates with 5x5x5 grid
const matrixSize = 5;
const scale = 10;
const positions = [];
for (let x = 0; x < matrixSize; x++) {
  for (let y = 0; y < matrixSize; y++) {
    for (let z = 0; z < matrixSize; z++) {
      positions.push({ x: x * scale, y: y * scale, z: z * scale });
    }
  }
}
for (let i = 0; i < 125; i++) {
  const pos = positions[i];
  autorunnerStates.push({
    id: i,
    position: pos,
    intendedTrajectory: [pos],
    actualTrajectory: [pos],
    direction: { dx: Math.random() - 0.5, dy: Math.random() - 0.5, dz: Math.random() - 0.5 },
    group: i % 2,
    orientationHistory: [pos],
    geometry: { theta: Math.random() * Math.PI * 2, phi: Math.random() * Math.PI / 2 },
    luckScore: 0,
    randomLuckScore: 0
  });
}

class Autorunner3DRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private autorunnerMeshes: Map<number, THREE.Mesh> = new Map();
  private intendedLines: Map<number, THREE.Line> = new Map();
  private actualLines: Map<number, THREE.Line> = new Map();
  private arrows: Map<number, THREE.ArrowHelper> = new Map();
  private unitBox: THREE.LineSegments | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);
    this.camera.position.set(50, 50, 50);
    this.camera.lookAt(0, 0, 0);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);

    // Add axes
    const axesHelper = new THREE.AxesHelper(20);
    this.scene.add(axesHelper);

    // Add unit bounding box
    this.updateUnitBox();
  }

  updateUnitBox() {
    if (this.unitBox) this.scene.remove(this.unitBox);
    const positions = autorunnerStates.map(s => s.position);
    if (positions.length === 0) return;
    const minX = Math.min(...positions.map(p => p.x));
    const maxX = Math.max(...positions.map(p => p.x));
    const minY = Math.min(...positions.map(p => p.y));
    const maxY = Math.max(...positions.map(p => p.y));
    const minZ = Math.min(...positions.map(p => p.z));
    const maxZ = Math.max(...positions.map(p => p.z));

    const geometry = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    const edges = new THREE.EdgesGeometry(geometry);
    this.unitBox = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.unitBox.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    this.scene.add(this.unitBox);
  }

  render() {
    autorunnerStates.forEach(state => {
      const id = state.id;
      const pos = state.position;

      // Update or create mesh for position
      let mesh = this.autorunnerMeshes.get(id);
      if (!mesh) {
        const geometry = new THREE.SphereGeometry(1);
        const material = new THREE.MeshBasicMaterial({ color: state.group === 0 ? 0x0000ff : 0xff0000 });
        mesh = new THREE.Mesh(geometry, material);
        this.autorunnerMeshes.set(id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(pos.x, pos.y, pos.z);

      // Intended trajectory: solid line
      let intendedLine = this.intendedLines.get(id);
      if (!intendedLine) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(state.intendedTrajectory.flatMap((p: {x: number, y: number, z: number}) => [p.x, p.y, p.z]), 3));
        const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
        intendedLine = new THREE.Line(geometry, material);
        this.intendedLines.set(id, intendedLine);
        this.scene.add(intendedLine);
      } else {
        const positions = state.intendedTrajectory.flatMap((p: {x: number, y: number, z: number}) => [p.x, p.y, p.z]);
        intendedLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        if (intendedLine.geometry.attributes.position) {
          intendedLine.geometry.attributes.position.needsUpdate = true;
        }
      }

      // Actual trajectory: dashed line
      let actualLine = this.actualLines.get(id);
      if (!actualLine) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(state.actualTrajectory.flatMap((p: {x: number, y: number, z: number}) => [p.x, p.y, p.z]), 3));
        const material = new THREE.LineDashedMaterial({ color: 0xff0000, dashSize: 2, gapSize: 1 });
        actualLine = new THREE.Line(geometry, material);
        actualLine.computeLineDistances();
        this.actualLines.set(id, actualLine);
        this.scene.add(actualLine);
      } else {
        const positions = state.actualTrajectory.flatMap((p: {x: number, y: number, z: number}) => [p.x, p.y, p.z]);
        actualLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        if (actualLine.geometry.attributes.position) {
          actualLine.geometry.attributes.position.needsUpdate = true;
        }
        actualLine.computeLineDistances();
      }

      // Arrow for intended direction
      let arrow = this.arrows.get(id);
      if (state.intendedTrajectory.length >= 2) {
        const last = state.intendedTrajectory[state.intendedTrajectory.length - 1]!;
        const prev = state.intendedTrajectory[state.intendedTrajectory.length - 2]!;
        const dir = new THREE.Vector3(last.x - prev.x, last.y - prev.y, last.z - prev.z).normalize();
        const origin = new THREE.Vector3(last.x, last.y, last.z);
        if (!arrow) {
          arrow = new THREE.ArrowHelper(dir, origin, 5, 0x00ff00);
          this.arrows.set(id, arrow);
          this.scene.add(arrow);
        } else {
          arrow.position.copy(origin);
          arrow.setDirection(dir);
        }
      }

      // Render orientation history as fading points
      if (state.orientationHistory) {
        state.orientationHistory.forEach((histPos, index) => {
          const opacity = (index + 1) / state.orientationHistory.length;
          const geometry = new THREE.SphereGeometry(0.5);
          const material = new THREE.MeshBasicMaterial({ color: state.group === 0 ? 0x0000ff : 0xff0000, transparent: true, opacity });
          const histMesh = new THREE.Mesh(geometry, material);
          histMesh.position.set(histPos.x, histPos.y, histPos.z);
          this.scene.add(histMesh);
        });
      }

      // Render current geometry as overlay matrix (5x5x5 grid)
      if (state.geometry) {
        const matrixSize = 5;
        const matrixScale = 0.5;
        for (let x = 0; x < matrixSize; x++) {
          for (let y = 0; y < matrixSize; y++) {
            for (let z = 0; z < matrixSize; z++) {
              const geomGeometry = new THREE.BoxGeometry(matrixScale, matrixScale, matrixScale);
              const geomMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
              const geomCube = new THREE.Mesh(geomGeometry, geomMaterial);
              geomCube.position.set(pos.x + (x - matrixSize / 2) * matrixScale, pos.y + (y - matrixSize / 2) * matrixScale, pos.z + (z - matrixSize / 2) * matrixScale);
              this.scene.add(geomCube);
            }
          }
        }
      }
    });

    this.updateUnitBox();
    this.renderer.render(this.scene, this.camera);
  }
}

let autorunner3DRenderer: Autorunner3DRenderer | null = null;

// WebSocket connection
function connectWebSocket() {
  ws = new WebSocket('ws://localhost:8080');
  ws.onopen = () => {
    console.log('Connected to autorunner WebSocket');
  };
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'runUpdate') {
      updateRunCount(data.runCount);
      updateAnomaliesTable(data.anomalies, data.logEntry, data.topK);
    } else if (data.type === 'autorunnerUpdate') {
      // Update individual autorunner data for 3D
      if (autorunner3DRenderer) {
        // Update the state
        let state = autorunnerStates.find(s => s.id === data.autorunnerId);
        if (!state) {
          state = {
            id: data.autorunnerId,
            position: data.position,
            intendedTrajectory: data.intendedTrajectory || [],
            actualTrajectory: data.trajectory || [],
            direction: data.direction,
            group: data.group,
            orientationHistory: [],
            geometry: { theta: 0, phi: 0 },
            luckScore: 0,
            randomLuckScore: 0
          };
          autorunnerStates.push(state);
        } else {
          state.position = data.position;
          state.direction = data.direction;
          state.actualTrajectory = data.trajectory;
          state.intendedTrajectory = data.intendedTrajectory || state.intendedTrajectory;
          state.group = data.group;
        }
        autorunner3DRenderer.render();
      }
    } else if (data.type === 'cycleUpdate') {
      // Update cycle count and collective data
      updateCycleCount(data.cycleCount);
      updateCollectiveAnomalies(data.collectiveAnomalies);
      updateTopKTables(data.topK);
      updateGroupSummaries(data.runnerData);
      if (autorunner3DRenderer) {
        autorunner3DRenderer.render();
      }
    }
  };
  ws.onclose = () => {
    console.log('WebSocket connection closed, retrying in 5 seconds...');
    setTimeout(connectWebSocket, 5000);
  };
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function updateRunCount(count: number) {
  const runCountElement = document.getElementById('runCount');
  if (runCountElement) {
    runCountElement.textContent = count.toString();
  }
}

function updateCycleCount(count: number) {
  const cycleCountElement = document.getElementById('cycleCount');
  if (cycleCountElement) {
    cycleCountElement.textContent = count.toString();
  } else {
    // Add to status if not exists
    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.innerHTML = `Background simulations running... Exploring quantum realities. Cycle ${count}, <span id="runCount">0</span> runs completed.`;
    }
  }
}

function updateCollectiveAnomalies(anomalies: any) {
  // Update a collective anomalies display if exists, or log to console
  console.log('Collective anomalies:', anomalies);
}

function updateTopKTables(topK: any) {
  // Reuse existing updateAnomaliesTable logic
  updateAnomaliesTable(null, null, topK);
}

function updateGroupSummaries(runnerData: any[]) {
  // Update group summaries in UI if exists
  console.log('Group summaries:', runnerData);
}

function renderAutorunnerMap() {
  const canvas = document.getElementById('mapCanvas') as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid: x-axis multiplier 1-20, y-axis sizeX 5-15
  const gridWidth = canvas.width;
  const gridHeight = canvas.height;
  const xMin = 1, xMax = 20, yMin = 5, yMax = 15;
  const xScale = gridWidth / (xMax - xMin);
  const yScale = gridHeight / (yMax - yMin);

  // Draw grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  for (let x = xMin; x <= xMax; x++) {
    const px = (x - xMin) * xScale;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, gridHeight);
    ctx.stroke();
  }
  for (let y = yMin; y <= yMax; y++) {
    const py = gridHeight - (y - yMin) * yScale;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(gridWidth, py);
    ctx.stroke();
  }

  // Group colors
  const groupColors = {
    1: 'blue',
    2: 'red',
    3: 'green'
  };

  // Plot autorunners as Snake-like segments
  autorunners.forEach((autorunner: any) => {
    if (autorunner.trajectory && autorunner.trajectory.length > 0) {
      const color = groupColors[autorunner.group as keyof typeof groupColors] || 'white';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      // Get current position, considering animation
      let currentPos = autorunner.position;
      const anim = autorunnerAnimations.get(autorunner.id);
      if (anim) {
        const elapsed = Date.now() - anim.startTime;
        const progress = Math.min(elapsed / anim.duration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic
        currentPos = {
          x: anim.startPos.x + (anim.endPos.x - anim.startPos.x) * easedProgress,
          y: anim.startPos.y + (anim.endPos.y - anim.startPos.y) * easedProgress
        };
        if (progress >= 1) {
          autorunnerAnimations.delete(autorunner.id);
        }
      }

      // Draw segments like Snake: head larger, body segments smaller
      const maxSegments = 5; // Show last 5 positions as segments
      const segmentSize = 8; // Head size
      const segmentShrink = 1.5; // Each segment smaller

      // Add current position to trajectory for drawing
      const drawTrajectory = [currentPos, ...autorunner.trajectory.slice(-maxSegments + 1)];

      for (let i = 0; i < drawTrajectory.length; i++) {
        const point = drawTrajectory[i];
        const px = (point.x - xMin) * xScale;
        const py = gridHeight - (point.y - yMin) * yScale;
        const size = segmentSize / Math.pow(segmentShrink, i);

        ctx.beginPath();
        ctx.arc(px, py, size, 0, 2 * Math.PI);
        ctx.fill();

        // Connect segments with lines
        if (i > 0) {
          const prevPoint = drawTrajectory[i - 1];
          const prevPx = (prevPoint.x - xMin) * xScale;
          const prevPy = gridHeight - (prevPoint.y - yMin) * yScale;

          // Determine line style: solid for main path, dashed for deviations
          const dx = point.x - prevPoint.x;
          const dy = point.y - prevPoint.y;
          const isMainPath = dy > 0; // Increasing sizeX
          const isDeviation = dx < 0; // Decreasing multiplier

          if (isMainPath) {
            ctx.setLineDash([]);
          } else if (isDeviation) {
            ctx.setLineDash([5, 5]);
          } else {
            ctx.setLineDash([]);
          }

          ctx.lineWidth = size / 2;
          ctx.beginPath();
          ctx.moveTo(prevPx, prevPy);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]); // Reset
    }
  });

  // Add labels
  ctx.fillStyle = 'white';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Multiplier (1-20)', gridWidth / 2, gridHeight - 5);
  ctx.save();
  ctx.translate(15, gridHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('SizeX (5-15)', 0, 0);
  ctx.restore();

  // Continue animation if there are active animations
  if (autorunnerAnimations.size > 0) {
    animationFrameId = requestAnimationFrame(renderAutorunnerMap);
  } else {
    animationFrameId = null;
  }
}

// New: Render BotFleet on Sphere
function renderBotSphere() {
  const canvas = document.getElementById('sphereCanvas') as HTMLCanvasElement;
  if (!canvas || !botFleet) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 20;

  // Draw equator (circle of keys)
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.stroke();

  // Group colors for braided trajectories
  const groupColors = ['blue', 'red'];

  // Render bot trajectories as braided arcs
  const bots = botFleet.getBots();
  bots.forEach((bot: any) => {
    const state = bot.getGeometricState();
    const color = groupColors[bot.getGroup()] || 'white';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    // Draw braided trajectory
    ctx.beginPath();
    for (let i = 1; i < state.braidedTrajectory.length; i++) {
      const prev = state.braidedTrajectory[i - 1];
      const curr = state.braidedTrajectory[i];

      // Project to 2D: theta to x, phi to y (elevation)
      const prevX = centerX + Math.cos(prev.theta) * radius * Math.cos(prev.phi);
      const prevY = centerY + Math.sin(prev.theta) * radius * Math.cos(prev.phi) - Math.sin(prev.phi) * radius * 0.5; // Simple projection
      const currX = centerX + Math.cos(curr.theta) * radius * Math.cos(curr.phi);
      const currY = centerY + Math.sin(curr.theta) * radius * Math.cos(curr.phi) - Math.sin(curr.phi) * radius * 0.5;

      if (i === 1) ctx.moveTo(prevX, prevY);
      ctx.lineTo(currX, currY);
    }
    ctx.stroke();

    // Draw current position as dot
    const current = state.braidedTrajectory[state.braidedTrajectory.length - 1];
    if (current) {
      const x = centerX + Math.cos(current.theta) * radius * Math.cos(current.phi);
      const y = centerY + Math.sin(current.theta) * radius * Math.cos(current.phi) - Math.sin(current.phi) * radius * 0.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  });

  // Add labels
  ctx.fillStyle = 'white';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Bot Braided Trajectories on Sphere', centerX, canvas.height - 10);
}

function updateAnomaliesTable(anomalies: any, logEntry: any, topK?: any) {
  if (topK) {
    // Define categories: Structure, Random (Randomness), Robust (Reemergence), Space/Event Density (event_density)
    const categories = [
      { key: 'structure', name: 'Structure', type: 'top' },
      { key: 'randomness', name: 'Random', type: 'top' },
      { key: 'reemergence', name: 'Robust/Reemergence', type: 'top' },
      { key: 'event_density', name: 'Space/Event Density', type: 'top' },
      { key: 'structure', name: 'Structure', type: 'least' },
      { key: 'randomness', name: 'Random', type: 'least' },
      { key: 'reemergence', name: 'Robust/Reemergence', type: 'least' },
      { key: 'event_density', name: 'Space/Event Density', type: 'least' }
    ];

    // Find the top anomaly across all categories
    let topAnomaly: any = null;
    let maxScore = -Infinity;
    categories.filter(c => c.type === 'top').forEach(cat => {
      if (topK[cat.key] && topK[cat.key].length > 0) {
        const item = topK[cat.key][0];
        const score = item.anomalies[cat.key] || 0;
        if (score > maxScore) {
          maxScore = score;
          topAnomaly = {
            type: cat.name,
            score,
            run: item.run,
            multiplier: item.cfg.multiplier,
            sizeX: item.cfg.sizeX,
            sizeY: item.cfg.sizeY
          };
        }
      }
    });

    // Update banner with top anomaly
    if (topAnomaly) {
      const bannerText = document.getElementById('bannerText');
      if (bannerText) {
        bannerText.textContent = `Top Anomaly: ${topAnomaly.type} Score ${topAnomaly.score.toFixed(4)} Run ${topAnomaly.run} Mul ${topAnomaly.multiplier} Grid ${topAnomaly.sizeX}x${topAnomaly.sizeY} - Exploring Quantum Realities`;
      }
    }

    // Update tables for each category
    categories.forEach(cat => {
      const tableBody = document.querySelector(`#${cat.key}${cat.type === 'least' ? 'Least' : 'Top'}Table tbody`);
      if (tableBody) {
        tableBody.innerHTML = '';
        let items = topK[cat.key] || [];
        if (cat.type === 'least') {
          items = items.slice().reverse().slice(0, 10); // Least 10 (assuming sorted descending, so reverse)
        } else {
          items = items.slice(0, 10);
        }
        items.forEach((entry: any, index: number) => {
          const score = entry.anomalies[cat.key] || 0;
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${index + 1}</td>
            <td>${entry.run}</td>
            <td>${score.toFixed(4)}</td>
            <td>${entry.cfg.multiplier}</td>
            <td>${entry.cfg.sizeX}x${entry.cfg.sizeY}</td>
          `;
          tableBody.appendChild(row);
        });
      }
    });

    // Update anomaly summary table with top 10 per category
    const summaryBody = document.getElementById('anomalySummaryBody');
    if (summaryBody) {
      summaryBody.innerHTML = '';
      categories.filter(c => c.type === 'top').forEach(cat => {
        if (topK[cat.key]) {
          topK[cat.key].slice(0, 10).forEach((item: any, index: number) => {
            const score = item.anomalies[cat.key] || 0;
            const anomaly = {
              type: cat.name,
              score,
              description: getAnomalyDescription(cat.key, score),
              run: item.run,
              multiplier: item.cfg.multiplier,
              sizeX: item.cfg.sizeX,
              sizeY: item.cfg.sizeY,
              steps: item.cfg.steps,
              bandOk: item.bandOk,
              primeOk: item.primeOk,
              spectralOk: item.spectralOk,
              optimal: item.isOptimal,
              item
            };
            const row = document.createElement('tr');
            row.innerHTML = `
              <td>${cat.name}</td>
              <td>${index + 1}</td>
              <td>${score.toFixed(6)}</td>
              <td>${anomaly.description}</td>
              <td>${new Date().toLocaleString()}</td>
            `;
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => showAnomalyDetails(anomaly));
            summaryBody.appendChild(row);
          });
        }
      });
    }
  } else {
    // Fallback for old format if needed
    console.log('No topK data received');
  }
}

function getAnomalyDescription(type: string, score: number): string {
  switch (type) {
    case 'randomness': return `Entropy measure: ${score.toFixed(4)} - Higher indicates more chaotic event distribution.`;
    case 'structure': return `Order measure: ${score.toFixed(4)} - Higher indicates more structured trajectory.`;
    case 'reemergence': return `Reemergence steps: ${score} - Distance to inversion point.`;
    case 'event_density': return `Events per step: ${score.toFixed(6)} - High density suggests frequent interactions.`;
    case 'trajectory_variance': return `Position variance: ${score.toFixed(2)} - Measures spread in trajectory positions.`;
    case 'phase_periodicity': return `Phase regularity: ${score.toFixed(4)} - Inverse variance indicating periodicity.`;
    case 'inversion_frequency': return `Inversions per step: ${score.toFixed(6)} - Frequency of reality inversions.`;
    case 'velocity_anomaly': return `Average velocity: ${score.toFixed(2)} - Speed of particle movement.`;
    case 'chaos_index': return `Position uniqueness: ${score.toFixed(4)} - Inverse of unique positions ratio.`;
    default: return `Unknown anomaly: ${score}`;
  }
}

function showAnomalyDetails(anomaly: any) {
  const detailsDiv = document.getElementById('anomalyDetails');
  const detailsText = document.getElementById('anomalyDetailsText');
  if (detailsDiv && detailsText) {
    const deductions = generateMathematicalDeductions(anomaly);
    detailsText.textContent = deductions;
    detailsDiv.style.display = 'block';
  }
}

function generateMathematicalDeductions(anomaly: any): string {
  let deductions = `Anomaly Type: ${anomaly.type}\nScore: ${anomaly.score}\nRun: ${anomaly.run}\n\nMathematical Deductions:\n`;

  switch (anomaly.type) {
    case 'randomness':
      deductions += `- Entropy calculation: H = -∑ p_i log p_i, approximated as event count / steps.\n`;
      deductions += `- High randomness suggests uniform event distribution, low suggests clustering.\n`;
      deductions += `- Relation to chaos: Entropy correlates with Lyapunov exponents in dynamical systems.\n`;
      break;
    case 'structure':
      deductions += `- Structure = 1 - randomness, measuring order in trajectory.\n`;
      deductions += `- Low structure indicates high entropy, potentially chaotic behavior.\n`;
      deductions += `- In quantum systems, structure relates to wave function coherence.\n`;
      break;
    case 'reemergence':
      deductions += `- Reemergence = steps - inversion_step, measuring distance to symmetry breaking.\n`;
      deductions += `- Higher values suggest delayed phase transitions.\n`;
      deductions += `- Related to Poincaré recurrence in closed systems.\n`;
      break;
    case 'event_density':
      deductions += `- Density = events / steps, measuring interaction frequency.\n`;
      deductions += `- High density may indicate resonant conditions or critical points.\n`;
      deductions += `- In field theory, relates to particle production rates.\n`;
      break;
    case 'trajectory_variance':
      deductions += `- Variance = (1/n) ∑ (x_i - mean)^2 for positions.\n`;
      deductions += `- High variance suggests diffusive or ballistic motion.\n`;
      deductions += `- Connects to Brownian motion and random walk theory.\n`;
      break;
    case 'phase_periodicity':
      deductions += `- Periodicity = 1 / phase_variance, measuring phase coherence.\n`;
      deductions += `- High periodicity indicates quasi-periodic orbits.\n`;
      deductions += `- Related to KAM theory in Hamiltonian systems.\n`;
      break;
    case 'inversion_frequency':
      deductions += `- Frequency = inversions / steps, measuring symmetry breaking rate.\n`;
      deductions += `- High frequency suggests unstable manifolds.\n`;
      deductions += `- In topology, relates to Morse theory and critical points.\n`;
      break;
    case 'velocity_anomaly':
      deductions += `- Velocity = sqrt(vx^2 + vy^2), averaged over trajectory.\n`;
      deductions += `- High average velocity indicates energetic states.\n`;
      deductions += `- In mechanics, relates to kinetic energy and equipartition theorem.\n`;
      break;
    case 'chaos_index':
      deductions += `- Index = 1 / (unique_positions / steps), measuring trajectory diversity.\n`;
      deductions += `- High index suggests ergodic behavior.\n`;
      deductions += `- Connects to ergodic theory and mixing in dynamical systems.\n`;
      break;
  }

  deductions += `\nConfiguration Details:\n`;
  deductions += `- Multiplier: ${anomaly.multiplier} (affects modular arithmetic)\n`;
  deductions += `- Grid Size: ${anomaly.sizeX}x${anomaly.sizeY} (boundary conditions)\n`;
  deductions += `- Steps: ${anomaly.steps} (simulation length)\n`;
  deductions += `- Band OK: ${anomaly.bandOk} (quantized event differences)\n`;
  deductions += `- Prime OK: ${anomaly.primeOk} (prime-based patterns)\n`;
  deductions += `- Spectral OK: ${anomaly.spectralOk} (phase periodicity)\n`;
  deductions += `- Optimal: ${anomaly.optimal} (passes all checks)\n`;

  return deductions;
}

// Event listeners
window.addEventListener('load', () => {
  connectWebSocket();

  // Initialize botFleet automatically on page load with default data
  initializeBotFleet();

  // Render all bot fleet views immediately after initialization
  setTimeout(() => {
    renderAutorunnerMap();
    renderHyperbolicGrid();
    updateCoordinationGraph();
    populateLeaderboardsFromLocalData();
    updateBotLog();
  }, 100);

  // Set up intervals for live updates (every 100ms)
  setInterval(() => {
    renderAutorunnerMap();
    renderHyperbolicGrid();
    updateCoordinationGraph();
  }, 100);

  // Update leaderboards and bot log less frequently (every 2 seconds)
  setInterval(() => {
    populateLeaderboardsFromLocalData();
    updateBotLog();
  }, 2000);

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
  const configInputs = ['sizeX', 'sizeY', 'x0', 'y0', 'vx0', 'vy0', 'steps', 'primeGrowthRatio', 'inversionGEOM', 'inversionSPHERE', 'inversionOBSERVER', 'inversionCAUSAL'];
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

  // Config Modal
  const modal = document.getElementById('configModal');
  const openConfigBtn = document.getElementById('openConfigBtn');
  const closeBtn = document.querySelector('.close') as HTMLElement;

  if (openConfigBtn && modal) {
    openConfigBtn.addEventListener('click', () => {
      const configControls = document.getElementById('configControls');
      const mainControls = document.getElementById('controls');
      if (configControls && mainControls) {
        configControls.innerHTML = mainControls.innerHTML;
        // Add event listeners to the cloned inputs
        const clonedInputs = configControls.querySelectorAll('input');
        clonedInputs.forEach(input => {
          input.addEventListener('input', runSimulation);
          input.addEventListener('change', runSimulation);
        });
      }
      if (modal) modal.style.display = 'block';
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
    });
  }

  window.addEventListener('click', (event) => {
    if (event.target === modal && modal) {
      modal.style.display = 'none';
    }
  });

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
  console.log("Continuous bot fleet start disabled until user requests.");
  alert("Bot fleet start is disabled. Please tell me when to enable it.");
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

function updateBotLog() {
  if (!botFleet) return;
  const log = botFleet.getLogicChangeLog();
  const logList = document.getElementById('botLogList');
  if (logList) {
    logList.innerHTML = '';
    log.slice(-10).forEach(entry => {
      const li = document.createElement('li');
      li.textContent = `${new Date().toLocaleTimeString()}: ${entry}`;
      logList.appendChild(li);
    });
  }
}

function updateCoordinationGraph() {
  if (!botFleet) return;
  const canvas = document.getElementById('coordinationCanvas') as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const bots = botFleet.getBots();
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = 50;

  // Separate bots into two groups
  const group0Bots = bots.filter(bot => bot.getGroup() === 0);
  const group1Bots = bots.filter(bot => bot.getGroup() === 1);

  // Colors for groups: 3 colors per group
  const colorsGroup0 = ['#00d4ff', '#00ff88', '#0088ff']; // blue, green, light blue
  const colorsGroup1 = ['#ff6b6b', '#ffaa00', '#ff4444']; // red, orange, darker red

  // Function to draw group
  const drawGroup = (groupBots: any[], groupCenterX: number, groupColors: string[], label: string) => {
    groupBots.forEach((bot, index) => {
      const angle = (index / groupBots.length) * 2 * Math.PI;
      const x = groupCenterX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      // Color based on index in group
      ctx.fillStyle = groupColors[index % groupColors.length];
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, 2 * Math.PI);
      ctx.fill();

      // Label for tasks (placeholder: use index as task indicator)
      ctx.fillStyle = 'white';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`Task ${index + 1}`, x, y + 25);
    });

    // Draw cooperation lines within group (solid for cooperation)
    for (let i = 0; i < groupBots.length; i++) {
      for (let j = i + 1; j < groupBots.length; j++) {
        const bot1 = groupBots[i];
        const bot2 = groupBots[j];
        const angle1 = (i / groupBots.length) * 2 * Math.PI;
        const angle2 = (j / groupBots.length) * 2 * Math.PI;
        const x1 = groupCenterX + Math.cos(angle1) * radius;
        const y1 = centerY + Math.sin(angle1) * radius;
        const x2 = groupCenterX + Math.cos(angle2) * radius;
        const y2 = centerY + Math.sin(angle2) * radius;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; // white for cooperation
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
  };

  // Draw group 0 on the left
  drawGroup(group0Bots, centerX - radius - 20, colorsGroup0, 'Group 0');

  // Draw group 1 on the right
  drawGroup(group1Bots, centerX + radius + 20, colorsGroup1, 'Group 1');

  // Draw relative task lines between groups (dashed for inter-group tasks)
  group0Bots.forEach((bot0, i0) => {
    group1Bots.forEach((bot1, i1) => {
      const angle0 = (i0 / group0Bots.length) * 2 * Math.PI;
      const angle1 = (i1 / group1Bots.length) * 2 * Math.PI;
      const x0 = (centerX - radius - 20) + Math.cos(angle0) * radius;
      const y0 = centerY + Math.sin(angle0) * radius;
      const x1 = (centerX + radius + 20) + Math.cos(angle1) * radius;
      const y1 = centerY + Math.sin(angle1) * radius;

      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'; // yellow dashed for relative tasks
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  });

  // Add group labels
  ctx.fillStyle = 'white';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Group 0: Cooperation', centerX - radius - 20, centerY - radius - 10);
  ctx.fillText('Group 1: Cooperation', centerX + radius + 20, centerY - radius - 10);
  ctx.fillText('Inter-Group Tasks', centerX, centerY + radius + 30);
}

// New: Render 2D Hyperbolic Grid for Bot Geometries
function renderHyperbolicGrid() {
  const canvas = document.getElementById('hyperbolicCanvas') as HTMLCanvasElement;
  if (!canvas || !botFleet) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const maxRadius = Math.min(centerX, centerY) - 50;

  // Draw hyperbolic grid lines (concentric circles and radial lines)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  for (let r = 50; r < maxRadius; r += 50) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
    ctx.stroke();
  }
  for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 6) {
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(angle) * maxRadius, centerY + Math.sin(angle) * maxRadius);
    ctx.stroke();
  }

  const bots = botFleet.getBots();
  bots.forEach((bot: any, index: number) => {
    const state = bot.getGeometricState();
    // Map theta and phi to hyperbolic coordinates (Poincaré disk model)
    const r = (state.phi / (Math.PI / 2)) * maxRadius; // phi from 0 to pi/2
    const x = centerX + Math.cos(state.theta) * r;
    const y = centerY + Math.sin(state.theta) * r;

    // Color based on group
    ctx.fillStyle = bot.getGroup() === 0 ? '#00d4ff' : '#ff6b6b';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fill();

    // Label with bot ID
    ctx.fillStyle = 'white';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Bot ${bot.getId()}`, x, y - 15);

    // Display current goal and logic
    const goal = `Goal: Minimize anomalies, maximize coherence`;
    const logic = `Logic: COL phases - ${bot.colPhase || 'seeding'}`;
    ctx.fillStyle = 'yellow';
    ctx.font = '8px Arial';
    ctx.fillText(goal, x, y + 20);
    ctx.fillText(logic, x, y + 30);
  });

  // Add title
  ctx.fillStyle = 'white';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Hyperbolic Geometry of Bot Fleet', centerX, 20);
}
