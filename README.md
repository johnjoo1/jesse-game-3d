# Paintball Wars 3D

A first-person version of [Paintball Wars](https://github.com/johnjoo1/jesse_game) that runs in a web browser.
Bright cartoon paint, bots to splat, bushes to hide in and towers to climb.

Open `index.html` in a browser, or play it on GitHub Pages (see below). Nothing needs to be installed.

## Controls

- **Computer:** click the game to grab the mouse. WASD/arrows move · mouse looks · click shoots ·
  Shift sprints · Space jumps · R reloads · 1/2/3 or E (or right-click) place a defense · Tab or the mouse
  wheel picks which one E places · F builds a block · hold C to duck · T opens Teams · Esc or P pauses
- **Phone/tablet:** put your left thumb down anywhere on the left side to get a thumbstick (push past the
  edge to run) · drag on the right side to look · hold **FIRE** to shoot (you can drag the FIRE button to aim
  while shooting) · **JUMP** · ⟳ reloads · **🧱** builds a block · **DUCK** ducks (tap again to stand) · tap a
  carried defense to place it · **II** pauses.
  Turn the device sideways for the best view.

The game switches controls based on what you use: touching the screen shows the touch buttons, and using a
mouse or keyboard hides them.

## The game

- An outdoor arena with walls, crates, rocks, ramps, pine trees and bushes, plus 8 bots
- **Climbing:** walk up the orange ramps onto the towers, jump onto crates, scramble up the rounded rocks, and
  jump from a crate up to the lookout blocks on the east and west sides. Tall walls are too high to jump.
- **Paint stays put:** every splat sits on the face it hit (moved in from the edges, and smaller on small faces),
  so no paint hangs off into the air. `tests/paint.mjs` checks the rim of every splat after the bots paint the arena.
- **Hiding:** stand inside a bush or under a pine tree's low branches and bots can't see you unless they're
  right next to you (within 4 m). Your screen gets a green edge and says 🌿 Hidden. Bushes don't stop paint.
  Bots only know what they've seen: if one saw you go in, it comes looking around that spot, and if you paint
  one from hiding it knows roughly where it came from, but it can't shoot back until it spots you. Standing on
  top of a trunk or above the leaves isn't hidden.
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

## Blocks and ducking

- **Earn blocks:** every splat you make earns you a 1 m block 🧱 (your turret's and mine's splats count too). You
  keep your blocks when you're splatted; you can carry up to 30. Bots don't build.
- **Build like in Minecraft:** a green ghost block shows where yours will go (red if someone's standing there). Press
  **F** (or tap 🧱). Look at the top of a block to stack on it, or at its side to put the next one in front of it.
  Blocks always sit on whatever is under them, so nothing floats, and towers go up to 7 m. You can jump up onto a
  block, so stairs work too.
- **Breaking:** like barricades, any paint wears a block down, yours included: 4 hits break it, and the blocks above
  drop down. Each player can have 60 blocks standing; building more replaces your oldest.
- **Ducking:** hold **C** (or tap **DUCK**) to crouch to about 1 m tall, so a single block covers you. You move
  slowly while ducking and can't sprint; stand up to peek and shoot over. Bots duck when they hide behind cover.

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

## Brain Boost (Milestone 4)

On the start screen, pick **Brain Boost** (Off, Math, Spanish or Mix) and an **Age** (7, 8, 9 or 10). Both are
saved on each device, so each kid can have their own. With it on, getting splatted shows a question card at that
age's level, with 3 big answer buttons (or press 1, 2, 3). The questions are the same as in the top-down game.

- **No rush:** the respawn waits while the question is up (in a game with friends, the host holds your respawn).
- **Right answer:** a reward screen shows the prize you won and what it does; tap **Let's go!** (or press Enter)
  to jump back in with it.
- **Wrong answer:** no penalty. The card shows the right answer; tap **OK, back in!** to keep playing.
- **⭐ Challenge questions:** about 1 in 4 questions is one grade harder, on a purple card. Get it right to pick a
  **super prize**: Golden Gun, Sentry Turret, Triple Shot, Shield Dome or Paint Mine.
- **3 in a row:** pick your own prize, a boost or a defense.
- **Two misses in a row:** the next 3 questions are a grade easier.
- A 🔊 button reads Spanish aloud, and the right word is spoken after each answer.
- Your score shows as 🧠 right/total under the leaderboard, and on the win screen with your ⭐ challenges.

| Level | Math | Spanish |
|---|---|---|
| 7 | Adding within 20, taking away within 20, missing numbers (5 + ? = 9), counting pictures, biggest number | Picture → word (animals, food, things), colors, numbers 0–10, hola / gracias / por favor |
| 8 | Adding and taking away within 100, ×2 ×5 ×10, counting by 2s, 5s, 10s, halves, biggest 3-digit number | Numbers 11–20, days of the week, family, body parts, weather |
| 9 | Times tables, division facts, adding within 1,000, rounding to the nearest ten, ? × 4 = 28 | Counting by tens (veinte, treinta…), months, school things, action words, opposites |
| 10 | 2-digit × 1-digit, dividing 2- and 3-digit numbers, fractions of a number, adding fractions, place value | Everyday phrases (Tengo hambre), clothing, numbers 21–99 |
| 11 (challenges at age 10) | Decimals, fractions and percentages of a number, order of operations, 2-digit × 2-digit | Short sentences, question words (¿Dónde?), yo como / tú comes |

## Updates without losing your game

The page checks every 90 seconds whether a newer version is online. If there is one, an **✨ Update ready**
button appears at the top. Tapping it saves the game, reloads with the new version (skipping any copy the browser
kept), and puts everything back: positions, scores, boosts, carried and placed defenses, drops, bases, team-ups
and the paint on the ground.

- Playing solo: tap the button whenever you like.
- Hosting: tapping it updates everyone. Friends reload with you and rejoin the same room as the same player. The
  host comes back at a fresh address (the room code plus -2, -3, …) that friends' games already know, because the
  matchmaking service can keep the plain room code reserved for up to a minute after a reload. New friends can
  still join with the plain 4-letter code.
- Joined a friend's game: the button tells you the host can update everyone.

The start, pause and lobby screens show **Version N** (`GAME_VER` in `game.js`, the same number as `?v=` in
`index.html`), and the lobby shows each person's version, so you can tell which copy each device has. A friend who
can't join sees why, with their version and the reason in brackets.

Friends can join even if their copy of the game is a little newer or older than the host's (right after an update,
phones can get the new files a few minutes apart). Only a change to the messages between games (`NET_VER` in
`game.js`) keeps them apart: then joining fetches a fresh copy of the game (twice at most) or asks both to refresh.

## Turning on GitHub Pages

1. Settings → General → Danger Zone → **Change visibility** → make the repo public
   (free GitHub Pages needs a public repo).
2. Settings → **Pages** → Source: **Deploy from a branch** → pick `main` and the `/ (root)` folder → **Save**.
3. After a minute or two the game is live at the address shown at the top of the Pages settings
   (it will be https://johnjoo1.github.io/jesse-game-3d/).

## For grown-ups: how it's built

- `index.html`: screens, HUD and touch controls. `game.js`: the whole game, including multiplayer.
  `brain.js`: the Brain Boost questions. `net.js`: a stand-in for PeerJS used by the tests (see below).
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
  `tests/multi.mjs` (hosting, joining, lobby, teams, bases, team-ups, reconnecting, slow matchmaking),
  `tests/brain.mjs` (every Brain Boost rule, alone and with friends) and `tests/update.mjs` (updating solo, hosted
  with slow matchmaking, and from the lobby) drive the game in headless Chromium with Playwright, at laptop and
  phone sizes (`node tests/<name>.mjs`). The update test's server hands out a changed game.js on cue, like a new
  version going online. Add `?test` to the page address to play without grabbing
  the mouse.
