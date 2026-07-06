import type { DefenseScheme, OffenseFocus, Pace } from '../../config/balance';
import type { FacilityKey } from '../../config/economy';
import type { TrainingFocus } from '../../config/training';

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

export interface Contract {
    salary: number;
    yearsLeft: number;
}

export interface Player {
    id: PlayerId;
    firstName: string;
    lastName: string;
    age: number;
    heightCm: number;
    position: Position;
    attributes: Attributes;
    // Hidden development ceiling, 1..99.
    potential: number;
    // 0 = fresh, 100 = exhausted.
    fatigue: number;
    morale: number;
    // null = healthy; otherwise rounds remaining out.
    injury: { roundsOut: number } | null;
    teamId: TeamId | null;
    // null only for unsigned youth prospects / free agents.
    contract: Contract | null;
}

export interface Tactics {
    starters: Record<Position, PlayerId>;
    pace: Pace;
    offenseFocus: OffenseFocus;
    defenseScheme: DefenseScheme;
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
    ftm: number;
    fta: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
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

export interface LedgerEntry {
    round: number;
    // i18n key suffix under ledger.<kind>.
    kind: 'tickets' | 'sponsors' | 'salaries' | 'maintenance' | 'upgrade' | 'bonus' | 'transferIn' | 'transferOut' | 'buyout';
    amount: number;
}

export interface SponsorDeal {
    id: string;
    brandKey: string;
    tier: number;
    perRound: number;
    // Remaining seasons including the current one.
    seasonsRemaining: number;
    relationship: number;
}

export interface SponsorOffer {
    id: string;
    brandKey: string;
    tier: number;
    perRound: number;
    seasons: number;
    // Offer expires after this round.
    expiresRound: number;
}

export interface ClubState {
    budget: number;
    fanSupport: number;
    facilities: Record<FacilityKey, number>;
    sponsors: SponsorDeal[];
    sponsorOffers: SponsorOffer[];
    ledger: LedgerEntry[];
    trainingFocus: TrainingFocus;
}

export interface TransferListing {
    playerId: PlayerId;
    askingPrice: number | null;
    listedRound: number;
}

export interface TransferOffer {
    id: string;
    playerId: PlayerId;
    fromTeamId: TeamId;
    amount: number;
    expiresRound: number;
    // The user may counter once (M7).
    countered: boolean;
}

export interface NegotiationState {
    playerId: PlayerId;
    // 1-based negotiation round, max marketConfig.contracts.maxRounds.
    round: number;
    // Revealed information after rejections.
    hintSalary: number | null;
    mode: 'renew' | 'freeAgent' | 'transferTerms';
}

export interface YouthProspect {
    player: Player;
    // Star-range presentation of hidden potential (M12), 1..5 with halves.
    starMin: number;
    starMax: number;
    quoteIndex: number;
    decideByRound: number;
}

export interface MarketState {
    listings: TransferListing[];
    incomingOffers: TransferOffer[];
    negotiations: NegotiationState[];
    // playerId -> locked until round (failed negotiations, M3).
    negotiationLocks: Record<PlayerId, number>;
    youthProspects: YouthProspect[];
    youthIntakeDone: boolean;
}

export interface PlayoffSeries {
    id: string;
    // 0-based stage index (0 = quarterfinals with an 8-team format).
    stage: number;
    // Bracket position within the stage, preserved across stages.
    slot: number;
    // Higher seed; holds home court in odd-numbered games.
    homeTeamId: TeamId;
    awayTeamId: TeamId;
    homeWins: number;
    awayWins: number;
    games: Fixture[];
}

export interface PlayoffState {
    stage: number;
    // Original seeding, 1-based by regular-season standing.
    seeds: Record<TeamId, number>;
    series: PlayoffSeries[];
    championTeamId: TeamId | null;
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
    // The user club's management state (AI clubs keep no books).
    club: ClubState;
    market: MarketState;
    // Post-season bracket; null until the regular season ends.
    playoffs: PlayoffState | null;
}

export function createEmptyBoxLine(): BoxLine {
    return {
        points: 0, fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0,
        rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0,
    };
}

/** Simple overall rating: mean of all attributes, rounded. */
export function overallRating(attributes: Attributes): number {
    let sum = 0;
    for (const key of ATTRIBUTE_KEYS) {
        sum += attributes[key];
    }
    return Math.round(sum / ATTRIBUTE_KEYS.length);
}
