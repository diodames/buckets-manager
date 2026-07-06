---
name: verify
description: How to build, launch, and drive the Buckets Manager game (BLIT386/Vite) for end-to-end verification in a browser.
---

# Verifying Buckets Manager

## Launch

- `npm run dev -- --port 5173 --strictPort` (background). Vite is configured with `open: false`.
- Game URL: http://localhost:5173/ — engine boots in ~1-2 s (watch console for `[BT] Demo started successfully`).
- Software renderer fallback: append `?backend=software` to test without WebGPU.

## Drive (chrome-devtools MCP)

- The whole UI is keyboard-driven on one canvas: Arrows navigate, Enter confirms, Esc goes back, Backquote toggles the engine debug HUD.
- **Gotcha:** the first key pressed right after a page load is often lost (engine still booting / sampling starts late). Take a screenshot first to confirm the menu renders, then press keys. If a flow ends on the wrong screen, suspect a missed ArrowDown, not game logic.
- CDP `press_key` down+up is faster than one engine tick; arrows are caught via the buffered `isKeyPressed` path (src/app/UiInput.ts). If arrows ever go dead, check that path first.
- Headless Chrome + WebGPU occasionally crashes the GPU process → silent page reload back to the main menu. Saves live in localStorage (`bbm.autosave`, `bbm.save.1..3`, `bbm.settings`) and survive.

## Flows worth driving

1. Main menu → Nová hra → team table (ratings visible) → Enter → Dashboard.
2. Dashboard → Odehrát kolo → results list + autosave written; Tabulka must match results.
3. Uložit hru → slot; saving to an occupied slot must raise the overwrite dialog (overlay).
4. Nahrát hru (also from main menu after reload) → loads state, status bar shows loaded team/round.
5. Nastavení → language toggle switches every label instantly (cs/en) and persists across reload.

## Logic checks

`npm test` (Vitest, pure core — determinism, scheduler, sim bands, save round-trip, boundary), `npm run typecheck`, `npm run lint`. These are CI, not verification — drive the browser for the real thing.
