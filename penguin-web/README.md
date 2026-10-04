# Penguin Game — Web Remake

Modern playable port of the VB6 **Penguin Game** (`../Penguin/`).
TypeScript + Canvas, no runtime dependencies.

## Quick start

```sh
node scripts/extract-levels.mjs  # re-extract 21 levels from the .frm files
node scripts/convert-assets.mjs  # BMP/ICO -> PNG, WAV -> OGG (ffmpeg-static)
npm install
npm run dev              # play at the first free port (try 5173+)
npm test                 # vitest: extraction integrity + engine + soak
npm run build            # typecheck + production build in dist/
```

## What it is

A multi-penguin grid puzzler: steer Zidgel (WASD), Midgel (IJKL) and Fidgel
(arrows) one step at a time. Collect every bolt to reveal the ship, then
bring every penguin home. Seals wander, spawn from arrows and kill on touch
— but drop (or push) a ball onto a trapped seal to squash it. Gravity pulls
anything unsupported; ladders hold penguins; flippers grant 20 safe water
moves; penguins break wood, seals break panels.

## Level pipeline (there were no level files)

Levels lived as VB form designer blocks, so `scripts/extract-levels.mjs`
parses the 21 `levelN.frm` files into `public/levels/levelN.json`
(objects, warp rules, behavior flags, seal timer), with strict checks:
three named penguins on slots 0–2, exactly one ship, visible bolts, all
coords on the 12×12 grid, every warp rule resolving. Findings baked in:

- Several levels carry dead `warp()` code for indices that aren't warps
  (copy-paste); those rules are dropped, and unmapped warps are no-ops
  (VB would have crashed with error 91).
- Off-grid designer junk (e.g. level 8's brick at x=13) is filtered out.
- `test.frm` is a scratch level outside the progression — skipped.
- Per-level quirks preserved: L9 bottom-wrap + 600 ms seals, L21 300 ms
  seals, L4 bonus flippers in ShowShips, L5/L10 pinned arrows, L11 hidden
  ladders revealed by the first bolt, L13/14 random warps, L19 seal-climb
  fallback, directional/self-loop/bounce warps, L11's per-penguin warp
  fan-out (seals entering it no-op instead of crashing like VB).

## Assets: the originals were found (`../data/`)

The sprites and sounds lived at a hardcoded `c:\ourfiles\...\vb\data\`
path — that folder turned up with everything penguin needs, so
`scripts/convert-assets.mjs` converts the real thing (25 BMP/ICO, incl.
per-penguin facing sprites and `0-3sign.ico` arrows) to PNG and the 4
WAVs (`bang`, `bigsplash`, `thump`, `warp`) to OGG. Only referenced
files are converted; `data/` itself stays uncommitted. The stray
`fish/shell/penguinl/...BMP` files in `Penguin/` are unused by the code.

## Controls

- **WASD** Zidgel · **IJKL** Midgel · **Arrows** Fidgel (the original used
  arrows/WASD-legacy/`PL;.’`; all three sets stay live simultaneously)
- **R** restarts · right-click a cell to inspect it · per-penguin flippers,
  bolts left and escort progress in the HUD, plus the original hint texts
  for levels 1–9.

## Fidelity notes

Ported 1:1 from the shared `level1.frm` code template, including quirks:
seal-vs-seal head-ons pass through each other vertically but bounce
horizontally, failed penguin-pushes still squash into occupied cells, doors
let everything through (VB's `If A = penguin Or seal Or ball` is always
true), hidden ladders still hold penguins, flippers burn even when pushed,
and escort counting is cumulative across deaths exactly like `intHome`.

Intentional deviations:

1. `MsgBox`es become banner messages; the death `Pause()` busy-wait is a
   250 ms sim pause.
2. The penguin-disabling checkboxes are skipped — all three penguins are
   always active (the VB default).
3. `Main.frm` lived outside the repo, so level select 1–21 plus
   auto-advance replaces it (with the original hints shown per level).
