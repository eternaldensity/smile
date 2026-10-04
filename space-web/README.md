# Space Game — Web Remake

Modern playable port of the VB6 **Space Game** (`../space/`).
TypeScript + Canvas, no runtime dependencies.

## Quick start

```sh
node scripts/extract-levels.mjs  # re-extract 16 levels from the .frm files
npm install
npm run dev              # play at http://localhost:5175 (or first free port)
npm test                 # vitest: extraction integrity + engine + soak
npm run build            # typecheck + production build in dist/
```

## What it is

A continuous-motion grid puzzler: tap an arrow and the ship slides until
blocked. Get it to the door on all 16 levels; enemy ships and metal reset
you (infinite retries, no lives/score in the original either).

Mechanics, all ported: brick walls, ship-eaten wood, enemy-eaten panels,
bounce reversers, mines (metal), ship/enemy-only locks, one-way roofs,
stalling magnets, teleport warps (fixed pairs, directional, type-dependent
and one-way bounce gates), arrow conveyors that also spawn enemies and
shuffle direction every 2 seconds, enemy random-walk with push chains.

## Level pipeline (there were no level files)

Levels lived as VB form designer blocks, so
`scripts/extract-levels.mjs` parses the 16 `levelN.frm` files into
`public/levels/levelN.json` (objects + warp rules), with strict checks:
ship is id 0, exactly one door, all coords on the 12×12 grid, every warp
rule resolves. Two findings baked in:

- Levels 7, 8, 11–14, 16 carry dead `warp()` code for indices that aren't
  warps (copy-paste); those rules are kept but can never fire, and unmapped
  warps are no-ops (VB would have crashed with error 91).
- `levelb.frm` is an unused template, not in `SpaceGame.vbp` — skipped.

## Assets: redrawn + synthesized (the originals are lost)

Only `stars.bmp` survived (used as the board backdrop, converted to PNG).
The sprites and all 9 sounds lived at a hardcoded
`c:\documents and settings\...\vb\data\` path, so sprites are redrawn
vector-style on canvas (`src/sprites.ts`) and sounds are WebAudio synth
cues (`src/audio.ts`: bang, thump, warp, wall, ecrash, skid, start,
finish, magnet + spawn beep), with a mute toggle.

## Controls

- **Arrows** steer (first press starts the sim) · **R** restarts · right-click
  a cell to inspect it.

## Fidelity notes

Ported 1:1 from `level1.frm`'s code template (identical in all 16 levels
except the warp map), including quirks: doors let everything through (VB's
`If A = ship Or enemy` is always true), magnets halt the ship ~1s after
entry, wood/panel destruction still blocks that step, and warps never
re-check collisions at the destination.

Intentional deviations:

1. `MsgBox`es become banner messages; the death `Pause()` busy-wait is a
   250 ms sim pause.
2. No password/random-level/hidden-form UI from `Main.frm` (the random
   picker could crash VB outright with `Level(0) = Nothing`); level select
   1–16 plus auto-advance covers it.
3. The sounds form's per-category mutes collapse to one mute button.
