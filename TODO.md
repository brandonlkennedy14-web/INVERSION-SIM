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

## 7. Add Color Illusion Options to Browser UI
- [x] Add dropdown or buttons in index.html for color illusion modes (e.g., Normal, Checkerboard Illusion, Color Contrast, etc.)
- [x] Update TopologyRenderer.ts to support different color schemes for illusions
- [x] Update src/browser.ts to apply selected color mode to rendering

## 8. Build Fleet of 8 Bots with Constraint-Only Learning
- [x] Create src/botFleet.ts with Bot class implementing COL (propose configs, get constraint feedback, iterate)
- [x] Split 8 bots into 2 groups using braided logic (alternating assignment)
- [x] Bots autonomously set simulation parameters and run experiments
- [x] Integrate bot fleet into browser.ts with a button to run bot simulations
- [x] Ensure bots learn via constraints without answers, allowing natural problem solving
