# Paintball Wars 3D

A first-person version of [Paintball Wars](https://github.com/johnjoo1/jesse_game) that runs in a web browser.
Bright cartoon paint, bots to splat, bushes to hide in and towers to climb.

Open `index.html` in a browser, or play it on GitHub Pages (see below). Nothing needs to be installed.

## Controls

- **Computer:** click the game to grab the mouse. WASD/arrows move · mouse looks · click shoots ·
  Shift sprints · Space jumps · R reloads · Esc or P pauses
- **Phone/tablet:** put your left thumb down anywhere on the left side to get a thumbstick (push past the
  edge to run) · drag on the right side to look · hold **FIRE** to shoot (you can drag the FIRE button to aim
  while shooting) · **JUMP** · ⟳ reloads · **II** pauses. Turn the device sideways for the best view.

The game switches controls based on what you use: touching the screen shows the touch buttons, and using a
mouse or keyboard hides them.

## The game (Milestone 1)

- An outdoor arena with walls, crates, rocks, ramps, pine trees and bushes, plus 8 bots
- **Climbing:** walk up the orange ramps onto the towers, jump onto crates and rocks, and from a crate up to the
  lookout blocks on the east and west sides. Tall walls are too high to jump.
- **Hiding:** stand inside a bush or under a pine tree's low branches and bots can't see you unless they're
  right next to you (within 4 m). Your screen gets a green edge and says 🌿 Hidden. Bushes don't stop paint.
- **Paintball gun:** paintballs fly fast and drop a little, and splat paint on whatever they hit. You have a
  12-ball hopper; R reloads (1.4 s), and it reloads by itself when you run out.
- You can take 5 hits and bots can take 3. You come back 3 seconds after being splatted, with a 3-second spawn
  shield (shooting drops it early).
- Hitting someone shows a hit marker and a sound; splatting them gives a SPLAT! pop-up and a paint burst.
- HUD: hearts, ammo, crosshair, kill feed, a leaderboard and a minimap that turns with you. The minimap shows
  other players only while you can see them.
- Bots wander, run for cover behind tall walls when they're hurt, chase where they last saw you, and shoot in
  short bursts with wobbly aim. They're on the easy side: they take a moment to react, and they don't shoot
  someone who still has a spawn shield.

## Coming next

- **Milestone 2:** the top-down game's power-ups and placeable defenses
- **Milestone 3:** multiplayer with friends (PeerJS), teams and base capture
- **Milestone 4:** Brain Boost questions and "Update ready"

## Turning on GitHub Pages

1. Settings → General → Danger Zone → **Change visibility** → make the repo public
   (free GitHub Pages needs a public repo).
2. Settings → **Pages** → Source: **Deploy from a branch** → pick `main` and the `/ (root)` folder → **Save**.
3. After a minute or two the game is live at the address shown at the top of the Pages settings
   (it will be https://johnjoo1.github.io/jesse-game-3d/).

## For grown-ups: how it's built

- `index.html`: screens, HUD and touch controls. `game.js`: the whole game.
- Three.js r128 from cdnjs. Plain JavaScript with no build step.
- To keep it smooth on phones, it uses no real-time shadows, two lights, instanced meshes for the scenery,
  paint splats and paintballs, and recycles old paint splats after 700.
- `tests/smoke.mjs` drives the game in headless Chromium with Playwright, at laptop and phone sizes
  (`node tests/smoke.mjs`). Add `?test` to the page address to play without grabbing the mouse.
