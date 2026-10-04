# Smile Game II — Web Remake

Modern playable port of the VB6 **Smile Game II** (`../smile2/`).
TypeScript + Canvas, no runtime dependencies. All game logic is a faithful
port of `Game.frm` (~3000 lines); see **Fidelity notes** for intentional fixes.

## Quick start

```sh
npm install
npm run convert-assets   # BMP/ICO -> PNG, WAV -> OGG (uses ffmpeg-static, no system deps)
npm run dev              # play at http://localhost:5173
npm test                 # vitest: parser + engine + 24-level soak
npm run build            # typecheck + production build in dist/
```

## Asset conversion (BMP→PNG, WAV→OGG)

- Source: `../smile2/pictures/` (125 BMP/ICO), `../smile2/sounds/` (14 WAV).
- Script: `scripts/convert-assets.mjs` — static ffmpeg, reproducible, no installs.
- Output: `public/assets/**/*.png` (656 KB total), `public/assets/sounds/*.ogg`
  (Vorbis q4), `public/assets/manifest.json`, levels copied verbatim to
  `public/levels/`.
- One collision handled: `pictures/wood.BMP` → `assets/wood.png`,
  `pictures/wood.ico` → `assets/wood_2.png` (only the `.BMP` variant is used
  by the game; both are kept).
- Sprites have mixed native sizes (mostly 32×32, some 40×30/43×42); the
  renderer normalizes everything to the 32 px grid, matching the VB tile step.

## Controls

- P1: **WASD** move (hold to keep moving) · **End** starves (lose a life) · **ScrollLock** follow/pan
- P2: **Arrows** move (hold to keep moving) · **Esc** starves · **Space** follow/pan
- (The VB original had movement swapped: arrows P1, A/W/S/Z P2 with S=right;
- no legacy aliases are kept.)
- **Click** a neighbouring tile to step into it · **right-click** a tile to inspect it
- **R** restart level

## Project structure

```
src/
  constants.ts    tile/dir/explosion IDs (must match mdl1.bas), tuning
  types.ts        ThingData/Popup/Switch, sound sink
  level-format.ts VB `Write #` level parser (all 24 shipped levels + extras)
  engine.ts       pure game logic, zero DOM (port of Game.frm)
  renderer.ts     canvas 13×13 viewport, VB draw order
  sprites.ts      PNG registry + loader
  audio.ts        OGG sound bank
  main.ts         wiring: fetch levels, fixed-timestep loop, input, HUD
tests/
  level-format.test.ts  parser incl. all 24 levels
  engine.test.ts        movement, pickups, doors, death, finish
  soak.test.ts          400 random-move ticks × 24 levels, no crashes
```

Sensible practices: `strict` + `noUncheckedIndexedAccess`, pure engine
injectable via events (sound/popup/level callbacks), fixed 25 ms timestep like
the VB `tmrLoop`, `vitest` coverage of load/move/tick paths.

## Fidelity notes

Ported 1:1 from `Game.frm`/`mdl1.bas`: 3 layers (permanent/collectable/moveable),
23 tile types, ice/warp/oneway/twoway sliding, TNT/Dyno/Nitro fuse chains,
radar line-of-sight, magnet pull/repel, glass rolling, water carry, switches
(incl. 50 = blow-all-nitro, 51 = checkpoint), popups, keys/doors (incl. door 6 =
finish), energy/lives/score, 1P + 2P split view.

Intentional deviations:

1. **Money bug fixed.** `Startup.frm` sets denominations
   `intMoney = [1,2,3,4,5,10,20,30,40,50]`, but `Initialize()` ran
   `intMoney(s) = 0` for player index `s`, zeroing denominations 0–1 after the
   first level. The remake uses a frozen table — money always pays.
2. **MsgBox → non-blocking UI.** VB blocked on popups/level-complete/failed
   dialogs; the remake routes them through callbacks (banner + popup log,
   auto-advance on complete).
3. **Recursion guards.** `MoveObjectCheck`/`MakeThingFromSwitch` recurse in VB;
   guarded at 64/16 depth so hostile levels can't overflow the stack.
4. **Movement** is standard WASD for P1 and arrows for P2 (above); the
   original had these swapped.
5. **Water/warp animation** uses `floor(WIndex/5)`; VB's float array index
   rounded, visually equivalent.

## Levels

`public/levels/` holds the 24 canonical files (`Level-1`, `Level0`–`Level22`).
The original repo also contains ~100 extra/test levels (root `*.txt`, `tests/`,
`dgood/`, `J/`, …) — all parse with the same loader; promoting a curated subset
is a one-line change to `LEVELS` in `src/main.ts`.
