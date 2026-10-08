# Paintball Wars 3D

A first-person version of [Paintball Wars](https://github.com/johnjoo1/jesse_game) that runs in a web browser.
Bright cartoon paint, bots to splat, bushes to hide in and towers to climb.

Open `index.html` in a browser, or play it on GitHub Pages (see below). Nothing needs to be installed.

## Controls

- **Computer:** click the game to grab the mouse. WASD/arrows move · mouse looks · click shoots ·
  Shift sprints · Space jumps · R reloads · 1/2/3 or E (or right-click) place a defense · Tab or the mouse
  wheel picks which one E places · T opens Teams · Esc or P pauses
- **Phone/tablet:** put your left thumb down anywhere on the left side to get a thumbstick (push past the
  edge to run) · drag on the right side to look · hold **FIRE** to shoot (you can drag the FIRE button to aim
  while shooting) · **JUMP** · ⟳ reloads · tap a carried defense to place it · **II** pauses.
  Turn the device sideways for the best view.

The game switches controls based on what you use: touching the screen shows the touch buttons, and using a
mouse or keyboard hides them.

## The game

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

## Power-ups (Milestone 2)

Same rules as the top-down game. Half of all splats drop something where the player went down: a floating badge
with a colored light beam, also shown on the minimap. Walk over it to grab it. Bots grab them too, and unclaimed
drops blink and fade after 20 seconds.

**Boosts** work right away and last until you get splatted. Your boosts show as little badges next to your hearts.

| Power-up | Chance | What it does |
|---|---|---|
| ♥ Extra Heart | 13% | +1 max health (up to +3) and a full heal |
| ⚡ Rapid Fire | 13% | Shoot twice as fast |
| » Speed Boots | 11% | Run 30% faster |
| ▤ Big Hopper | 11% | 24 paintballs and faster reloads |
| ⁂ Triple Shot | 8% | Every shot fires 3 paintballs |
| ★ Golden Gun | 3% | Gold paint, and every hit counts double |

**Defenses** go into one of 3 carry slots, shown above your ammo (on a phone: at the bottom, tap one to place
it). Press **1**, **2** or **3** to place that one, or **E** / right-click to place the highlighted one. With all
3 slots full, a defense stays on the ground for someone else. You lose carried defenses when you're splatted.

A placed defense stays where you put it. Barricades, turrets and mines have no timer: they last until destroyed
or set off, and each player can have up to 3 of them standing (placing a 4th removes their oldest). The others
run on a timer and blink just before they go.

| Defense | Chance | What it does |
|---|---|---|
| ▮ Barricade | 11% | A 2 m wall across your line of fire, a step in front of you. Too tall to jump. It blocks everyone's paint, yours included, and breaks after 8 hits |
| ✚ Heal Station | 8% | Heals anyone standing in the green ring (friend, foe or bot) 1 health every 1.5 s. Lasts 20 s |
| ◠ Shield Dome | 6% | A bubble around where you stand. Enemy paint can't get in; you can shoot out. Lasts 10 s |
| ⊕ Sentry Turret | 5% | Shoots enemies within 20 m; its splats count for you. Breaks after 5 enemy hits |
| 🌳 Bush | 7% | A hiding spot right where you stand. Lasts 90 s |
| 💣 Paint Mine | 5% | A trap at your feet that only you can see. It arms after 1 s; the first enemy to step on it sets it off, and everyone nearby (except you) takes 2 hits, counted as your splats |

Bots play with items too. They walk over to drops they can see, use heal stations when they're hurt, place their
defenses in a fight, and shoot at enemy turrets.

## Playing with friends (Milestone 3)

1. One person taps **Host a game**. That opens the lobby with a 4-letter room code.
2. Friends open the same page, type the code and tap **Join**. They wait in the lobby and see it update live.
3. The host picks:
   - **Teams:** None (everyone for themselves), 2, 3 or 4
   - **Players:** the total, people plus bots (2–30). Bots fill whatever spots people don't.
   - **Who's on which team:** tap a team color next to each person, or **Shuffle teams**. New arrivals go to the
     smallest team.
4. The host taps **Start game**.

Up to 8 people can play at once (the rest of the 30 spots are bots). This is peer-to-peer: the host's device runs
the game and friends connect straight to it, using the free PeerJS service to find each other. Nobody needs an
account. **The host should keep the game on screen:** if the host's tab goes to the background, the browser pauses
it and the game stops for everyone. If the host leaves, the game ends for everyone. Some school or work networks
block these direct connections.

**Team games:** everyone wears their team's color and always spawns at their team's base, a big ring with a flag
(2 teams face off west and east, 3 sit in a triangle, 4 on all sides). Teammates can't splat each other, they
always show on your minimap, and the leaderboard shows each team's size and splats.

**Capturing bases:** get more of your team inside an enemy base than they have defending it and a capture ring
fills up in your color (about 8 seconds, faster with a bigger edge); a bar at the top shows how it's going, and
the defending team gets a warning. More defenders than attackers drains it; a tie holds it. When the ring fills,
that base is gone and its whole team switches to yours. The game ends when only one team is left; the host can
then take everyone back to the lobby for another round. Bots play the objective too: most attack the nearest
enemy base, some guard home, and they all rush back when their base is under attack.

**Moving people:** in a team game the host can open **👥 Teams** (or press **T**) and tap a team color to move
anyone, people or bots, to another team. They respawn at their new base.

**A friend who joins mid-game** goes to the team with the fewest people and takes a bot's spot.

**Bad connection?** If a friend's connection drops, the host keeps their player (team and score) for 90 seconds,
and their game reconnects by itself. Closing the game and joining the same room again within that time, with the
same name, also brings them back as themselves. After 90 seconds their spot goes to a bot.

## Teaming up during a game

In games without set teams (solo, or a hosted game with Teams: None), tap **🤝 Team up** at the top (or press
**T**) to see everyone, people and bots. Tap **Team up** next to someone; a person gets a pop-up to **Accept** (Y)
or say **No thanks** (N), and a bot decides after a moment.

Teammates can't splat each other (their paint passes straight through), aren't targeted by each other's turrets,
can see each other's mines, show as green dots on each other's minimap, and have a green dashed ring and 🤝 by
their name. Either player can **Leave team** from the same list. It takes 3 seconds (the ring turns orange) so
nobody can turn on a teammate without warning. A person can team up with several others; each pair agrees
separately.

**Bots and teams:** bots pair up with each other now and then, and sometimes ask you. A bot has at most one
teammate, usually says yes when asked, but says no if you splatted it in the last 30 seconds. Bot teams last a few
minutes, then the bot moves on (with the same 3-second warning). Bots stick near their teammate when there's
nobody to fight.

## Coming next

- **Milestone 4:** Brain Boost questions and "Update ready"

## Turning on GitHub Pages

1. Settings → General → Danger Zone → **Change visibility** → make the repo public
   (free GitHub Pages needs a public repo).
2. Settings → **Pages** → Source: **Deploy from a branch** → pick `main` and the `/ (root)` folder → **Save**.
3. After a minute or two the game is live at the address shown at the top of the Pages settings
   (it will be https://johnjoo1.github.io/jesse-game-3d/).

## For grown-ups: how it's built

- `index.html`: screens, HUD and touch controls. `game.js`: the whole game, including multiplayer.
  `net.js`: a stand-in for PeerJS used by the tests (see below).
- Three.js r128 and PeerJS 1.5.4 from cdnjs (PeerJS falls back to unpkg). Plain JavaScript with no build step.
- Multiplayer: the host runs the game. Each friend's game moves its own player and shows its own shots right
  away, and tells the host 30 times a second; the host decides every hit, splat, pickup and capture and sends
  everyone the game 15 times a second, plus every effect as an event.
- `?fakenet` swaps PeerJS for a look-alike built on BroadcastChannel, so two tabs of one browser can play each
  other with no internet; `?fakenet=slow` also keeps a room code reserved for a minute after its tab closes, like
  the real matchmaking service sometimes does.
- To keep it smooth on phones, it uses no real-time shadows, two lights, instanced meshes for the scenery,
  paint splats and paintballs, and recycles old paint splats after 700.
- `tests/smoke.mjs` (controls, movement, bots, phone layout), `tests/items.mjs` (every power-up and defense rule)
  and `tests/multi.mjs` (hosting, joining, lobby, teams, bases, team-ups, reconnecting, slow matchmaking) drive
  the game in headless Chromium with Playwright, at laptop and phone sizes (`node tests/<name>.mjs`). Add `?test` to the page address to play without grabbing
  the mouse.
