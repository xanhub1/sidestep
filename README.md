# Sidestep

A dependency-free HTML5 football dodge game. A following overhead camera tracks a blue cylinder through a continuous football field. Cut around pursuing defenders, earn dodge bonuses, and cross the end zone into the next field.

## Play locally

Run `npm.cmd start` on Windows, or `npm start`, then visit **http://localhost:4173**. JavaScript modules require an HTTP server.

Choose Easy, Medium, or Hardcore. The player runs upfield automatically. **Swipe or drag anywhere** to steer in any direction: up accelerates the run and down slows or briefly reverses it. Release to run straight. Arrow keys and **W / A / S / D** also work; **Space** or **Escape** pauses.

Defenders arrive individually at staggered times from random directions. They intercept and keep pursuing after a miss. Their lower forward speed and gradually reduced effort let the runner pull away, leaving packs behind. They remain collidable until they leave the camera's surrounding area.

A nearby defender successfully evaded awards **+50 DODGE** once. A touchdown awards **+500** once per field. Running distance does not award points. Green fields have red opponents; brown fields have ivory opponents. Earlier pursuers retain their team across a touchdown. One tackle ends the run with a short dust-cloud animation and a score breakdown.

Sound and haptics have separate toggles. Audio unlocks on interaction; unsupported vibration is optional. Per-difficulty best scores are saved locally under a new scoring-version key. Previous best-score data is preserved. Switching away from the browser pauses the run.

## Movement and field model

`dist/engine.mjs` owns world coordinates, controls, following-camera state, pursuit, individual arrivals, swept collisions, and scoring. The field is 24 world units wide, each playable length is 200 units, and end zones are 14 units long. A runner advances at 10.4 / 11 / 11.5 units per second on Easy / Medium / Hardcore. Additional two-axis steering is limited to 11.5 units per second with normalized diagonals, a short response filter, and eased release.

The camera follows forward and lateral movement. Turf markings, actors, and dodge effects use the same world-to-screen transform with mild perspective. Rendering interpolates both the camera and actors between 120Hz physics updates. The pitch edges bound horizontal movement; vertical movement is independent of the viewport.

Difficulty changes defender speed, arrival interval, and population limit. Score increases pressure smoothly within bounds. Arrivals have a 0.65-second cue and a final proximity guard. Defender turning is smoothed, interceptors lead the player, and pursuers continue seeking the player in world space. Falling behind follows from relative speed; the engine never forces a pursuing defender to run downfield.

## Validate and host

Run `npm.cmd test` for the engine suite and `npm.cmd run check` for syntax checks. With the local server running, `node tests/browser-smoke.mjs` exercises the playable game through locally installed Chrome: desktop and mobile layouts, touch and mouse steering, automatic running, camera interpolation, scoring, stage transitions, tackle/results, saved best, pause/help, and natural attacks. Screenshots and results go to the ignored `artifacts/` directory. Set `CHROME_PATH` for another Chrome installation.

No packages or build step are required. Deploy `dist/` to a static host with JavaScript module MIME support. The existing private Sites project is declared in `.openai/hosting.json`.
