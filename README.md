# Sidestep

A complete, dependency-free HTML5 football dodge game. A close overhead camera shows a full-screen football pitch with parallel yard lines, upright blue and red cylinders, and a minimal arcade score display.

## Play locally

From this directory run `npm.cmd start` on Windows, or `npm start`, then visit **http://localhost:4173**. JavaScript modules need an HTTP server.

Choose Easy, Medium, or Hardcore and press **Let’s play**. **Swipe or drag anywhere in any direction** to move freely up, down, left, right, or diagonally across the visible pitch. All four arrow keys and **W / A / S / D** work too. **Space** or **Escape** pauses.

The pitch advances while you move around it. Red cylinders rush toward you from mixed, random directions, with pulsing warning arrows. Every attacker has its own entry position, speed, timing, and pursuit or interception behavior. Dodge the tackle and pull away: beaten defenders slow down and fall behind. One collision ends the run. Easy gives you fewer attackers, Medium adds pressure, and Hardcore has the biggest rushes. Version 1.2.1 lowers running and defender speeds by roughly 15–20% and spaces rushes about 18% farther apart.

Pass cleanly between two defenders for exactly **+50** after clearing the gap. This works in every direction, including diagonal and side-on passes. Distance earns four points per yard. Audio, a short vibration on supported devices, a popup, particles, glow, and a score bounce accompany each bonus.

Sound and haptics have separate toggles. Audio unlocks on interaction; devices without vibration continue normally. Best scores are stored locally for each difficulty. Switching away from the browser automatically pauses the run.

## Movement and defender tuning

`dist/engine.mjs` exports `FIELD`, `VIEW`, `DIFFICULTIES`, and `tuning(score, difficulty)`. Movement uses relative swipe deltas with a short 26ms steering filter and a gentle release. Input begins affecting movement on the next physics step, reversals remain quick, and small swipes settle without overshooting. Maximum player speed is 15.5 world units per second, and diagonal speed is normalized. Rendering interpolates positions between 120Hz physics updates to keep motion smooth across different display refresh rates. Bounds adapt to the screen dimensions so the whole visible pitch is available.

Each difficulty changes enemy speed, count, spawn frequency, anticipation, tackle commitment, and population cap. Starting enemy speeds are approximately 6.2 / 7.1 / 9.0 units per second for Easy / Medium / Hardcore before individual variation. Starting rush intervals are approximately 1.59 / 1.30 / 1.01 seconds. Counts and speeds increase smoothly with score. Every rush mixes multiple edges and random angles. Entries begin outside the viewport, have 0.7-second warnings, and never appear on the player. Enemy speeds remain below the player's maximum; populations and lifetime are capped.

Defenders commit to a brief 160ms lunge and then return to pursuit. Once the player has escaped a close approach, the defender brakes smoothly, loses effort as the gap increases, and drifts behind with the scrolling field. Fresh attackers retain their approach speed. Trailing defenders remain collidable and eventually leave the field or fade out; they do not continue charging away at full speed.

Gap scoring works between independent defenders, including attackers coming from different directions. It tracks crossings through the segment joining a nearby pair, checks collision margins and full clearance, and rejects a gap blocked by another defender. A pair can award only once. Passing beside a pair, passing a single enemy, or turning back before clearing gives no bonus. Swept collision detection catches fast movement between frames.

## Validate and host

Run `npm.cmd test` for the deterministic engine suite, and `npm.cmd run check` for syntax checks. With the local server running, `node tests/browser-smoke.mjs` tests desktop mouse dragging, responsive two-axis touch controls, interpolated rendering, defender fatigue and falling behind, cylinder rendering, natural rushes, mobile layouts, pause, bonuses, collision, and retry using a locally installed Chrome. It writes screenshots and results to the ignored `artifacts/` directory. Set `CHROME_PATH` to use another Chrome installation.

No packages or build step are required. Deploy the contents of `dist/` to any static host with JavaScript module MIME support. The existing private Sites project is declared in `.openai/hosting.json`.
