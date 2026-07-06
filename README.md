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

- **Season simulation** — full NBL season with standings, schedule, and playoffs.
- **Live matches** — pauseable match engine with 15+ offensive tactics, defensive formations, energy and injury models,
  and an on-court panel showing your starting five in action.
- **Squad management** — lineup editor with auto-substitutions, player stats, contract negotiation and termination.
- **Transfer market** — potential-driven transfer interest, honest negotiations, real club colors.
- **Youth academy** — open academy pipeline; juniors return from loan and can be bought out.
- **Economy & press** — budgets, sponsor income, and post-match press conferences.
- Czech and English localization, save/load, and a software-renderer fallback (`?backend=software`) for browsers
  without WebGPU.

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
