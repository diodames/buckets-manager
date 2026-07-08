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
    /** ISO 3166-1 alpha-3 (e.g. CZE, USA). */
    nationality: string;
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

export type CompetitionId = 'nbl' | 'bcl';

export type BclPhase =
    | 'qualifying'
    | 'regularSeason'
    | 'playIn'
    | 'roundOf16'
    | 'quarterFinals'
    | 'finalFour'
    | 'complete';

export interface Fixture {
    id: string;
    round: number;
    homeTeamId: TeamId;
    awayTeamId: TeamId;
    result: MatchSummary | null;
    competitionId?: CompetitionId;
    // Calendar week when this fixture is played (defaults to round for NBL).
    week?: number;
}

export interface BclGroup {
    id: string;
    teamIds: TeamId[];
    fixtures: Fixture[];
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
    kind: 'tickets' | 'sponsors' | 'sponsorSigning' | 'sponsorBonus' | 'sponsorPenalty' | 'salaries' | 'maintenance' | 'upgrade' | 'bonus' | 'leaguePrize' | 'transferIn' | 'transferOut' | 'buyout';
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
    // Performance clause: rank targets use regular-season finish; promisedMaxRank 1 = NBL playoff champion.
    promisedMaxRank: number;
    // One-time CZK bonus paid at season end when the target is met.
    bonusAmount: number;
    // One-time CZK signing fee paid when the deal was accepted (0 for legacy deals).
    signingBonus: number;
}

export interface SponsorOffer {
    id: string;
    brandKey: string;
    tier: number;
    perRound: number;
    seasons: number;
    // Offer expires after this round.
    expiresRound: number;
    promisedMaxRank: number;
    bonusAmount: number;
    // One-time CZK signing fee paid on accept (tier-scaled when generated).
    signingBonus: number;
    // Ambition profile id for display (safe | standard | bold).
    ambitionId: string;
}

export interface FacilityProject {
    targetLevel: number;
    startedRound: number;
    completesRound: number;
}

export interface ClubState {
    budget: number;
    fanSupport: number;
    ticketPrice: number;
    facilities: Record<FacilityKey, number>;
    /** In-progress facility upgrades; benefits ramp until completion. */
    facilityProjects: Partial<Record<FacilityKey, FacilityProject>>;
    sponsors: SponsorDeal[];
    sponsorOffers: SponsorOffer[];
    /** When true, next offseason ambition offers are downgraded after a missed target. */
    sponsorRenewalDowngrade: boolean;
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
    mode: 'renew' | 'freeAgent' | 'transferTerms' | 'externalRetention';
    /** Set when mode is externalRetention — links to the foreign club bid. */
    externalOfferId?: string;
    /** Agreed transfer fee when mode is transferTerms (personal terms step). */
    agreedTransferFee?: number;
}

export type ExternalOfferTier = 'bcl' | 'euroleague';

export type ExternalOfferStatus = 'pending' | 'accepted' | 'rejected' | 'retained' | 'departed';

export interface ExternalOffer {
    id: string;
    playerId: PlayerId;
    tier: ExternalOfferTier;
    clubName: string;
    clubCity: string;
    transferFee: number;
    salaryOffer: number;
    contractYears: 2 | 3;
    breakthroughRatio: number;
    /** Per-game averages for UI presentation. */
    seasonPpg: number;
    seasonGameScore: number;
    seasonYear: number;
    expiresRound: number;
    status: ExternalOfferStatus;
    /** After rejecting a Euroleague bid, player may still leave at the deadline. */
    mayForceDeparture?: boolean;
}

export interface YouthProspect {
    player: Player;
    // Star-range presentation of hidden potential (M12), 1..5 with halves.
    starMin: number;
    starMax: number;
    quoteIndex: number;
    decideByRound: number;
    // Completed seasons spent unsigned in the academy (increments each offseason).
    academySeasons: number;
}

export interface FixedYouthArrival {
    playerId: PlayerId;
    arriveRound: number;
}

