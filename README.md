# Anime Legends: Rift Arena — KAIRO, THE BLADE MASTER

A 3D anime action arena built with Three.js. You play **Kairo — The Crimson Tempest**, an original high-speed swordsman who fights with the katana **Kurokaze — The Black Gale**. The game has a three-hit sword combo, two special abilities, a six-stage ultimate, a dash with invulnerability and perfect dodges, three waves of enemies and a boss.

Everything is procedural: the character, sword, enemies, arena, effects, UI art and audio are all generated in code. There are no downloaded models, textures or sound files, and the game works offline.

## Run it

ES modules have to be served over HTTP, so opening `index.html` as a file won't work.

```bash
npm start            # zero-dependency Node server → http://localhost:8080
# or: node server.js 3000
# or any static server, e.g. python3 -m http.server 8080
```

You need a desktop browser with WebGL2 (Chrome, Edge, Firefox or Safari). Pick **Rift Assault** (three waves and a boss) or **Training Grounds** (respawning dummies and an ultimate that charges itself). Click the arena to capture the mouse.

## Controls

| Input | Action |
|---|---|
| **W A S D** | Move relative to the camera. While locked on: strafe around the target and back-pedal |
| **Mouse** | Rotate the camera (pointer lock; right-drag also works). Wheel zooms |
| **Left mouse** (or **J**) | Blade combo: Quick Draw › Crosswind › Gale Breaker. Press during a swing to chain |
| **Q** | Crescent Slash |
| **E** | Cyclone Cut |
| **R** | Crimson Tempest (ultimate; needs full energy) |
| **G** | Awaken the next Gear when the gear gauge is ready. Press it at Gear 4 to release |
| **Shift** | Gale Step dash with i-frames. Dash just as an attack lands for a **PERFECT DODGE** |
| **Space** | Jump |
| **F** / **Tab** | Lock on to the nearest enemy / cycle targets |
| **Arrow keys** | Rotate the camera from the keyboard |
| **T** | Training only: toggle whether the dummies attack |
| **M** | Mute |
| **Esc** | Pause (Resume, Restart, Settings, Controls, Quit) |

Settings (saved locally): master volume, mute, music volume, soundtrack on/off, mouse sensitivity, screen-shake strength and bloom on/off.

### Soundtrack

The game has a futuristic dark-synthwave soundtrack, composed procedurally and played live through Web Audio, so there are no music files. Browsers only allow sound after you interact, so it starts on your first click, tap or key press. The **♪ chip** at the top right of the title screen turns it off and on. The music follows the game:

| When | Music |
|---|---|
| Title screen | Ambient pads, slow arpeggio, sub bass (96 BPM) |
| Training | Lighter groove (116 BPM) |
| Rift Assault waves | Four-on-the-floor kick, clap, rolling 16th bass, 16th arpeggio (124 BPM) |
| Boss | Darker progression with a lead melody and tom fills (132 BPM). It speeds up to 140 BPM and the lead jumps an octave when Gorvath enrages |
| Victory / defeat | A bright swelling victory theme, or a slow, filtered lament |

Awakened Gears push the music harder, and the aura hums louder and deeper with each one. Gale Drive adds driving hi-hats. Crimson Overdrive adds a lead line on top (outside the boss fight, which has its own lead). Tempest Unbound harmonises that lead and adds a heavier, syncopated groove. Changes land on the next beat. Pausing muffles the music, the ultimate dips it for the cinematic, and the audio clock pauses while the tab is hidden. On iPhone and iPad the game asks iOS to play through the ringer/silent switch, like other games and media players. After an interruption such as a phone call, the next tap resumes the music.

### Touchscreen

Touch controls switch on by themselves on phones and tablets, or the first time you touch the screen. They switch back if you press a key on a physical keyboard. Landscape works best, but portrait is supported too, with a wider camera.

| Touch | Action |
|---|---|
| **Left thumb** | Floating joystick. Push further to run |
| **Drag the right side** | Rotate the camera. You can move and look at the same time |
| **SLASH** (big button) | Attack. Hold it to keep the combo going |
| **DASH / Q / E / JUMP / ULT / GEAR / LOCK** | Same as Shift / Q / E / Space / R / G / F. Buttons show cooldown sweeps |
| **❚❚** | Pause. The pause menu also toggles dummy attacks in Training |

Touch devices start with bloom off, a 1.5× pixel-ratio cap and smaller shadow maps for performance. You can turn bloom back on in Settings.

## Kairo — stats and abilities

| Stat | Value |
|---|---|
| Health | 1000 |
| Run speed | 9.2 m/s (7.4 m/s strafing while locked on) |
| Jump | 12.6 m/s launch, about 2.1 m high, with extra fall gravity so it doesn't feel floaty |
| Ultimate energy | 100. Earned per hit (+3 to +6), per perfect dodge (+15) and from damage taken |

