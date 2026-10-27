# Sidestep

A complete, dependency-free HTML5 football dodge game. A close overhead camera shows a full-screen football pitch with parallel yard lines, shaded blue and red spheres, and a minimal arcade score display.

## Play locally

From this directory run `npm.cmd start` on Windows, or `npm start`, then visit **http://localhost:4173**. JavaScript modules need an HTTP server.

Choose Easy, Medium, or Hardcore and press **Let’s play**. **Swipe or drag anywhere in any direction** to move freely up, down, left, right, or diagonally across the visible pitch. All four arrow keys and **W / A / S / D** work too. **Space** or **Escape** pauses.

The pitch advances automatically while you move around it. Red defenders arrive from random edges — front, back, left, and right — with pulsing warning arrows. They pursue or intercept, then commit to a tackle. Make them miss and keep moving. One collision ends the run.

Pass cleanly between two defenders for exactly **+50** after clearing the gap. This works in every direction, including diagonal and side-on passes. Distance earns four points per yard. Audio, a short vibration on supported devices, a popup, particles, glow, and a score bounce accompany each bonus.

Sound and haptics have separate toggles. Audio unlocks on interaction; devices without vibration continue normally. Best scores are stored locally for each difficulty. Switching away from the browser automatically pauses the run.

## Movement and defender tuning

`dist/engine.mjs` exports `FIELD`, `VIEW`, `DIFFICULTIES`, and `tuning(score, difficulty)`. Movement uses two-dimensional relative swipe deltas, vector acceleration, velocity, a 140ms response, and release friction. Diagonal speed is normalized. Bounds adapt to the screen dimensions so the whole visible pitch is available.

Each difficulty changes enemy speed, count, spawn frequency, anticipation, gap width, and population cap. Counts interpolate by score and speeds increase smoothly. Each wave approaches from one randomly selected edge, leaving open space in the opposite direction. Spawns begin outside the viewport, have 0.9-second warnings, and never appear on the player. Defenders accelerate and turn smoothly; after committing to a tackle they carry on through their target instead of instantly reversing. Speed, active counts, and lifetime are capped.

Gap scoring tracks crossings through the segment joining each adjacent defender pair, checks that the player passes between their collision margins, and waits for full clearance on the other side. A pair can award only once. Passing beside a pair, passing a single enemy, or turning back before clearing gives no bonus. Swept collision detection catches fast movement between frames.

## Validate and host

Run `npm.cmd test` for the deterministic engine suite, and `npm.cmd run check` for syntax checks. With the local server running, `node tests/browser-smoke.mjs` tests desktop mouse dragging, vertical and horizontal touch steering, arrow controls, mobile layouts, pause, bonuses, collision, and retry using a locally installed Chrome. It writes screenshots and results to the ignored `artifacts/` directory. Set `CHROME_PATH` to use another Chrome installation.

No packages or build step are required. Deploy the contents of `dist/` to any static host with JavaScript module MIME support. The existing private Sites project is declared in `.openai/hosting.json`.
