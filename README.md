# Sidestep

A dependency-free HTML5 football dodge game. A following overhead camera tracks a blue cylinder through a continuous football field. Cut around pursuing defenders, earn dodge bonuses, and cross the end zone into the next field.

## Play locally

Run `npm.cmd start` on Windows, or `npm start`, then visit **http://localhost:4173**. JavaScript modules require an HTTP server.

Choose Easy, Medium, or Hardcore. The player runs upfield automatically. **Swipe or drag anywhere** to steer in any direction: up and down move freely across the visible pitch. Release to keep the chosen screen position while the field scrolls. Arrow keys and **W / A / S / D** also work; **Space** or **Escape** pauses.

Defenders arrive in small groups from different random directions. Easy sends 2-3 per group, Medium sends 3-4, and Hardcore sends 4-5, subject to spacing and the population cap. Each group enters within a 0.1-second burst after its warning. They intercept and keep pursuing after a miss. Their lower forward speed and gradually reduced effort let the runner pull away, leaving packs behind. They remain collidable until they leave the camera's surrounding area.

A nearby defender successfully evaded awards **+50 DODGE** once. A touchdown awards **+500** once per field. Running distance does not award points. Easy begins with red opponents on grass. Medium begins at the faster white-defense stage on a brown field. Hardcore begins at the faster elite stage, with dark opponents on deeper green turf. Subsequent fields cycle through those teams. Earlier pursuers retain their team across a touchdown. One tackle ends the run with a short dust-cloud animation and a score breakdown.

Sound and haptics have separate toggles. Audio unlocks on interaction; unsupported vibration is optional. Per-difficulty best scores are saved locally under a new scoring-version key. Previous best-score data is preserved. Switching away from the browser pauses the run.

## Movement and field model

`dist/engine.mjs` owns world coordinates, controls, following-camera state, pursuit, group arrivals, swept collisions, and scoring. The field is 24 world units wide, each playable length is 200 units, and end zones are 14 units long. A runner advances at 10.4 / 12.8 / 15.2 units per second on Easy / Medium / Hardcore. Additional two-axis steering is limited to 11.5 units per second with normalized diagonals, a short response filter, and eased release.

Kickoff places the runner at 90% of the canvas height and the starting white line at 98.5%. The camera scrolls at the running pace and stays fixed horizontally. Steering is independent of camera follow on both axes: a cut changes the screen position without subsequent recentering. Long drags use the full visible pitch; their targets are bounded only at the screen edges. Turf markings, actors, and dodge effects use the same world-to-screen transform with mild perspective. Rendering interpolates both the camera and actors between 120Hz physics updates. Horizontal bounds keep the player between 4.5% and 95.5% of the canvas width and within the pitch edges. Vertical bounds keep the player visible between 7.5% and 94% of the canvas height. Pointer deltas use the inverse projection for consistent sensitivity across the screen; resizing preserves both axes of the chosen screen position.

Difficulty sets the starting stage, defender speed, arrival interval, and population limit immediately. Starting defender speeds are 6.2 / 9.4 / 12 units per second, and arrival intervals are 2.5 / 2.15 / 1.8 seconds between groups before variation. Score increases pressure smoothly within bounds. Arrivals have at least a 0.65-second cue and a final proximity guard. Defender turning is smoothed, interceptors lead the player, and pursuers continue seeking the player in world space. Falling behind follows from relative speed; the engine never forces a pursuing defender to run downfield.

## Validate and host

Run `npm.cmd test` for the engine suite and `npm.cmd run check` for syntax checks. With the local server running, `node tests/browser-smoke.mjs` exercises the playable game through locally installed Chrome: desktop and mobile layouts, touch and mouse steering, automatic running, camera interpolation, scoring, stage transitions, tackle/results, saved best, pause/help, and natural attacks. Screenshots and results go to the ignored `artifacts/` directory. Set `CHROME_PATH` for another Chrome installation.

No packages or build step are required. Deploy `dist/` to a static host with JavaScript module MIME support. The existing private Sites project is declared in `.openai/hosting.json`.
