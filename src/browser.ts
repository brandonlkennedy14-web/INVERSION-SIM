// src/browser.ts
import { TopologyRenderer } from './visualization/TopologyRenderer.js';
import { MirrorInversion } from './variants/mirror_inversion.js';
import { SquareClampReflect } from './variants/square_clamp_reflect.js';
import { SquareInversionReflect } from './variants/square_inversion_reflect.js';
import { SquareStickyReflect } from './variants/square_sticky_reflect.js';
import { runVariant } from './core.js';
import type { RunConfig } from './types.js';
import * as THREE from 'three';

let currentRenderer: TopologyRenderer | ThreeDRenderer | AbstractRenderer | null = null;
let topologyRenderer: TopologyRenderer | null = null;
let currentResult: any = null;
let currentCfg: RunConfig;
let currentVariant = MirrorInversion;

class ThreeDRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private zoomLevel: number = 1;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(800, 600);
    container.appendChild(this.renderer.domElement);
    this.camera.position.z = 10;
  }

  render(result: any, cfg: RunConfig) {
    this.scene.clear();

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);

    // Render trajectory as 3D line
    const trajectoryGeometry = new THREE.BufferGeometry();
    const positions = [];
    for (const state of result.trajectory) {
      positions.push(state.x, state.y, state.phase * 2);
    }
    trajectoryGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const trajectoryMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const trajectory = new THREE.Line(trajectoryGeometry, trajectoryMaterial);
    this.scene.add(trajectory);

    // Render events as spheres
    for (const event of result.events) {
      const geometry = new THREE.SphereGeometry(0.1);
      const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(event.x, event.y, event.phaseAfter * 2);
      this.scene.add(sphere);
    }

    // Render inversions as cubes
    for (const state of result.trajectory) {
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

  render(result: any, cfg: RunConfig) {
    this.ctx.clearRect(0, 0, 800, 600);
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, 800, 600);

    // Abstract representation: phase space
    const phasePoints = result.trajectory.map((state: any) => ({
      x: (state.x / cfg.sizeX) * 800,
      y: (state.y / cfg.sizeY) * 600,
      phase: state.phase
    }));

    for (let i = 1; i < phasePoints.length; i++) {
      const p1 = phasePoints[i - 1];
      const p2 = phasePoints[i];
      this.ctx.strokeStyle = `hsl(${p1.phase * 360}, 100%, 50%)`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
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
    inversionSchedule.push({ step: Math.floor(steps * 0.20), kind: "GEOM" });
  }
  if ((document.getElementById('inversionSPHERE') as HTMLInputElement).checked) {
    inversionSchedule.push({ step: Math.floor(steps * 0.40), kind: "SPHERE" });
  }
  if ((document.getElementById('inversionOBSERVER') as HTMLInputElement).checked) {
    inversionSchedule.push({ step: Math.floor(steps * 0.60), kind: "OBSERVER" });
  }
  if ((document.getElementById('inversionCAUSAL') as HTMLInputElement).checked) {
    inversionSchedule.push({ step: Math.floor(steps * 0.80), kind: "CAUSAL" });
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

  if (mode === '2D') {
    topologyRenderer = new TopologyRenderer(visualization, 800, 600);
    topologyRenderer.renderGrid(currentResult.trajectory, currentCfg.sizeX, currentCfg.sizeY);
    topologyRenderer.renderTrajectory(currentResult.trajectory);
    topologyRenderer.renderEvents(currentResult.events);
    topologyRenderer.renderInversions(currentResult.trajectory);
    currentRenderer = topologyRenderer;
  } else if (mode === '3D') {
    currentRenderer = new ThreeDRenderer(visualization);
    (currentRenderer as ThreeDRenderer).render(currentResult, currentCfg);
  } else if (mode === 'Abstract') {
    currentRenderer = new AbstractRenderer(visualization);
    (currentRenderer as AbstractRenderer).render(currentResult, currentCfg);
  } else if (mode === 'Toroidal') {
    if (!topologyRenderer) {
      topologyRenderer = new TopologyRenderer(visualization, 800, 600);
    }
    topologyRenderer.toroidalUnwinding(currentResult.trajectory, currentCfg.sizeX, currentCfg.sizeY);
    currentRenderer = topologyRenderer;
  } else if (mode === 'Hyperbolic') {
    if (!topologyRenderer) {
      topologyRenderer = new TopologyRenderer(visualization, 800, 600);
    }
    topologyRenderer.hyperbolicProjection(currentResult.trajectory);
    currentRenderer = topologyRenderer;
  } else if (mode === 'PhaseSpace') {
    if (!topologyRenderer) {
      topologyRenderer = new TopologyRenderer(visualization, 800, 600);
    }
    topologyRenderer.phaseSpaceRepresentation(currentResult.trajectory);
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

  // Initial run
  runSimulation();
});
