// Constants from your 2026 Canonical Run
const GRID_X = 5;
const GRID_Y = 7;
const MULTIPLIER = 7;
const MODULUS = 1000003;

export interface State {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phi: number; // The "Read-only witness"
}

export class InversionSim {
  state: State;
  steps: number = 0;

  constructor(x = 0, y = 0, vx = 1, vy = 1) {
    this.state = { x, y, vx, vy, phi: 1 };
  }

  step() {
    // 1. Basic Motion
    this.state.x += this.state.vx;
    this.state.y += this.state.vy;
    this.steps++;

    // 2. Wall Reflections (Specular)
    if (this.state.x <= 0 || this.state.x >= GRID_X) {
      this.state.vx *= -1;
    }
    if (this.state.y <= 0 || this.state.y >= GRID_Y) {
      this.state.vy *= -1;
    }

    // 3. Corner Event Detection (The "Law")
    const isAtXLimit = this.state.x === 0 || this.state.x === GRID_X;
    const isAtYLimit = this.state.y === 0 || this.state.y === GRID_Y;

    if (isAtXLimit && isAtYLimit) {
      this.handleCorner(this.state.x, this.state.y);
    }
  }

  private handleCorner(x: number, y: number) {
    // Determine if Diagonal (0,0 or 5,7) or Off-Diagonal (0,7 or 5,0)
    const isDiagonal = (x === 0 && y === 0) || (x === GRID_X && y === GRID_Y);

    if (isDiagonal) {
      // Sim A: Linear Ladder
      this.state.phi = (this.state.phi + 1) % MODULUS;
      console.log(`[Step ${this.steps}] Diagonal Corner: Phase++ -> ${this.state.phi}`);
    } else {
      // Sim B: Multiplicative Ladder (Exponential)
      this.state.phi = (this.state.phi * MULTIPLIER) % MODULUS;
      console.log(`[Step ${this.steps}] Off-Diagonal: Phase*${MULTIPLIER} -> ${this.state.phi}`);
    }
  }
}