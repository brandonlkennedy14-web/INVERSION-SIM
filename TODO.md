# TODO: Continue with Multi-Autorunner Enhancements

## Detailed Steps to Complete
- [x] Update TODO.md with detailed breakdown
- [x] Enhance autorunner.ts: Remove batched commit logic, add instant git add/commit/push after each autorunner run (already implemented)
- [ ] Update browser.ts: Add WebSocket onmessage handlers for 'autorunnerUpdate' (update individual autorunner position/direction/anomalies/trajectory) and 'cycleUpdate' (update collective anomalies, topK tables, cycle count)
- [ ] Update browser.ts: Implement 2D autorunner map rendering in #mapCanvas - draw grid with multiplier on x-axis (1-20), sizeX on y-axis (5-15), plot autorunner positions as points, animate trajectories as lines (solid for current logic path, dashed for deviations)
- [ ] Create generate_summary.js: Node.js script to read latest run data, anomaly stores, and generate/update summary.txt with logical definitions, key deductions, and summary based on simulation results
- [ ] Debug WebSocket/UI: Ensure WebSocket connects, messages are received, map updates live, tables refresh with topK data
- [ ] Test the enhanced system: Run autorunner, check instant commits, open browser, verify live map animations and updates

## Notes
- Trajectory lines: Each autorunner has a trajectory array of {x,y} positions over cycles; draw lines connecting them on the map.
- Current logic vs deviations: Solid lines for the main path (e.g., increasing sizeX), dashed for deviations (e.g., decreasing multiplier).
- Live updates: Map should redraw on each 'autorunnerUpdate', tables on 'cycleUpdate'.
- Instant autocommit: After each autorunner run, git add ., commit with message like "Instant commit autorunner X run Y", push.
- Summary script: Use fs to read JSON files, analyze data, write to summary.txt in structured format.
