# PDF Alignment Plan

This document outlines how the PDF concepts are being applied to the INVERSION-SIM project.

## PDF Concepts and Implementation

### 1. Braided Sixth-chord Geometry
**Purpose**: Model cooperation without dominance using geometric trajectories

**Implementation**:
- [ ] Implement proper sphere geometry (theta/phi coordinates) for bots
- [ ] Add braided trajectories with two coupled strands (tonal anchoring + openness)
- [ ] Add resolution basins near equator for decision-making
- [ ] Map bot groups to different chord types (group 0 = iii⁶, group 1 = IV⁶)

### 2. Constraint-Only Learning (COL)
**Purpose**: Learning through constraints, not answers

**Status**: Already implemented in botFleet.ts!
- ✅ seeding (initial)
- ✅ exploration (perturb)
- ✅ stuckness (redirect sideways)
- ✅ emergence (self-generated)
- ✅ stabilization (stress-test)

**Improvements**:
- [ ] Add more constraint types from PDF
- [ ] Implement invariant prompts
- [ ] Add edge-case forcing

### 3. Primes as Singularities
**Purpose**: Proper dimension coding for simulations

**Implementation**:
- [ ] Implement 3D lifting for proper dimension representation
- [ ] Add metric where horizontal motion is linear (resonance-preserving)
- [ ] Add vertical motion penalty (prime barriers)
- [ ] Implement envelope functions for bounding parameters
- [ ] Add spectral analysis for periodicity detection

### 4. The Meaning of Life
**Purpose**: Memory persistence, compression, consciousness-like routing

**Implementation**:
- [ ] Implement compression (store patterns, not raw data)
- [ ] Add redundancy across bots
- [ ] Implement consciousness-like cache routing
- [ ] Add "heat death of reference" detection

## TODO Items from Original TODO.md

- [x] Memory optimization (top 1000 anomaly stores)
- [x] 3D visualization for autorunners
- [ ] Add 2D hyperbolic grid for each bot's current geometry
- [ ] Set top anomaly as screensaver in HTML
- [ ] Clean up entire repo: remove unused code, fix errors, debug
- [ ] Ensure simulations and data are stored persistently
- [ ] Auto commit and push changes

## Implementation Priority

1. **High Priority**: 
   - Clean up repo errors
   - Fix memory issues
   - Complete 3D visualization

2. **Medium Priority**:
   - Implement sphere geometry for bots
   - Add braided trajectories
   - Implement compression

3. **Low Priority**:
   - Auto commit/push
   - Screensaver
   - Hyperbolic grids
