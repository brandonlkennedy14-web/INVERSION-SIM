# TODO List for Inversion Simulation Enhancements

## 1. Add Inversion Toggles to Browser UI
- [ ] Add checkboxes or buttons in index.html for inversion types (GEOM, SPHERE, OBSERVER, CAUSAL)
- [ ] Update src/browser.ts getConfigFromUI to dynamically build inversionSchedule based on toggles

## 2. Create Desktop Icon to Launch in Browser
- [ ] Create a batch file (launch.bat) to run `npm run browser` and open browser to localhost:3000
- [ ] Create a desktop shortcut to the batch file

## 3. Ensure Simulation Connected to Buttons and Configs
- [ ] Verify all buttons (modes, variants, zoom) trigger updates and re-runs simulation if needed
- [ ] Confirm configs are read from UI inputs

## 4. Different Visualizations
- [ ] Already implemented: 2D, 3D, Abstract, Toroidal, Hyperbolic, Phase Space
- [ ] Test switching between modes

## 5. Zoom In/Out Functionality
- [ ] Already implemented in TopologyRenderer and browser.ts
- [ ] Test zoom buttons

## 6. Color the Beam in 4 Different Colors
- [ ] Already implemented in TopologyRenderer renderTrajectory (red, blue, green, purple)
- [ ] Verify display
