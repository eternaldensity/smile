# Smile Game III — Web Remake

Modern playable port of the VB6 **Smile Game III** (`../smile3/`).
TypeScript + Canvas, no runtime dependencies. Follows the same architecture
as `smile2-web`; only the rules differ — this one has **gravity**.

## Quick start

```sh
npm install
npm run convert-assets   # BMP/ICO -> PNG, WAV -> OGG (uses ffmpeg-static, no system deps)
npm run dev              # play at http://localhost:5174 (or 5173 if free)
npm test                 # vitest: parser + engine + 108-level soak
npm run build            # typecheck + production build in dist/
```

## What's new vs Smile II

- **Gravity**: panels, TNT, dyno, smiles, glass, push-nitro, odd radars fall
  (`dFAll`); balloons rise (`dBUP`). Ladders hold smiles, brick-ladders hold
  everything but weights, ropes hold smiles (and can't be climbed up off).
- **Conveyors**: three speeds, steering tiles, cooldowns; nothing falls off one.
- **Producers**: spawn tiles or switch payloads on a random ~1/tick cadence.
- **Tolls**: pay gates (`$25/$50/$75/$100/$500`), sublevel gates (nested game
  sessions with 1 life; success merges score/energy/keys back), bonus gates.
- **Mince**: spreads when armed near nitro/armed mince/nitro balloons, eats
  anything pushed into it.
- **Balloons/weights**: two states of the same object (toggle via `Extra3`),
  nitro balloons detonate when blocked, satellite balloons feed radar.
- **Shields** (`intEXPsafe`): absorb explosions including point-blank nitro.

## Asset conversion (BMP→PNG, WAV→OGG)

- Source: `../smile3/pictures/` (150 BMP/ICO), `../smile3/sounds/` (17 WAV).
- Output: `public/assets/**/*.png`, `public/assets/sounds/*.ogg` (Vorbis q4),
  levels copied verbatim to `public/levels/` (6 canonical files).
- New sounds: `pop` (referenced only in a commented-out line — converted but
  unused), `shield+`/`shield-`.

## Controls

- P1: **Arrows** move (hold to keep moving) · **End** starves (lose a life) · **ScrollLock** follow/pan
- P2: **WASD** move (hold to keep moving) · **Esc** starves · **Space** follow/pan · **Z** also down
- **Click** a neighbouring tile to step · **right-click** to inspect
- **R** restart (restarts the sublevel when inside one)
- Toll gates open a Pay/Decline dialog (Enter/Esc); the sim pauses meanwhile.

## Project structure

Same shape as `smile2-web`: `constants.ts` (new tile/dir/explosion IDs),
`level-format.ts` (+10 subpath records, `smilegame3` magic), `engine.ts`
(gravity/conveyor/producer/toll/sub/mince/balloon/shield logic),
`renderer.ts`, `sprites.ts`, `audio.ts`, `main.ts` (toll modal + sub overlay).

## Fidelity notes

Ported 1:1 from `Game.frm`/`mdl1.bas`, including quirks: the `Cindex(0) =
Cindex(1)+1` counter bug, swapper panels trading places into walls, rope
breaking only when you *lack* energy, finish on *any* permanent with
`Extra1 == 6` under a smile, and `KillSmile(1)` recursion in 1P mode.

Intentional deviations (same policy as smile2-web):

1. `MsgBox` → non-blocking UI (help popups log to the side panel; tolls use
   a modal that pauses the sim, matching VB's modal block).
2. Sublevels (VB: a second `frmGame` window) are nested `Engine` sessions in
   a modal overlay; rewards merge exactly as `tmrRef` did.
3. Subpaths are absolute Windows paths in the originals — resolved by
   basename against the game's own `levels/` dir; missing files keep the gate
   shut with a message instead of crashing.
4. P2 movement modernized to WASD (original S=right/Z=down); Shift+S steps
   right for old muscle memory.
5. Recursion (`MoveObjectCheck`/`MakeThingFromSwitch`/`CheckMince`) and all
   sprite lookups are guarded; the original crashed on bad indices.
