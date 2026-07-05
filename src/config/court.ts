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
    // Possession choreography tuning (ui/court.ts state machine).
    choreo: Object.freeze({
        // Speed multipliers on playerStepPx: the ball handler dribbles slower
        // than off-ball cutters and transition sprinters.
        dribbleSpeedMult: 0.8,
        cutSpeedMult: 1.3,
        sprintSpeedMult: 1.6,
        // Pass flights: pixels per tick, with a clamped tick duration so the
        // ball always travels faster than any player.
        passSpeedPx: 6.5,
        passMinTicks: 5,
        passMaxTicks: 22,
        // Ticks a running play script may keep going after the shot event
        // arrives before it is cut to its final positions.
        shotGraceTicks: 14,
        // Minimum on-screen spacing kept between teammates, in pixels.
        minSeparationPx: 6,
        // Man defense: fraction of the mark-to-basket line to sag off.
        manSag: 0.33,
        manOnBallSag: 0.16,
        // Press defense: near-glue sag, applied full court.
        pressSag: 0.07,
        pressOnBallSag: 0.05,
        // Zone defense: normalized drift of zone spots toward the ball side.
        zoneShiftX: 0.08,
        zoneShiftY: 0.18,
        // Ticks an off-ball attacker may camp inside the key before being
        // sent back out to a corner (post-play big excepted).
        keyCampTicks: 55,
        // Baseline x of the inbounder after a conceded basket / dead ball.
        inboundBaselineX: 0.035,
    }),
});

export type CourtConfig = typeof courtConfig;
