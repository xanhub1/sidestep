# Sidestep

A complete, dependency-free HTML5 football dodge game. A close overhead camera shows a full-screen football pitch with parallel yard lines, upright blue and red cylinders, and a minimal arcade score display.

## Play locally

From this directory run `npm.cmd start` on Windows, or `npm start`, then visit **http://localhost:4173**. JavaScript modules need an HTTP server.

Choose Easy, Medium, or Hardcore and press **Let’s play**. **Swipe or drag anywhere in any direction** to move freely up, down, left, right, or diagonally across the visible pitch. All four arrow keys and **W / A / S / D** work too. **Space** or **Escape** pauses.

The pitch advances quickly while you move around it. Red cylinders rush directly toward you from mixed, random directions, with pulsing warning arrows. Every attacker has its own entry position, speed, timing, and pursuit or interception behavior. Make a quick cut as they commit to a tackle. One collision ends the run. All three modes are fast; Easy gives you fewer attackers, Medium adds pressure, and Hardcore has the biggest rushes.

Pass cleanly between two defenders for exactly **+50** after clearing the gap. This works in every direction, including diagonal and side-on passes. Distance earns four points per yard. Audio, a short vibration on supported devices, a popup, particles, glow, and a score bounce accompany each bonus.

Sound and haptics have separate toggles. Audio unlocks on interaction; devices without vibration continue normally. Best scores are stored locally for each difficulty. Switching away from the browser automatically pauses the run.

## Movement and defender tuning

`dist/engine.mjs` exports `FIELD`, `VIEW`, `DIFFICULTIES`, and `tuning(score, difficulty)`. Movement uses relative swipe deltas with a 14ms input filter to remove jitter. The previous 140ms acceleration and reversal ramp is removed. Movement begins on the next physics step, reverses within two steps, settles without overshooting the swipe target, and stops quickly on release. Maximum player speed is 18.5 world units per second, and diagonal speed is normalized. Bounds adapt to the screen dimensions so the whole visible pitch is available.

Each difficulty changes enemy speed, count, spawn frequency, anticipation, tackle commitment, and population cap. Starting enemy speeds are approximately 7.4 / 8.4 / 10.7 units per second for Easy / Medium / Hardcore before individual variation. Starting rush intervals are approximately 1.34 / 1.10 / 0.86 seconds. Counts and speeds increase smoothly with score. Every rush mixes multiple edges and random angles, rather than placing defenders in lines or formation slots. Entries begin outside the viewport, have 0.7-second warnings, and never appear on the player. Defenders turn smoothly and carry missed tackles through. Enemy speeds remain below the player's maximum; populations and lifetime are capped.

Gap scoring works between independent defenders, including attackers coming from different directions. It tracks crossings through the segment joining a nearby pair, checks collision margins and full clearance, and rejects a gap blocked by another defender. A pair can award only once. Passing beside a pair, passing a single enemy, or turning back before clearing gives no bonus. Swept collision detection catches fast movement between frames.

## Validate and host

Run `npm.cmd test` for the deterministic engine suite, and `npm.cmd run check` for syntax checks. With the local server running, `node tests/browser-smoke.mjs` tests desktop mouse dragging, responsive two-axis touch controls, arrow controls, cylinder rendering, fast natural rushes, mobile layouts, pause, bonuses, collision, and retry using a locally installed Chrome. It writes screenshots and results to the ignored `artifacts/` directory. Set `CHROME_PATH` to use another Chrome installation.

No packages or build step are required. Deploy the contents of `dist/` to any static host with JavaScript module MIME support. The existing private Sites project is declared in `.openai/hosting.json`.