export interface MarketState {
    listings: TransferListing[];
    incomingOffers: TransferOffer[];
    negotiations: NegotiationState[];
    // playerId -> locked until round (failed negotiations, M3).
    negotiationLocks: Record<PlayerId, number>;
    youthProspects: YouthProspect[];
    /** New academy arrivals (fixed + random intake) added in the current season. */
    youthArrivalsThisSeason: number;
    youthIntakeDone: boolean;
    /** Scheduled real academy talents not yet shown in the youth intake list. */
    pendingFixedYouthArrivals: FixedYouthArrival[];
    /** Real signings waiting to enter the FA pool (timed releases). */
    pendingFreeAgents: PendingFreeAgent[];
    /** Departure events already processed this season. */
    processedDepartureKeys: string[];
    /** Real-world signing hints for AI club interest. */
    signingHints: Record<PlayerId, TeamId>;
    /** Breakthrough-season bids from BCL / Euroleague clubs. */
    externalOffers: ExternalOffer[];
    /** True after an unsolicited bid arrives this season (no market listing). */
    unsolicitedBidUsed: boolean;
}

export interface PendingFreeAgent {
    id: string;
    player: Player;
    availableFromRound: number;
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

export interface CompetitionState {
    id: CompetitionId;
    phase: BclPhase;
    fixtures: Fixture[];
    groups: BclGroup[];
    playoffs: PlayoffState | null;
    qualifiedTeamIds: TeamId[];
    championTeamId: TeamId | null;
    prizePaid: boolean;
    // User's BCL finish for prize calculation.
    userFinish: BclUserFinish | null;
}

export type BclUserFinish =
    | 'champion'
    | 'finalist'
    | 'semifinal'
    | 'quarterfinal'
    | 'roundOf16'
    | 'groupStage'
    | 'playIn'
    | 'qualifying';

export type NblPlayoffFinish = 'champion' | 'finalist' | 'semifinal' | 'quarterfinal' | 'playoffs' | 'missed';

export type OffseasonMovementKind = 'retired' | 'leftAbroad' | 'freeAgent';

export type OffseasonMovementReason = 'expired' | 'nonRenewal' | 'youthGraduate';

export interface OffseasonPlayerMovement {
    kind: OffseasonMovementKind;
    name: string;
    age: number;
    position: Position;
    formerTeamId: TeamId | null;
    formerTeamName: string;
    isUserPlayer: boolean;
    reason?: OffseasonMovementReason;
}

export interface OffseasonReviewSummary {
    nblFinish: NblPlayoffFinish;
    nblPrize: number;
    nblLeagueRank: number | null;
    nblLeaguePrize: number;
    bclQualified: boolean;
    bclFinish: BclUserFinish | null;
    bclPrize: number;
    sponsorBonus: number;
    sponsorTargetMet: boolean;
    sponsorPromisedRank: number | null;
    sponsorActualRank: number | null;
    totalIncome: number;
}

export interface OffseasonSummary {
    nblFinish: NblPlayoffFinish;
    nblPrize: number;
    nblLeagueRank: number | null;
    nblLeaguePrize: number;
    bclQualified: boolean;
    bclFinish: BclUserFinish | null;
    bclPrize: number;
    contractsExpired: number;
    newFreeAgents: number;
    youthGraduated: number;
    sponsorExpired: boolean;
    sponsorBonus: number;
    sponsorTargetMet: boolean;
    sponsorPromisedRank: number | null;
    sponsorActualRank: number | null;
    breakthroughOffers: number;
    playersRetired: number;
    userRetirements: string[];
    playerMovements: OffseasonPlayerMovement[];
}

export interface GameState {
    version: number;
    masterSeed: number;
    userTeamId: TeamId;
    seasonYear: number;
    // 1-based round the league will play next; rounds+1 means season is over.
    currentRound: number;
    // Master calendar week (NBL + BCL interleaved).
    calendarWeek: number;
    teams: Record<TeamId, Team>;
    players: Record<PlayerId, Player>;
    fixtures: Fixture[];
    // The user club's management state (AI clubs keep no books).
    club: ClubState;
    market: MarketState;
    // Post-season bracket; null until the regular season ends.
    playoffs: PlayoffState | null;
    // Parallel competitions keyed by id.
    competitions: Partial<Record<CompetitionId, CompetitionState>>;
    // Finishing rank from the last completed NBL season (1-based).
    lastSeasonStandings: Record<TeamId, number>;
    // Flags to avoid double-paying prizes within a season.
    nblPrizePaid: boolean;
    // Last offseason summary for UI display.
    lastOffseason: OffseasonSummary | null;
    // Whether user qualified for BCL in the upcoming/current season.
    bclQualified: boolean;
    // Czech NBL teams that earned BCL entry from the last completed NBL playoffs.
    lastBclQualifierIds: TeamId[];
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
