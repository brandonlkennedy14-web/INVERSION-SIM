# TODO List for Inversion Sim Enhancements

## 1. Live Bot Logic Translation
- Modify BotFleet.getLogicSummary() to return more detailed, dynamic logic descriptions.
- Update browser.ts to periodically fetch and display the logic summary live on the page.
- Ensure updates happen every few seconds when bots are running.

## 2. Prime Growth Slider
- Change the "Reduced Prime Growth" checkbox to a slider input for exponential ratio (e.g., 0.1 to 10).
- Update getConfigFromUI() to use the slider value for multiplier calculation.
- Assume exponential growth: multiplier = baseMultiplier * Math.pow(sliderValue, exponent).

## 3. Toroid Animation Implementation
- Fix and enhance TopologyRenderer.animateToroidal() to properly animate toroidal unwinding.
- Ensure it shows periodicity and updates smoothly.

## 4. New Color Illusion System
- Implement new color modes based on optical illusions (e.g., Benham's top, illusory contours, color constancy).
- Add new options to the colorMode select: 'benham', 'contours', 'constancy'.
- Update renderTrajectory and other rendering methods to apply these illusions.

## 5. Live Bot Action Log
- Extend BotFleet to maintain a live log of actions (e.g., config changes, simulations run, anomalies detected).
- Add visual representation: perhaps a scrolling log in the UI, or graphical elements showing coordination.
- Update browser.ts to display this log live.

## 6. Visual Coordination Representation
- Add graphical elements to show how bots coordinate (e.g., network graph, activity indicators).
- Integrate with the visualization canvas or add a new section.

## Implementation Steps
1. Update HTML for new UI elements (slider, new color modes, log display).
2. Modify BotFleet.ts for enhanced logging and logic summary.
3. Update TopologyRenderer.ts for toroid animation and new color illusions.
4. Update browser.ts for live updates and new config handling.
5. Test all changes and ensure live updates work.
