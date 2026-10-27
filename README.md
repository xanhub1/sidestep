# Sidestep

A complete, dependency-free HTML5 football dodge game. Canvas renders the perspective field and shaded spheres; plain JavaScript drives the menus, audio, input, and fixed-step physics.

## Play locally

From this directory, run `npm.cmd start` (Windows) or `npm start`, then visit **http://localhost:4173**. ES modules need an HTTP server; opening the HTML as a file is not supported.

Choose Easy, Medium, or Hardcore and press **Let’s play**. Swipe or drag anywhere to steer. Arrow keys and A / D also work. Space or Escape pauses. Avoid red spheres; a collision ends the run. A clean pass between adjacent defenders awards exactly **+50** after both are cleared. Distance earns four points per yard.

Sound and haptics can be toggled on the field. Audio unlocks on interaction. Devices without vibration support continue normally. Best scores are stored locally for each difficulty. Switching away from the browser automatically pauses a run.

## Tuning

`dist/engine.mjs` exports `DIFFICULTIES` and `tuning(score, difficulty)`. Each difficulty configures enemy speed, enemy count, spawn interval, interception strength, progression rate, gap width, and forward speed. Progression interpolates counts and smoothly increases speed and frequency. Formations reserve an open corridor, limit its movement between waves, and schedule their arrival to prevent faster waves overtaking earlier routes.

Player movement uses acceleration, velocity, a 140ms response, and release friction. Input adds relative swipe deltas to a target. Continuous swept collision checks avoid tunneling. Gap pairs track entry, clearance, and reward status so single defenders and repeated passes cannot earn duplicate bonuses.

## Validate

Run `npm.cmd test` for the deterministic engine suite and `npm.cmd run check` for JavaScript syntax checks. `tests/browser-smoke.mjs` runs browser and touch checks with a locally installed Chrome and the local server. No packages or build step are required. Deploy the contents of `dist/` to any static host with JavaScript module MIME support.

The supplied brief ended mid-sentence in its scoring section. The game completes that behavior with collision game over, final score, distance and gap statistics, immediate retry, and difficulty selection.
