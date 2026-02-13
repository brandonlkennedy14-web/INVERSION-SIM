# TODO Implementation Tracker

## Bot Fleet Optimizations (TODO_BOTFLEET_OPTIMIZATIONS.md + TODO_PDF_OPTIMIZATIONS.md)

### Phase 1: Add Coprime Coordination Layer
- [x] Add CoprimeMetrics interface
- [x] Add harmonicCoupling tracking between bots
- [x] Implement entropy measures for coordination
- [x] Track phase diversity across fleet

### Phase 2: Enhance Second-Order Regulation  
- [x] Add learning strategy adaptation
- [x] Implement meta-feedback mechanism
- [x] Add constraint evolution based on patterns

### Phase 3: Add Geometric Topology Mapping
- [x] Implement resonance axis (horizontal) - connectivity
- [x] Implement irreducibility axis (vertical) - uniqueness  
- [x] Add 3D temporal lifting for emergence
- [x] Track topology history

### Phase 4: Enhance Stuckness Phase
- [x] Add cycling detection (repeat patterns)
- [x] Add local minima detection
- [x] Implement more redirect strategies:
  - [x] Back up (revert to earlier config)
  - [x] Strip complexity (reduce parameters)
  - [x] Invert logic
  - [x] Perturb significantly
  - [x] Expose assumptions
- [x] Add phase diversity tracking

### Phase 5: Add Spectral Analysis
- [x] Add spectral data structure
- [x] Implement FFT-like analysis on behavior sequences
- [x] Detect periodicities and harmonics
- [x] Use spectral data for anomaly improvement

### Integration: Fleet-level coordination
- [x] Add fleetCoordination method to BotFleet
- [x] Update runIteration to use all phases

## Other TODO Items (TODO.md)

- [x] Add 2D hyperbolic grid for each bot's current geometry, display goal and logic
- [x] Set top anomaly as screensaver in HTML
- [x] Ensure simulations and data are stored persistently
- [ ] Clean up entire repo: remove unused code, fix errors, debug
- [ ] Auto commit and push changes

## Progress Notes
- TODO_BOTFLEET_OPTIMIZATIONS.md and TODO_PDF_OPTIMIZATIONS.md have overlapping content
- Main file to modify: INVERSION-SIM/src/botFleet.ts
- Phase 1-5 interfaces and Bot methods added
- Next: Add fleet coordination methods and integrate into runIteration
