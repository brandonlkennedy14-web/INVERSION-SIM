# TODO: Add WebSocket Live Updates to Autorunner and Browser

## Steps to Complete
- [x] Add 'ws' WebSocket library to package.json dependencies
- [x] Modify src/autorunner.ts to integrate WebSocket server on port 8080
  - Start WebSocket server at the beginning
  - After each run, broadcast run results (run count, anomalies, etc.) to connected clients
  - Add pause logic: Every 10 runs, pause for 5 seconds to "upload" data (broadcast accumulated data), then resume
- [x] Modify src/browser.ts to add WebSocket client
  - Connect to WebSocket server on page load
  - Listen for messages and update UI elements (run count, anomalies table) in real-time
- [x] Install dependencies with npm install
- [x] Test: Run autorunner in background (npm run autorunner) and browser (npm run browser) to verify live updates

## Notes
- WebSocket server broadcasts JSON messages with run data.
- Browser updates #runCount, #anomaliesTable, etc., on receiving messages.
- Autorunner pauses briefly to simulate uploading data before resuming simulations.

# TODO: Update Bot Coordination Visualization

## Steps to Complete
- [x] Separate bots into two groups (Group 0 and Group 1)
- [x] Assign 3 distinct colors per group (blue/green/light blue for Group 0, red/orange/dark red for Group 1)
- [x] Arrange bots around circles for each group
- [x] Draw solid white lines for intra-group cooperation
- [x] Draw dashed yellow lines for inter-group relative tasks
- [x] Add labels for groups and tasks

## Notes
- Visualization updates live during continuous bot running.
- Groups represent different cooperation strategies.

# TODO: Translate Current Objective into Words

## Steps to Complete
- [x] Describe the bots' infinite search through parameter space for optimal quantum inversion configurations
- [x] Explain direction towards low randomness, high structure, strong reemergence, quantized bands, prime envelopes, periodic spectra
- [x] Detail mathematical reasoning: anomaly thresholds (randomness < 0.5, structure > 0.5, reemergence < 100), PDF checks, spectral variance
- [x] Outline parameter adjustments: cycling multipliers 1-20, increasing grid sizes to 15x15, recalculating inversion schedules

## Notes
- Added as comment in src/autorunner.ts for documentation.
