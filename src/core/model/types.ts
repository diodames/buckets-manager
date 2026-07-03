import type { OffenseFocus, Pace } from '../../config/balance';

export type TeamId = string;
export type PlayerId = string;

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type Position = (typeof POSITIONS)[number];

// All ratings live on a 1..99 scale.
export interface Attributes {
    shooting2: number;
    shooting3: number;
    freeThrows: number;
    passing: number;
    dribbling: number;
    defense: number;
    rebounding: number;
    blocking: number;
    stealing: number;
    speed: number;
    stamina: number;
    iq: number;
}

export type AttributeKey = keyof Attributes;

export const ATTRIBUTE_KEYS: readonly AttributeKey[] = [
    'shooting2',
    'shooting3',
    'freeThrows',
    'passing',
    'dribbling',
    'defense',
    'rebounding',
    'blocking',
    'stealing',
    'speed',
    'stamina',
    'iq',
];

export interface Player {
    id: PlayerId;
    firstName: string;
    lastName: string;
    age: number;
    heightCm: number;
    position: Position;
    attributes: Attributes;
    // Hidden development ceiling, 1..99 (used from M3 on).
    potential: number;
    // 0 = fresh, 100 = exhausted (used from M3 on).
    fatigue: number;
    morale: number;
    teamId: TeamId | null;
}

export interface Tactics {
    starters: Record<Position, PlayerId>;
    pace: Pace;
    offenseFocus: OffenseFocus;
}

export interface Team {
    id: TeamId;
    playerIds: PlayerId[];
    tactics: Tactics;
    // Palette slots assigned at league creation (presentation hint only).
    colorSlotPrimary: number;
    colorSlotSecondary: number;
}

export interface BoxLine {
    points: number;
    fgm2: number;
    fga2: number;
    fgm3: number;
    fga3: number;
    rebounds: number;
    assists: number;
    steals: number;
    turnovers: number;
}

export interface MatchSummary {
    homeScore: number;
    awayScore: number;
    // One [home, away] entry per quarter plus one per overtime.
    quarterScores: Array<[number, number]>;
    box: Record<PlayerId, BoxLine>;
    // Seed used to sim this match; replaying with it reproduces every event.
    seed: number;
}

export interface Fixture {
    id: string;
    round: number;
    homeTeamId: TeamId;
    awayTeamId: TeamId;
    result: MatchSummary | null;
}

export interface StandingsRow {
    teamId: TeamId;
    played: number;
    wins: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
}

export interface GameState {
    version: number;
    masterSeed: number;
    userTeamId: TeamId;
    seasonYear: number;
    // 1-based round the league will play next; rounds+1 means season is over.
    currentRound: number;
    teams: Record<TeamId, Team>;
    players: Record<PlayerId, Player>;
    fixtures: Fixture[];
}

export function createEmptyBoxLine(): BoxLine {
    return { points: 0, fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, rebounds: 0, assists: 0, steals: 0, turnovers: 0 };
}

/** Simple overall rating: mean of all attributes, rounded. */
export function overallRating(attributes: Attributes): number {
    let sum = 0;
    for (const key of ATTRIBUTE_KEYS) {
        sum += attributes[key];
    }
    return Math.round(sum / ATTRIBUTE_KEYS.length);
}
