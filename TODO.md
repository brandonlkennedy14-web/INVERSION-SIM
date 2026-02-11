# TODO: Fix Animation and View Updates in Inversion Simulation

## Steps to Complete

- [ ] Add animateToroidal method to TopologyRenderer.ts
- [ ] Add animateHyperbolic method to TopologyRenderer.ts
- [ ] Add animatePhaseSpace method to TopologyRenderer.ts
- [ ] Update switchToMode in browser.ts to use currentResult and currentCfg for all modes
- [ ] Add event listeners in browser.ts for config inputs to call runSimulation on change
- [ ] Add event listener for colorMode select to update colorMode and re-render current view

## Followup
- Run the app to test animation in all views on Run, view changes on tabs, and config updates.
