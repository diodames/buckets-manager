// Story moments: random narrative situations during a live match that pause
// the game and ask the coach for a decision. Effects are interpreted by the
// match engine; texts live in i18n under `moment.<id>.*`.
export interface MomentChoiceDef {
    id: string;
    // Temporary team buff (skill multiplier for N possessions).
    buffMultiplier?: number;
    buffPossessions?: number;
    // Extra injury risk multiplier for the involved player until match end.
    injuryRiskMultiplier?: number;
    // Force the involved player off the court for the rest of the match.
    subOutPlayer?: boolean;
    // Post-match morale effects.
    teamMorale?: number;
    playerMorale?: number;
    // Energy restored to the active five.
    energyBoost?: number;
}

export interface MomentDef {
    id: string;
    // Trigger context evaluated by the engine.
    trigger: 'hotStreak' | 'coldStreak' | 'injuryScare' | 'refereeCall' | 'crowdSurge' | 'blowout' | 'clutch';
    // Base chance evaluated once per eligible situation.
    chance: number;
    homeOnly?: boolean;
    choices: MomentChoiceDef[];
}

export interface TeamTalkDef {
    id: string;
    buffMultiplier: number;
    buffPossessions: number;
    teamMorale: number;
}

export const momentsConfig = Object.freeze({
    // At most this many moments per match, and never closer than this many
    // possessions apart.
    maxPerMatch: 3,
    minPossessionGap: 20,
    // Pre-match team talk styles (dressing-room speech).
    teamTalks: Object.freeze<TeamTalkDef[]>([
        { id: 'calm', buffMultiplier: 1.03, buffPossessions: 12, teamMorale: 1 },
        { id: 'fire', buffMultiplier: 1.08, buffPossessions: 7, teamMorale: 2 },
        { id: 'demand', buffMultiplier: 1.05, buffPossessions: 10, teamMorale: -2 },
    ]),
    defs: Object.freeze<MomentDef[]>([
        {
            id: 'hotStreak',
            trigger: 'hotStreak',
            chance: 0.5,
            choices: [
                { id: 'feed', buffMultiplier: 1.1, buffPossessions: 8, playerMorale: 6, injuryRiskMultiplier: 1.5 },
                { id: 'balance', teamMorale: 3 },
            ],
        },
        {
            id: 'coldStreak',
            trigger: 'coldStreak',
            chance: 0.45,
            choices: [
                { id: 'yell', buffMultiplier: 1.07, buffPossessions: 6, teamMorale: -3 },
                { id: 'calm', buffMultiplier: 1.03, buffPossessions: 10, teamMorale: 2 },
            ],
        },
        {
            id: 'injuryScare',
            trigger: 'injuryScare',
            chance: 0.6,
            choices: [
                { id: 'risk', injuryRiskMultiplier: 3, playerMorale: 4 },
                { id: 'protect', subOutPlayer: true, playerMorale: -2, teamMorale: 1 },
            ],
        },
        {
            id: 'refereeCall',
            trigger: 'refereeCall',
            chance: 0.35,
            choices: [
                { id: 'protest', buffMultiplier: 1.05, buffPossessions: 5, teamMorale: 3, playerMorale: 2 },
                { id: 'accept', teamMorale: -1 },
            ],
        },
        {
            id: 'crowdSurge',
            trigger: 'crowdSurge',
            chance: 0.4,
            homeOnly: true,
            choices: [
                { id: 'ride', buffMultiplier: 1.08, buffPossessions: 6, energyBoost: 5 },
                { id: 'focus', teamMorale: 1, energyBoost: 3 },
            ],
        },
        {
            id: 'blowoutLead',
            trigger: 'blowout',
            chance: 0.5,
            choices: [
                { id: 'rest', teamMorale: 2, energyBoost: 8 },
                { id: 'pressOn', buffMultiplier: 1.05, buffPossessions: 8, teamMorale: -1, injuryRiskMultiplier: 1.3 },
            ],
        },
        {
            id: 'clutchTime',
            trigger: 'clutch',
            chance: 0.65,
            choices: [
                { id: 'heroBall', buffMultiplier: 1.1, buffPossessions: 5, playerMorale: 5, injuryRiskMultiplier: 1.2 },
                { id: 'teamPlay', buffMultiplier: 1.05, buffPossessions: 6, teamMorale: 2 },
            ],
        },
    ]),
});

export type MomentsConfig = typeof momentsConfig;
