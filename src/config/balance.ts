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
        homeAdvantage: 0.03,
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
    // Offensive play types: per-possession play call shifts shooter choice,
    // shot mix, assists, and turnover risk. Weights are relative.
    plays: Object.freeze({
        baseWeights: Object.freeze({ pickRoll: 0.34, motion: 0.26, iso: 0.16, post: 0.24 }),
        // Additive weight bias by offensive focus.
        focusBias: Object.freeze({
            inside: Object.freeze({ pickRoll: 0.05, motion: -0.14, iso: -0.04, post: 0.13 }),
            balanced: Object.freeze({ pickRoll: 0, motion: 0, iso: 0, post: 0 }),
            perimeter: Object.freeze({ pickRoll: 0.04, motion: 0.14, iso: 0.02, post: -0.2 }),
        }),
        modifiers: Object.freeze({
            pickRoll: Object.freeze({ shotMix: Object.freeze({ inside: 0.45, mid: 0.3, three: 0.25 }), assistChance: 0.68, turnoverMult: 1.0, makeBonus: 0.01 }),
            motion: Object.freeze({ shotMix: Object.freeze({ inside: 0.2, mid: 0.25, three: 0.55 }), assistChance: 0.75, turnoverMult: 0.9, makeBonus: 0.0 }),
            iso: Object.freeze({ shotMix: Object.freeze({ inside: 0.3, mid: 0.4, three: 0.3 }), assistChance: 0.05, turnoverMult: 1.15, makeBonus: -0.02 }),
            post: Object.freeze({ shotMix: Object.freeze({ inside: 0.65, mid: 0.3, three: 0.05 }), assistChance: 0.45, turnoverMult: 1.05, makeBonus: 0.0 }),
            fastBreak: Object.freeze({ shotMix: Object.freeze({ inside: 0.72, mid: 0.08, three: 0.2 }), assistChance: 0.6, turnoverMult: 0.9, makeBonus: 0.14 }),
        }),
        // Fast break trigger chances; press defense concedes extra breaks.
        fastBreak: Object.freeze({
            afterSteal: 0.55,
            afterDefRebound: 0.16,
            vsPressBonus: 0.15,
            possessionSeconds: 6,
        }),
    }),
    // Defensive schemes: multipliers applied to the DEFENDING team's effect.
    defense: Object.freeze({
        man: Object.freeze({ insideDefBonus: 0, threeDefBonus: 0, stealMult: 1.0, reboundBonus: 0, energyDrainMult: 1.0, foulMult: 1.0 }),
        zone: Object.freeze({ insideDefBonus: 0.05, threeDefBonus: -0.04, stealMult: 0.8, reboundBonus: 0.04, energyDrainMult: 0.92, foulMult: 0.85 }),
        press: Object.freeze({ insideDefBonus: -0.03, threeDefBonus: 0.01, stealMult: 1.5, reboundBonus: -0.03, energyDrainMult: 1.45, foulMult: 1.25 }),
    }),
    fouls: Object.freeze({
        // Chance a shot attempt draws a shooting foul, by shot kind.
        shootingFoulChance: Object.freeze({ inside: 0.13, mid: 0.06, three: 0.03 }),
        // Make probability penalty when shooting through contact (and-one case).
        contactMakePenalty: 0.22,
        // Free-throw make probability from the freeThrows attribute.
        ftBase: 0.45,
        ftSkillWeight: 0.45,
        // Offensive rebound chance multiplier after a missed final free throw.
        ftMissOffRebMult: 0.6,
    }),
    blocks: Object.freeze({
        // Base chance an attempted shot is blocked, by kind, scaled by the
        // best rim protector's blocking vs the shooter.
        baseChance: Object.freeze({ inside: 0.08, mid: 0.04, three: 0.012 }),
        skillSwing: 0.06,
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
    energy: Object.freeze({
        // In-match energy: 100 = fresh. Effective skill multiplier spans
        // [minSkillMult, 1.0] as energy falls from 100 to 0.
        minSkillMult: 0.72,
        // Morale 0..100 maps to [moraleSkillMin, 1.0] on effective skill.
        moraleSkillMin: 0.88,
        moraleSkillMax: 1.08,
        // Energy drained per second on court, scaled by pace factor.
        drainPerSecond: 0.028,
        // Energy regained per second on the bench.
        benchRegenPerSecond: 0.05,
        // Auto-substitution threshold: active player below this energy is
        // swapped for the freshest bench player when possible.
        autoSubThreshold: 42,
        // Minimum energy advantage the bench player must have to sub in.
        autoSubMinGain: 15,
        // Pre-match: accumulated fatigue reduces starting energy.
        fatigueToEnergy: 0.6,
    }),
    timeouts: Object.freeze({
        perTeam: 4,
        // Energy restored to the calling team's active five.
        energyBoost: 10,
        // Temporary skill buff for the calling team, in possessions.
        buffMultiplier: 1.06,
        buffPossessions: 6,
    }),
    injuries: Object.freeze({
        // Per-possession base chance an on-court player takes a knock,
        // multiplied when energy is low.
        basePerPossession: 0.0006,
        lowEnergyMultiplier: 3,
        lowEnergyThreshold: 30,
        // Rounds out: 1..maxRoundsOut uniformly.
        maxRoundsOut: 5,
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
export type DefenseScheme = keyof typeof balanceConfig.defense;
export type PlayType = keyof typeof balanceConfig.plays.modifiers;
