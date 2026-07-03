// All match-simulation and player-generation tuning constants. The sim code
// contains no magic numbers; everything lives here so balance work never
// touches logic.
export const balanceConfig = Object.freeze({
    match: Object.freeze({
        quarters: 4,
        quarterSeconds: 600,
        overtimeSeconds: 300,
        // Seconds one possession consumes, before the pace factor is applied.
        possessionMinSeconds: 10,
        possessionMaxSeconds: 22,
        paceFactor: Object.freeze({ slow: 1.15, normal: 1.0, fast: 0.85 }),
        // Flat make-probability bonus for the home team's shots.
        homeAdvantage: 0.02,
    }),
    shots: Object.freeze({
        // Base make probability per shot kind for an average matchup.
        base: Object.freeze({ inside: 0.56, mid: 0.43, three: 0.35 }),
        // How strongly the attacker-vs-defender skill delta (normalized to
        // -1..1) swings the make probability.
        skillSwing: 0.22,
        makeProbMin: 0.05,
        makeProbMax: 0.95,
        // Shot-kind mix per offensive focus, weights sum to 1.
        mix: Object.freeze({
            inside: Object.freeze({ inside: 0.5, mid: 0.25, three: 0.25 }),
            balanced: Object.freeze({ inside: 0.38, mid: 0.27, three: 0.35 }),
            perimeter: Object.freeze({ inside: 0.28, mid: 0.24, three: 0.48 }),
        }),
        assistChance: 0.58,
    }),
    turnovers: Object.freeze({
        base: 0.13,
        // Ball-handling delta (normalized -1..1) scales the base turnover rate.
        ballHandlingSwing: 0.05,
        // Share of forced turnovers credited as steals.
        stealShare: 0.45,
    }),
    rebounds: Object.freeze({
        offensiveChance: 0.28,
        // Rebounding skill delta (normalized -1..1) swing on the offensive
        // rebound chance.
        skillSwing: 0.1,
    }),
    lineup: Object.freeze({
        // Active five swapped at quarter breaks: the N most tired starters
        // rest for a quarter in favor of the best bench players.
        quarterSwapCount: 2,
    }),
    playerGen: Object.freeze({
        attributeMin: 1,
        attributeMax: 99,
        ageMin: 18,
        ageMax: 36,
        // Mean attribute value for a league-average player and the +/- spread
        // applied per attribute during generation.
        attributeMean: 58,
        attributeSpread: 18,
        // Positional biases added to relevant attributes.
        positionBias: Object.freeze({
            PG: Object.freeze({ passing: 12, dribbling: 12, speed: 8, shooting3: 5, rebounding: -10 }),
            SG: Object.freeze({ shooting3: 10, shooting2: 6, speed: 6, rebounding: -6 }),
            SF: Object.freeze({ shooting2: 6, defense: 4, rebounding: 2 }),
            PF: Object.freeze({ rebounding: 10, blocking: 6, defense: 4, shooting3: -6, dribbling: -6 }),
            C: Object.freeze({ rebounding: 14, blocking: 12, shooting2: 4, shooting3: -14, dribbling: -10, speed: -6 }),
        }),
        heightRangeCm: Object.freeze({
            PG: Object.freeze({ min: 180, max: 193 }),
            SG: Object.freeze({ min: 188, max: 200 }),
            SF: Object.freeze({ min: 196, max: 206 }),
            PF: Object.freeze({ min: 201, max: 211 }),
            C: Object.freeze({ min: 205, max: 221 }),
        }),
    }),
});

export type BalanceConfig = typeof balanceConfig;
export type Pace = keyof typeof balanceConfig.match.paceFactor;
export type OffenseFocus = keyof typeof balanceConfig.shots.mix;
