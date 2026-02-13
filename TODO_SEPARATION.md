# TODO: Separate Two Simulations with Live Updates

## Phase 1: Create Core Infrastructure
- [x] Create directory structure (src/simulations/, src/bridge/)
- [x] Create SimulationBridge.ts - Pub/sub event bus for live updates
- [x] Create BlockchainSync.ts - Manages blockchain persistence layer
- [x] Create shared types for simulation data

## Phase 2: Create Simulation Classes
- [ ] Create ParticleSimulation.ts - Handles dimension navigation, trajectory generation
- [ ] Create CoordinationMap.ts - Handles nonlocal coordination visualization
- [ ] Create simulation interfaces and data transformers

## Phase 3: Refactor Existing Code
- [ ] Refactor botFleet.ts to use ParticleSimulation
- [ ] Refactor autorunner.ts to use CoordinationMap
- [ ] Update blockchain.ts with real-time sync capabilities

## Phase 4: Update Visualization
- [ ] Update browser.ts to handle separated simulations
- [ ] Create dual-view visualization component
- [ ] Add simulation switcher UI

## Phase 5: Integration & Testing
- [ ] Integrate all components
- [ ] Test live update flow
- [ ] Verify blockchain persistence
- [ ] Update documentation

## Architecture Overview:

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER VISUALIZATION                      │
│  ┌─────────────────────┐    ┌─────────────────────────────┐  │
│  │  Particle View      │    │  Coordination Map View      │  │
│  │  (3D Trajectories)  │    │  (Nonlocal Coordination)    │  │
│  └─────────────────────┘    └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SIMULATION BRIDGE (Event Bus)            │
│              Fast, real-time pub/sub for live updates       │
└─────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────┐              ┌─────────────────────────┐
│  ParticleSimulation │              │    CoordinationMap      │
│  - Dimension nav    │─────────────▶│  - Aggregate data       │
│  - Trajectories     │   Live Data  │  - Coordination viz     │
│  - Anomaly detect   │   Stream     │  - Nonlocal patterns    │
└─────────────────────┘              └─────────────────────────┘
          │                                    │
          │                                    │
          ▼                                    ▼
┌─────────────────────────────────────────────────────────────┐
│              BLOCKCHAIN SYNC (Persistence Layer)            │
│     Slow, verified storage for final anomaly commits        │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions:

1. **WebSocket + Event Bus for Live Updates**: Fast, immediate data flow
2. **Blockchain for Persistence**: Slow, verified, permanent storage
3. **Clear Separation**: Each simulation has single responsibility
4. **Data Transformation Layer**: Raw trajectories → coordination metrics
5. **Configurable Update Frequency**: User can control live update rate
