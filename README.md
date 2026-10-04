# Remade Games

Unified repo and site for modern web remakes of old Visual Basic games.
One repo, one GitHub Pages site; each game lives under its own path
(`smile2/`, …) with a landing page at the root.

## Structure

```
index.html                  landing page (static, links to each game)
smile2-web/                 Smile Game II remake (standalone Vite + TS app)
smile3-web/                 Smile Game III remake (standalone Vite + TS app)
space-web/                  Space Game remake (standalone Vite + TS app)
penguin-web/                Penguin Game remake (standalone Vite + TS app)
  src/ tests/ public/ …
.github/workflows/deploy.yml  builds every *-web app, assembles one site
```

The original VB sources (`smile2/`, `smile3/`, `space/`, `space2/`) are
deliberately **not** committed — build inputs only. Converted assets
(PNG/OGG) and level files are committed inside each game's `public/`;
`scripts/convert-assets.mjs` in each game regenerates them locally from the
originals sitting next to it.

## Local dev

```sh
cd smile2-web
npm install
npm run dev     # game at http://localhost:5173
npm test        # game tests
```

## Adding the next game

1. Copy the shape: `smileN-web/` as a standalone Vite app building with a
   relative base (`base: "./"` in `vite.config.ts`) so it works under a subpath.
2. Commit its converted assets under its own `public/`.
3. Add a link in `index.html`.
4. Add build steps in `.github/workflows/deploy.yml` and copy its `dist/`
   into `site/<name>/` in the assemble step.

## Deploy

Push to `main` → the workflow builds each game, assembles `site/`
(`index.html` + one folder per game), and deploys to GitHub Pages.
Enable in repo Settings → Pages → Source: **GitHub Actions**.
