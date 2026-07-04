import type { Rgb } from './palette';

// 2D match viewer configuration: court geometry in normalized units
// (x 0..1 along the length, y 0..1 across the width) plus playback pacing.
export const courtConfig = Object.freeze({
    // Pixel box of the court on screen (kept ~2:1 like a real court, sized to
    // leave room for the scoreboard above and the commentary feed below).
    pixelWidth: 420,
    pixelHeight: 188,
    // Normalized geometry.
    basketInsetX: 0.06,
    threePointRadius: 0.24,
    keyWidth: 0.3,
    keyDepth: 0.17,
    centerCircleRadius: 0.12,
    // Palette slots (kept clear of UI roles 1..15 and team colors 16..39).
    slots: Object.freeze({
        floor: 40,
        lines: 41,
        ball: 42,
        crowdBase: 43, // 4 slots: 43..46 cycled for crowd shimmer
        rim: 47,
        floorDark: 48,
        keyFill: 49,
        skin: 50,
    }),
    colors: Object.freeze<Record<string, Rgb>>({
        floor: { r: 172, g: 120, b: 64 },
        floorDark: { r: 158, g: 108, b: 56 },
        keyFill: { r: 146, g: 96, b: 52 },
        skin: { r: 236, g: 188, b: 148 },
        lines: { r: 232, g: 220, b: 200 },
        ball: { r: 240, g: 128, b: 32 },
        crowd1: { r: 52, g: 56, b: 84 },
        crowd2: { r: 72, g: 64, b: 96 },
        crowd3: { r: 60, g: 76, b: 100 },
        crowd4: { r: 84, g: 72, b: 88 },
        rim: { r: 220, g: 60, b: 40 },
    }),
    // Crowd band above the court, in pixels.
    crowdBandHeight: 18,
    crowdCycleSpeed: 3,
    // Playback: milliseconds an event stays on screen at speed 1.
    eventDelaysMs: Object.freeze({
        playCall: 500,
        shot: 950,
        foul: 700,
        freeThrow: 700,
        rebound: 550,
        turnover: 750,
        substitution: 500,
        timeout: 900,
        injury: 1200,
        moment: 400,
        periodEnd: 1600,
        gameEnd: 1200,
    }),
    speeds: Object.freeze([1, 2, 4]),
    // Sprite movement: pixels per frame toward the target.
    playerStepPx: 1.6,
    fastBreakStepMult: 2.2,
    ballFlightTicks: 26,
    commentaryLines: 7,
});

export type CourtConfig = typeof courtConfig;
