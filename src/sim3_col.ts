import { InversionSim, State } from './core';

// Simulation 3 Config: Prime Singularities as Barriers
const PRIME_BARRIERS = [2, 3, 5, 7, 11, 13, 17, 19]; 
const MODULUS = 1000003;

export class Sim3Runner extends InversionSim {
  // We lift the 2D grid into Spherical Coordinates for Sim 3
  // x -> Theta (Longitude), y -> Phi (Latitude)
  
  runCOLStep() {
    // 1. Move according to the Core Billiard Law
    this.step(); 

    // 2. Apply the "Meaning of Life" Constraint (Section 3 of your PDF)
    // Horizontal motion is resonance-preserving; Vertical motion is penalized at Primes.
    if (this.isAtPrimeBarrier()) {
      this.applySidewaysRedirect();
    }
    
    // 3. Check for "Heat Death" (Stagnation)
    if (this.detectHeatDeath()) {
      this.perturb(); // Self-generated emergence
    }
  }

  private isAtPrimeBarrier(): boolean {
    // Check if the current Phase (phi) or Position matches a Prime Singularity
    const currentInt = Math.floor(this.state.phi % 20); 
    return PRIME_BARRIERS.includes(currentInt);
  }

  private applySidewaysRedirect() {
    // The "Invariant Prompt" logic: Force horizontal movement when vertical is blocked
    // Swap vectors to pivot 90 degrees
    const temp = this.state.vx;
    this.state.vx = -this.state.vy;
    this.state.vy = temp;
    
    console.log(`[Step ${this.steps}] Prime Barrier Hit! Redirecting Sideways.`);
  }

  private detectHeatDeath(): boolean {
    // If the phase hasn't changed in 100 steps, we are in a "Silent Regime"
    return this.steps % 100 === 0 && this.state.phi === this.lastLoggedPhase;
  }

  private perturb() {
    // Seed a small "consciousness-like" nudge to break the loop
    this.state.vx += 0.01;
    this.state.phi = (this.state.phi + 1) % MODULUS;
  }
}