Every attack has a wind-up, an active hit window and a recovery. A hit lands at most once per target per strike.

| Move | Key | Timing (wind-up / active / total) | Damage | Notes |
|---|---|---|---|---|
| Quick Draw | LMB ×1 | 0.075 / 0.075–0.16 / 0.42 s | 45 | Fast horizontal cut, narrow blue-white trail, small lunge |
| Crosswind | LMB ×2 | 0.095 / 0.095–0.19 / 0.50 s | 60 | Diagonal cut in the opposite direction, longer trail |
| Gale Breaker | LMB ×3 | 0.175 / 0.175–0.30 / 0.72 s | 110 | Wide finisher: hit-stop, launch, crimson and blue burst |
| Crescent Slash | Q | 0.13 / 0.13–0.34 / 0.66 s | 140 | Steps forward about 2.4 m. A crescent wave travels out to 6.8 m and hits each enemy when it reaches them. Multi-target. **4 s cooldown** |
| Cyclone Cut | E | 3 × 360° strikes, then a burst at 0.73 s / 1.02 s total | 3 × 48 + 70 | Spin with a little steering, ground shockwave, crimson flash. **8 s cooldown** |
| Gale Step (dash) | Shift | 0.24 s dash with 0.22 s i-frames | — | Perfect-dodge window: first 0.16 s. **0.85 s cooldown** |
| **Crimson Tempest** | R | 3.45 s sequence | 8 × 42 + 360 + 120 AoE | See below. Needs 100 energy and can't re-trigger while active |

Damage varies by ±6%. Inputs are buffered for 0.32 s. Combo follow-ups start at each swing's cancel point, and a dash can cancel a swing's recovery.

### Crimson Tempest stages

| Stage | Time | What happens |
|---|---|---|
| 1 · Focus | 0–0.75 s | Low stance. The arena dims, a letterbox and crimson vignette appear, and crimson particles orbit the blade |
| 2 · Flash Step | 0.75–0.98 s | Kairo moves (interpolated, not teleported, max 16 m) to just in front of the target, leaving blue and crimson afterimages and speed lines |
| 3 · Thousand Cuts | 0.98–2.18 s | Eight slashes on alternating swing planes. Each has its own hit window, impact flash and slash arc around the target |
| 4 · Final Sever | 2.18–2.58 s | Overhead vertical cut that releases a huge crescent energy wave (9 m range) |
| 5 · Impact | 2.58 s | Ground shockwave (6.5 m AoE), camera shake, hit-stop, a shower of particles and debris |
| 6 · Recovery | 2.75–3.45 s | A flick of the blade, the lighting comes back, and Kairo returns to his combat stance |

Kairo is invulnerable during the sequence. It targets the locked-on enemy, otherwise the best enemy in front. If the target dies, the remaining cuts simply miss. A watchdog ends the sequence after 5 s no matter what, and `abort()` cleans up on restart or game over.

### Gears

Kurokaze has sealed Gears. Kairo can awaken them mid-fight for a temporary power-up, then drops back to Gear 1 when the gauge runs dry. **The higher the Gear, the stronger he gets and the bigger his aura burns.**

The **gear gauge** sits under the ultimate bar. It has three segments (300 points) and fills by +4 per hit, +30 per perfect dodge and +12 per kill. In Training it also fills by itself. When the next Gear is ready, the label pulses and the G slot (touch: **GEAR**) lights up. The label shows the active Gear and its damage multiplier, and awakening shows a stat line such as `POWER ×1.5 · SPEED ×1.35 · 25% GUARD · SUPER ARMOR`.

