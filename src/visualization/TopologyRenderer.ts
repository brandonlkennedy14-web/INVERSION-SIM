// TopologyRenderer.ts

// Multi-Perspective Topology Visualization
// This module includes functionalities for toroidal unwinding, hyperbolic projection, and phase space representation.

import type { State, Event } from '../types.js';

export class TopologyRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private cellSizeX: number = 20;
  private cellSizeY: number = 20;
  private zoomLevel: number = 1;
  private colorMode: string = 'normal';

  constructor(container: HTMLElement, width: number = 800, height: number = 600) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width = width;
    this.canvas.height = this.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    container.appendChild(this.canvas);

    // Ensure canvas fills the container without borders or margins
    this.canvas.style.border = 'none';
    this.canvas.style.margin = '0';
    this.canvas.style.padding = '0';
    this.canvas.style.display = 'block';

    // Basic setup: Black bg, white lines default
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 1;
  }

  // Render the grid based on final states or trajectory
  public renderGrid(states: State[], sizeX: number, sizeY: number) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.width, this.height);

    const lastState = states[states.length - 1];
    if (!lastState) return;

    // Calculate cell sizes to align with canvas borders
    this.cellSizeX = this.width / sizeX;
    this.cellSizeY = this.height / sizeY;

    // Draw grid cells colored by phase
    for (let x = 0; x < sizeX; x++) {
      for (let y = 0; y < sizeY; y++) {
        const phase = (lastState.phase + x + y) % 1; // Simple phase coloring, adjust as needed
        this.ctx.fillStyle = `hsl(${phase * 360}, 100%, 50%)`;
        this.ctx.fillRect(x * this.cellSizeX, y * this.cellSizeY, this.cellSizeX, this.cellSizeY);
      }
    }

    // Draw grid lines
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 1;
    for (let x = 0; x <= sizeX; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * this.cellSizeX, 0);
      this.ctx.lineTo(x * this.cellSizeX, this.height);
      this.ctx.stroke();
    }
    for (let y = 0; y <= sizeY; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * this.cellSizeY);
      this.ctx.lineTo(this.width, y * this.cellSizeY);
      this.ctx.stroke();
    }
  }

  // Render the trajectory as a path with multi-color segments and fading trail
  public renderTrajectory(trajectory: State[], maxIndex?: number, loopCount: number = 0) {
    if (trajectory.length < 2) return;

    const first = trajectory[0];
    if (!first) return;

    const segmentLength = Math.floor(trajectory.length / 4); // Divide into 4 segments
    let colors: string[] = ['red', 'blue', 'green', 'purple'];

    // Apply color illusion modes
    if (this.colorMode === 'checkerboard') {
      colors = ['black', 'white', 'black', 'white'];
    } else if (this.colorMode === 'contrast') {
      colors = ['white', 'black', 'white', 'black'];
    } else if (this.colorMode === 'monochrome') {
      colors = ['gray', 'darkgray', 'lightgray', 'gray'];
    } else if (this.colorMode === 'rainbow') {
      colors = ['hsl(0,100%,50%)', 'hsl(120,100%,50%)', 'hsl(240,100%,50%)', 'hsl(60,100%,50%)'];
    } else if (this.colorMode === 'benham') {
      // Benham's top illusion: alternating colors that create motion illusion
      colors = ['hsl(0,100%,50%)', 'hsl(180,100%,50%)', 'hsl(0,100%,50%)', 'hsl(180,100%,50%)'];
    } else if (this.colorMode === 'contours') {
      // Illusory contours: colors that suggest shapes not present
      colors = ['hsl(240,100%,50%)', 'hsl(60,100%,50%)', 'hsl(240,100%,50%)', 'hsl(60,100%,50%)'];
    } else if (this.colorMode === 'constancy') {
      // Color constancy: colors that appear constant despite changes
      colors = ['hsl(120,50%,50%)', 'hsl(240,50%,50%)', 'hsl(120,50%,50%)', 'hsl(240,50%,50%)'];
    }

    const effectiveMax = maxIndex ?? trajectory.length;

    // Fading trail: render previous segments with decreasing opacity
    const trailLength = 10; // Number of previous frames to show
    for (let trail = 0; trail < trailLength; trail++) {
      const trailMax = Math.max(0, effectiveMax - trail * 50);
      if (trailMax <= 0) continue;
      this.ctx.globalAlpha = (trailLength - trail) / trailLength; // Fade out

      for (let segment = 0; segment < 4; segment++) {
        const startIdx = segment * segmentLength;
        const endIdx = segment === 3 ? trajectory.length : (segment + 1) * segmentLength;

        // Change color over time for trail, shifting with loop count
        const hue = (segment * 90 + trail * 30 + loopCount * 45) % 360;
        this.ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();

        const startState = trajectory[Math.max(startIdx, 0)];
        if (startState && startIdx < trailMax) {
          this.ctx.moveTo(startState.x * this.cellSizeX * this.zoomLevel + this.cellSizeX * this.zoomLevel / 2, startState.y * this.cellSizeY * this.zoomLevel + this.cellSizeY * this.zoomLevel / 2);
        }

        for (let i = startIdx + 1; i < Math.min(endIdx, trailMax); i++) {
          const state = trajectory[i];
          if (state) {
            this.ctx.lineTo(state.x * this.cellSizeX * this.zoomLevel + this.cellSizeX * this.zoomLevel / 2, state.y * this.cellSizeY * this.zoomLevel + this.cellSizeY * this.zoomLevel / 2);
          }
        }
        this.ctx.stroke();
      }
    }
    this.ctx.globalAlpha = 1; // Reset alpha
  }

  public animateTrajectory(trajectory: State[], speed: number = 50, loop: boolean = true) {
    let maxIndex = 0;
    let loopCount = 0;
    const animate = () => {
      this.renderTrajectory(trajectory, maxIndex, loopCount);
      maxIndex += speed;
      if (maxIndex >= trajectory.length) {
        if (loop) {
          maxIndex = 0;
          loopCount++;
        } else {
          return;
        }
      }
      requestAnimationFrame(animate);
    };
    animate();
  }

  public animateToroidal(trajectory: State[], sizeX: number, sizeY: number, speed: number = 50) {
    let maxIndex = 0;
    const animate = () => {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.fillStyle = 'black';
      this.ctx.fillRect(0, 0, this.width, this.height);

      const scaleX = this.width / (sizeX * 3);
      const scaleY = this.height / (sizeY * 3);

      for (let i = 0; i < Math.min(maxIndex, trajectory.length); i++) {
        const state = trajectory[i];
        const x = (state.x + sizeX * Math.floor(state.step / (sizeX * sizeY))) * scaleX;
        const y = (state.y + sizeY * Math.floor(state.step / (sizeX * sizeY))) * scaleY;
        this.ctx.fillStyle = `hsl(${state.phase * 360}, 100%, 50%)`;
        this.ctx.fillRect(x, y, scaleX, scaleY);
      }

      maxIndex += speed;
      if (maxIndex < trajectory.length) {
        requestAnimationFrame(animate);
      }
    };
    animate();
  }

  public animateHyperbolic(trajectory: State[], speed: number = 50) {
    let maxIndex = 0;
    const animate = () => {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.fillStyle = 'black';
      this.ctx.fillRect(0, 0, this.width, this.height);

      const centerX = this.width / 2;
      const centerY = this.height / 2;

      for (let i = 0; i < Math.min(maxIndex, trajectory.length); i++) {
        const state = trajectory[i];
        const r = Math.sqrt(state.x * state.x + state.y * state.y) + 1;
        const theta = Math.atan2(state.y, state.x);
        const x = centerX + (Math.log(r) * Math.cos(theta)) * 50;
        const y = centerY + (Math.log(r) * Math.sin(theta)) * 50;

        this.ctx.fillStyle = `hsl(${state.phase * 360}, 100%, 50%)`;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 2, 0, 2 * Math.PI);
        this.ctx.fill();
      }

      maxIndex += speed;
      if (maxIndex >= trajectory.length) {
        maxIndex = 0;
      }
      requestAnimationFrame(animate);
    };
    animate();
  }

  public animatePhaseSpace(trajectory: State[], speed: number = 50) {
    let maxIndex = 0;
    const animate = () => {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.fillStyle = 'black';
      this.ctx.fillRect(0, 0, this.width, this.height);

      for (let i = 1; i < Math.min(maxIndex, trajectory.length); i++) {
        const prev = trajectory[i - 1];
        const curr = trajectory[i];

        if (prev && curr) {
          const x1 = (prev.x / 10) * this.width;
          const y1 = (prev.vx / 10) * this.height;
          const x2 = (curr.x / 10) * this.width;
          const y2 = (curr.vx / 10) * this.height;

          this.ctx.strokeStyle = `hsl(${curr.phase * 360}, 100%, 50%)`;
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(x1, y1);
          this.ctx.lineTo(x2, y2);
          this.ctx.stroke();
        }
      }

      maxIndex += speed;
      if (maxIndex >= trajectory.length) {
        maxIndex = 0;
      }
      requestAnimationFrame(animate);
    };
    animate();
  }

  // Render events as markers
  public renderEvents(events: Event[]) {
    this.ctx.fillStyle = 'yellow';
    for (const event of events) {
      this.ctx.beginPath();
      this.ctx.arc(event.x * this.cellSize + this.cellSize / 2, event.y * this.cellSize + this.cellSize / 2, 5, 0, 2 * Math.PI);
      this.ctx.fill();
    }
  }

  // Highlight inversion points
  public renderInversions(trajectory: State[]) {
    this.ctx.fillStyle = 'blue';
    for (const state of trajectory) {
      if (state.inverted) {
        this.ctx.beginPath();
        this.ctx.arc(state.x * this.cellSize + this.cellSize / 2, state.y * this.cellSize + this.cellSize / 2, 8, 0, 2 * Math.PI);
        this.ctx.fill();
      }
    }
  }

  // Toroidal unwinding: Unwrap the grid to show periodicity
  public toroidalUnwinding(trajectory: State[], sizeX: number, sizeY: number) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Scale for unwinding
    const scaleX = this.width / (sizeX * 3); // Show 3 periods
    const scaleY = this.height / (sizeY * 3);

    for (const state of trajectory) {
      const x = (state.x + sizeX * Math.floor(state.step / (sizeX * sizeY))) * scaleX;
      const y = (state.y + sizeY * Math.floor(state.step / (sizeX * sizeY))) * scaleY;
      this.ctx.fillStyle = `hsl(${state.phase * 360}, 100%, 50%)`;
      this.ctx.fillRect(x, y, scaleX, scaleY);
    }
  }

  // Hyperbolic projection: Map to hyperbolic plane
  public hyperbolicProjection(trajectory: State[]) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;

    for (const state of trajectory) {
      // Simple hyperbolic mapping
      const r = Math.sqrt(state.x * state.x + state.y * state.y) + 1;
      const theta = Math.atan2(state.y, state.x);
      const x = centerX + (Math.log(r) * Math.cos(theta)) * 50;
      const y = centerY + (Math.log(r) * Math.sin(theta)) * 50;

      this.ctx.fillStyle = `hsl(${state.phase * 360}, 100%, 50%)`;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 2, 0, 2 * Math.PI);
      this.ctx.fill();
    }
  }

  // Phase space representation
  public phaseSpaceRepresentation(trajectory: State[]) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Plot position vs velocity
    for (let i = 1; i < trajectory.length; i++) {
      const prev = trajectory[i - 1];
      const curr = trajectory[i];

      if (prev && curr) {
        const x1 = (prev.x / 10) * this.width; // Assume max 10
        const y1 = (prev.vx / 10) * this.height;
        const x2 = (curr.x / 10) * this.width;
        const y2 = (curr.vx / 10) * this.height;

        this.ctx.strokeStyle = `hsl(${curr.phase * 360}, 100%, 50%)`;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
      }
    }
  }

  public setColorMode(mode: string) {
    this.colorMode = mode;
  }

  public zoom(factor: number) {
    this.zoomLevel *= factor;
    // Re-render the current view if needed, but since we don't have current result here, just update zoom
  }
}

export default TopologyRenderer;
