# TODO: Memory Optimization and Autorunner 3D Visualization

## Detailed Steps to Complete
- [x] Update autorunner.ts: Limit anomaly stores to total top 1000 events across all types, delete unnecessary data aggressively.
- [x] Update browser.ts: Ensure live updates for leaderboards showing top 10 per category.
- [x] Assign 3D positions to autorunners (8 bots): Start equally apart in a 3D matrix (e.g., 2x2x2 cube).
- [x] Track trajectories: Store intended straight-line trajectory, actual trajectory, calculate deviations.
- [x] Visualize in 3D: Use Three.js renderer for autorunner map, show positions as points, trajectories as lines, deviations with dashed lines, arrows for intended directions.
- [x] Show overall motion as a unit: Display centroid or bounding box of all autorunners.
- [x] Integrate with WebSocket: Send 3D positions, trajectories, deviations in 'autorunnerUpdate' messages.
- [x] Test memory usage: Run simulations and check that only top 1000 are kept.
- [x] Verify live updates: Ensure leaderboards refresh with top 10 in real-time.
- [x] Add 2D hyperbolic grid for each bot's current geometry, display goal and logic.
- [x] Set top anomaly as screensaver in HTML.
- [x] Ensure simulations and data are stored persistently.
- [ ] Auto commit and push changes.

## Notes
- 3D Positions: For 8 autorunners, place at corners of a cube, e.g., (0,0,0), (1,0,0), (0,1,0), (1,1,0), (0,0,1), (1,0,1), (0,1,1), (1,1,1) scaled.
- Trajectories: Intended: straight line from start to current direction. Actual: actual path. Deviation: distance from intended.
- Arrows: Use Three.js arrows for intended trajectory direction.
- Overall Unit: Draw a wireframe cube or sphere around all points.
- Memory: In TopKAnomalyStore, maintain a global list of top 1000, sorted by score, delete others.
