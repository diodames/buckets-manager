# Buckets Manager

A retro basketball management sim built with [BLIT386](https://www.npmjs.com/package/blit386) — a pixel-art game engine
for the browser. Take charge of a Czech NBL club: set your tactics, run training, negotiate contracts, work the transfer
market, bring juniors up from the youth academy, and chase the playoffs.

## Run it

Requires [Node.js](https://nodejs.org) 22.18 or newer.

```bash
npm install
npm run dev
```

Open the address Vite prints (usually `http://localhost:5173`) in your browser.

## Features

- **Season simulation** — full NBL season with standings, schedule, and playoffs; parallel BCL and FEC European cups.
- **Live matches** — pauseable possession engine with pace, offensive focus, and defensive scheme (man / zone / press),
  quarter-break rotations, energy and morale models, story moments, and an on-court panel for your starting five.
- **Squad management** — lineup and pre-match tactics editor, auto-substitutions, player stats, contract negotiation
  and termination, NBL roster limits (10–14 players, max 6 foreigners).
- **Transfer market** — potential-driven interest, watchlist, honest negotiations, real club colors.
- **Youth academy** — seasonal intake with star-range potential reports; sign prospects to the first team or release them.
- **Economy & press** — budgets, sponsor ambition deals, post-match press conferences, and individual season awards.
- Czech and English localization, save/load, difficulty settings, and a software-renderer fallback (`?backend=software`)
  for browsers without WebGPU.

## Commands

- `npm run dev` — start the dev server with hot reload.
- `npm run build` — production build into `dist/`.
- `npm test` — run the test suite (Vitest).
- `npm run typecheck` — TypeScript type check.
- `npm run lint` / `npm run format` — Biome lint and format.

## Deploy

The production build is served as static assets from Cloudflare Workers (see `wrangler.jsonc`):

```bash
npm run build
npx wrangler deploy
```

## Learn more

- `AGENTS.md` — a short home base for AI assistants working on the project.
- `docs/` — BLIT386 engine guides: getting started, the game loop, drawing, input, colors, and troubleshooting.