| Gear | Needs | Drain | Power | Aura |
|---|---|---|---|---|
| 1 · Base | — | — | Normal stats | None |
| 2 · **Gale Drive** | 1 bar | 9/s | ×1.25 move speed, ×1.22 attack speed, ×1.15 damage, half dash cooldown, ×1.15 ultimate energy | Blue flame aura about 2.5 m tall, blue ground sigil, glowing blue eyes, blue-white markings, wind spirals, afterimages while sprinting |
| 3 · **Crimson Overdrive** | 2 bars | 15/s | ×1.35 move speed, ×1.35 attack speed, ×1.5 damage (the ultimate too), 25% less damage taken, **super armor** (hits don't interrupt you, 35% knockback), ×1.5 ultimate energy. Every combo swing releases a crimson **echo wave** that reaches about 7.8 m | Bigger, wilder crimson aura (about 3 m), cracked glowing sigil, red eyes, darkened hair, crimson blade, embers and crackling lightning |
| 4 · **Tempest Unbound** | full gauge | 20/s | ×1.45 move speed, ×1.5 attack speed, **×2 damage**, 45% less damage taken, super armor, dash cooldown ×0.35, ×2 ultimate energy. A wider violet echo wave reaches about 10 m, and the **aura burns** anything within 2.6 m (12 damage every 0.45 s, no flinch) | Towering violet aura with blue and crimson flames (about 3.6 m), silver-white hair, a shattered lightning sigil, bolts arcing into the floor and onto every target he hits, and chunks of the arena floating up around him |

- **Awakening** takes 0.8 s, and Kairo is invulnerable for all of it. He crouches while the aura gathers, then bursts at 0.38 s with a pillar of light. Each Gear's burst is bigger: 30 / 45 / 70 damage within 4.5 / 5.5 / 7 m, with more shake, hit-stop and lightning. Gear 4 brings a lightning strike from the sky.
- Gears go up one at a time. With a full gauge you can chain **G, G, G**: after each burst the gauge doesn't drain for 1 s, and a full gauge still counts as full for 1.5 s after the drain starts. Hits while awakened refill the gauge, so aggressive play keeps a Gear going longer.
- The gauge pauses during the awakening and the Crimson Tempest cinematic. When it empties, Kairo returns to Gear 1. Pressing G at Gear 4 releases early, and the floating rocks crash back down.
- Gears end on defeat or victory. Restarting resets the gauge.

## Enemies

- **Rift Ghoul**: melee. Telegraphed claw swipe and leaping pounce. Staggers on every hit.
- **Shade Caster**: floating, keeps its distance, fires dodgeable rift bolts.
- **Gorvath, the Rift Warden** (boss, 3200 HP): uses poise, so it only staggers when its guard breaks. Attacks: Rift Cleave, Ground Slam (circle telegraph) and Rift Charge (lane telegraph). Below 50% HP it enrages, attacking faster and summoning two ghouls.

Every enemy attack shows a red ground telegraph that fills up until it lands. An attack-token system limits how many melee enemies swing at once. Waves: 3 ghouls → 3 ghouls + 2 casters → boss + 2 ghouls. You heal 15% between waves.

## Project structure

```
index.html, css/style.css      UI shell, HUD/menu styling
server.js                      zero-dependency static server (npm start)
vendor/three/                  Three.js r170 (MIT) + bloom post-processing passes
src/main.js                    boot + window.__RIFT__ debug/test API
src/game.js                    renderer, single game loop, states, hit-stop/slow-mo, events
src/config.js                  all tunables (stats, damage, cooldowns)
src/core/                      input, procedural audio + music sequencer, cooldowns, events, math/easing
src/combat/combat.js           shared Combatant interface, sector/radius queries, HitTracker
src/characters/rig.js          analytic two-bone IK + springs
src/characters/meshMerge.js    per-joint static mesh merging (fewer draw calls)
src/characters/kairo/
  kairoModel.js                procedural Kairo + Kurokaze (faceted curved blade, crimson tsuba, wrapped tsuka)
  pose.js                      pose channels, swing-plane sword description, keyframes
  kairoAnimator.js             locomotion synthesis, IK, sword orientation, coat/ponytail springs
  kairoMoves.js                combo / Crescent / Cyclone / reactions (timings, hits, FX cues)
  kairoUltimate.js             Crimson Tempest stage machine
  kairo.js                     controller: states, movement, buffering, hits, dash, perfect dodge, Gears
  gearVisuals.js               per-Gear flame aura, ground sigil, aura light, lightning, floating rocks, recolours, burst
src/enemies/                   enemy base, ghoul, caster, boss, projectiles, wave director
src/fx/                        pooled particles, debris, sword trail, slash arcs, rings, telegraphs, flashes, afterimages
src/world/                     arena, camera rig, cel-shading/outline materials, canvas textures
src/ui/                        HUD, menus, touch controls, screen effects, original SVG icons/portrait
tests/e2e.mjs                  automated browser tests (npm test)
dev/poses.html, dev/viewer.html  pose/model inspection pages for development
```

### How it works

- **Combat interface:** anything that can be hit implements `isDefeated()`, `isInvulnerable()`, `receiveDamage(hit)` and `applyKnockback(dir, force, lift)`. Hits go through `CombatSystem.applyHit()`, which checks defeat, invulnerability and the per-strike `HitTracker`. Queries test range, angle and a vertical band, and never reach behind the attacker unless the move is 360°.
- **Frame-rate independence:** a hit window counts if it overlapped the current step (`prevT <= t1 && t >= t0`). The simulation is sub-stepped at 60 Hz or finer. The tests produce the same hits at 20, 60 and 144 fps.
- **Animation:** there are no animation assets. Each pose is a set of channels: torso rotations, IK targets for the feet and off hand, and a *swing plane* for the sword (plane tilt, angle along the arc, reach, edge roll). Interpolating along the plane sweeps the blade through a real arc with the cutting edge leading, and the same plane drives the slash-arc VFX and the hit sector. Running feet are phase-locked to distance travelled to reduce sliding.
- **Sword attachment:** Kurokaze is parented to the right-hand joint, and IK places the hand and orients the blade every frame. For victory, it's re-parented into the saya at the left hip.
- **Effects:** every effect comes from a fixed-capacity pool (1800 sparks, 500 dust, 140 debris, 26 arcs, 18 rings, 16 telegraphs, 30 flashes, 12 afterimage rigs). Pools clear on restart and nothing is allocated per frame. Shaders are compiled at startup so the first ultimate doesn't stall.
- **Hit-stop / slow-mo:** both scale simulation time, while the camera and UI keep running in real time. Cooldowns use game time.

## Testing

```bash
npm test        # needs Playwright + Chromium: npm i -D playwright && npx playwright install chromium
```

`tests/e2e.mjs` starts the server, opens the real game in headless Chromium and steps it deterministically through `window.__RIFT__`. Input goes through the same `Input` class the keyboard and mouse use. The last run passed **18/18** checks (`ONLY=<n> npm test` runs a single one):

1. Kairo appears (multi-part model, about 1.88 m tall, all joints present)
2. Sword parented to the hand at a constant distance; during a cut the tip sweeps in front and the edge leads the swing
3. Movement, camera-relative direction, deceleration, jump and landing, lock-on strafing and facing
4. Three-hit combo with buffering, one hit per swing, correct damage at 20, 60 and 144 fps
5. Crescent Slash reaches 5.6 m, never hits behind, 4 s cooldown blocks a recast
6. Cyclone Cut hits four surrounding enemies exactly 4 times each (3 strikes + burst)
7. Ultimate runs Focus › Flash › Cuts › Sever › Impact › Recovery › done in about 3.5 s, about 830 damage over 10 controlled hits, no re-trigger, lighting restored
8. Dash i-frames last exactly 0.22 s, dash spam is blocked, a perfect dodge gives +15 energy and no damage
9. Cooldowns tick in game time and energy builds from hits
10. An enemy is defeated, gets its kill event and is removed
11. Restarting mid-ultimate leaves no effects, cinematic state or stuck flags; pause freezes time
12. A full boss fight (phase 2 included) ends in VICTORY with the sword sheathed; the defeat flow works; input is ignored after the game ends
13. FX pools stay bounded, the scene-graph object count is unchanged after heavy use, and a simulation step takes about 1 ms
14. Gears 1 › 4: +4 gauge per hit, G is refused without gauge, the awakening is invulnerable and its burst hurts nearby enemies. Gale Drive runs and swings faster for more damage. Crimson Overdrive shrugs off a hit without flinching and its echo lands 5.5 m away. Tempest Unbound's burst is over twice as strong, its echo lands 8.5 m away, its aura burns a nearby enemy without staggering it, and rocks float up. Aura height, aura light and ground sigil all grow from Gear 2 to 3 to 4. G at Gear 4 releases, the drain drops back to Gear 1, and restart resets everything
15. Touchscreen, driven with real touch events in a phone-sized context: the joystick moves, dragging turns the camera, holding SLASH chains Quick Draw › Crosswind › Gale Breaker, the Q button casts, the pause button pauses, and nothing scrolls sideways
16. The soundtrack stays silent until a real click, then measurably plays and changes through title › training › boss › victory, and muffles on pause
17. Mobile audio unlock under emulated iOS rules (audio may start only on touch-end, click or key): the first tap anywhere starts the music, the chip never claims music is on while audio is blocked, and a tap after an interruption brings it back
18. No runtime or console errors

Screenshots from each test go to `tests/output/`.

## Known limitations

- The character is built from layered low-poly primitives with cel shading and outlines, not a sculpted, rigged model. Animation is procedural (IK and keyed poses) rather than motion-captured.
- Kurokaze is held one-handed. There's no IK for a two-handed grip.
- Feet are phase-locked when running, but dashes and attack lunges still slide a little.
- Real-GPU frame rate hasn't been measured: the test environment renders with a software GPU (SwiftShader). Draw calls are about 490 in the boss wave and about 640 at the busiest point of the ultimate. If performance is a problem, turn off **Bloom** in Settings.
- Audio and music are synthesized live (WebAudio). They're distinct per action and per game stage, but they aren't studio-produced tracks.
- Touch controls have only been tested in an emulated phone (Chromium mobile emulation with real touch events), not on a physical device. There's no gamepad support.

## Credits

Original design, code and procedural assets for this project. Three.js © three.js authors (MIT), vendored in `vendor/three/`.
