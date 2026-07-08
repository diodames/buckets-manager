import { economyConfig } from '../../config/economy';
import { leagueConfig } from '../../config/league';
import { marketConfig } from '../../config/market';
import { SAVE_FORMAT_VERSION } from '../game';
import { relinkCompetitionGroups } from '../bcl/index';
import { resyncRosterContracts } from '../market';
import type { GameState } from '../model/types';

export interface SaveFile {
    formatVersion: number;
    name: string;
    savedAtIso: string;
    state: GameState;
}

export class SaveError extends Error {
    readonly kind: 'corrupt' | 'tooNew';

    constructor(kind: 'corrupt' | 'tooNew', message: string) {
        super(message);
        this.kind = kind;
    }
}

// Migration chain: index N upgrades a version-N save to version N+1.
const migrations: Record<number, (old: unknown) => unknown> = {
    // v1 saves come from the pre-NBL fictional league; their team ids no
    // longer exist, so they cannot be migrated meaningfully.
    1: () => {
        throw new SaveError('corrupt', 'Save predates the real NBL league data and cannot be loaded');
    },
    // v2 -> v3: defensive schemes and extended box scores (ftm/fta/blocks).
    2: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const teams = (file.state.teams ?? {}) as Record<string, { tactics?: Record<string, unknown> }>;
        for (const team of Object.values(teams)) {
            if (team.tactics && !('defenseScheme' in team.tactics)) {
                team.tactics.defenseScheme = 'man';
            }
        }
        const fixtures = (file.state.fixtures ?? []) as Array<{ result?: { box?: Record<string, Record<string, number>> } | null }>;
        for (const fixture of fixtures) {
            for (const line of Object.values(fixture.result?.box ?? {})) {
                line.ftm ??= 0;
                line.fta ??= 0;
                line.blocks ??= 0;
            }
        }
        file.state.version = 3;
        return { ...file, formatVersion: 3 };
    },
    // v3 -> v4: player contracts and the transfer market state.
    3: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const players = (file.state.players ?? {}) as Record<string, { attributes?: Record<string, number>; contract?: unknown }>;
        for (const player of Object.values(players)) {
            if (!('contract' in player) || player.contract === undefined) {
                const values = Object.values(player.attributes ?? {});
                const overall = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 50;
                // Mirrors economyConfig.salary defaults at the time of v4.
                player.contract = { salary: Math.max(300_000, Math.round(600_000 + (overall - 50) * 40_000)), yearsLeft: 1 };
            }
        }
        file.state.market = {
            listings: [],
            incomingOffers: [],
            negotiations: [],
            negotiationLocks: {},
            youthProspects: [],
            youthIntakeDone: false,
        };
        file.state.version = 4;
        return { ...file, formatVersion: 4 };
    },
    // v4 -> v5: post-season bracket state.
    4: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        file.state.playoffs ??= null;
        const playoffs = file.state.playoffs as Record<string, unknown> | null;
        if (playoffs) {
            playoffs.thirdPlaceSeries ??= null;
            playoffs.thirdPlaceTeamId ??= null;
        }
        file.state.version = 5;
        return { ...file, formatVersion: 5 };
    },
    // v5 -> v6: multi-season, BCL, calendar week, sponsor cap.
    5: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const state = file.state;
        state.calendarWeek = state.currentRound ?? 1;
        state.competitions ??= {};
        state.lastSeasonStandings ??= {};
        state.nblPrizePaid ??= false;
        state.lastOffseason ??= null;
        state.bclQualified ??= false;
        const club = state.club as { sponsors?: Array<unknown> } | undefined;
        if (club?.sponsors && club.sponsors.length > 1) {
            club.sponsors = club.sponsors.slice(0, 1);
        }
        const fixtures = (state.fixtures ?? []) as Array<{ competitionId?: string; week?: number; round: number }>;
        for (const f of fixtures) {
            f.competitionId ??= 'nbl';
            f.week ??= f.round;
        }
        state.version = 6;
        return { ...file, formatVersion: 6 };
    },
    // v6 -> v7: sponsor ambition performance clauses.
    6: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const club = file.state.club as {
            sponsors?: Array<Record<string, unknown>>;
            sponsorOffers?: Array<Record<string, unknown>>;
        } | undefined;
        for (const deal of club?.sponsors ?? []) {
            deal.promisedMaxRank ??= 12;
            deal.penaltyAmount ??= 0;
        }
        for (const offer of club?.sponsorOffers ?? []) {
            offer.promisedMaxRank ??= 12;
            offer.penaltyAmount ??= 0;
            offer.ambitionId ??= 'safe';
        }
        const lastOff = file.state.lastOffseason as Record<string, unknown> | null | undefined;
        if (lastOff) {
            lastOff.sponsorPenalty ??= 0;
            lastOff.sponsorPromisedRank ??= null;
            lastOff.sponsorActualRank ??= null;
        }
        file.state.version = 7;
        return { ...file, formatVersion: 7 };
    },
    // v7 -> v8: real NBL season signing pool and timed market releases.
    7: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const market = (file.state.market ?? {}) as Record<string, unknown>;
        market.pendingFreeAgents ??= [];
        market.processedDepartureKeys ??= [];
        market.signingHints ??= {};
        file.state.market = market;
        file.state.version = 8;
        return { ...file, formatVersion: 8 };
    },
    // v8 -> v9: breakthrough external offers from European clubs.
    8: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const market = (file.state.market ?? {}) as Record<string, unknown>;
        market.externalOffers ??= [];
        file.state.market = market;
        const lastOff = file.state.lastOffseason as Record<string, unknown> | null | undefined;
        if (lastOff) {
            lastOff.breakthroughOffers ??= 0;
        }
        file.state.version = 9;
        return { ...file, formatVersion: 9 };
    },
    // v9 -> v10: player-settable ticket price.
    9: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const club = file.state.club as Record<string, unknown> | undefined;
        if (club) {
            club.ticketPrice ??= 220;
        }
        file.state.version = 10;
        return { ...file, formatVersion: 10 };
    },
    // v10 -> v11: staggered real academy talent arrivals.
    10: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const market = (file.state.market ?? {}) as Record<string, unknown>;
        market.pendingFixedYouthArrivals ??= [];
        file.state.market = market;
        file.state.version = 11;
        return { ...file, formatVersion: 11 };
    },
    // v11 -> v12: gradual facility upgrades over several rounds.
    11: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const club = file.state.club as Record<string, unknown> | undefined;
        if (club) {
            club.facilityProjects ??= {};
        }
        file.state.version = 12;
        return { ...file, formatVersion: 12 };
    },
    // v12 -> v13: sponsor success bonuses and renewal downgrade (no post-season fines).
    12: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const club = file.state.club as {
            sponsors?: Array<Record<string, unknown>>;
            sponsorOffers?: Array<Record<string, unknown>>;
            sponsorRenewalDowngrade?: boolean;
        } | undefined;
        const bonusFromTarget = (promisedMaxRank: unknown): number => {
            const rank = typeof promisedMaxRank === 'number' ? promisedMaxRank : 12;
            if (rank <= 1) {
                return 2_500_000;
            }
            if (rank <= 6) {
                return 1_000_000;
            }
            if (rank <= 10) {
                return 400_000;
            }
            return 0;
        };
        for (const deal of club?.sponsors ?? []) {
            if (deal.bonusAmount === undefined) {
                deal.bonusAmount = ((deal.penaltyAmount as number | undefined) ?? 0) > 0
                    ? bonusFromTarget(deal.promisedMaxRank)
                    : 0;
            }
            delete deal.penaltyAmount;
        }
        for (const offer of club?.sponsorOffers ?? []) {
            if (offer.bonusAmount === undefined) {
                offer.bonusAmount = ((offer.penaltyAmount as number | undefined) ?? 0) > 0
                    ? bonusFromTarget(offer.promisedMaxRank)
                    : 0;
            }
            delete offer.penaltyAmount;
        }
        if (club) {
            club.sponsorRenewalDowngrade ??= false;
        }
        const lastOff = file.state.lastOffseason as Record<string, unknown> | null | undefined;
        if (lastOff) {
            lastOff.sponsorBonus ??= 0;
            lastOff.sponsorTargetMet ??= (lastOff.sponsorPenalty as number | undefined ?? 0) === 0;
            if ((lastOff.sponsorPenalty as number | undefined ?? 0) > 0 && club) {
                club.sponsorRenewalDowngrade = true;
            }
            delete lastOff.sponsorPenalty;
        }
        file.state.version = 13;
        return { ...file, formatVersion: 13 };
    },
    // v13 -> v14: cap unsolicited bids at one per season.
    13: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const market = (file.state.market ?? {}) as Record<string, unknown>;
        market.unsolicitedBidUsed ??= false;
        file.state.market = market;
        file.state.version = 14;
        return { ...file, formatVersion: 14 };
    },
    // v14 -> v15: unsigned academy graduates tracked in offseason summary.
    14: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const lastOff = file.state.lastOffseason as Record<string, unknown> | null | undefined;
        if (lastOff) {
            lastOff.youthGraduated ??= 0;
        }
        file.state.version = 15;
        return { ...file, formatVersion: 15 };
    },
    // v15 -> v16: player nationality for contract/retention rules.
    15: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const players = (file.state.players ?? {}) as Record<string, { nationality?: string }>;
        for (const player of Object.values(players)) {
            player.nationality ??= 'CZE';
        }
        file.state.version = 16;
        return { ...file, formatVersion: 16 };
    },
    // v16 -> v17: youth prospects track unsigned seasons in the academy.
    16: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const market = (file.state.market ?? {}) as { youthProspects?: Array<Record<string, unknown>> };
        for (const prospect of market.youthProspects ?? []) {
            prospect.academySeasons ??= 0;
        }
        file.state.version = 17;
        return { ...file, formatVersion: 17 };
    },
    // v17 -> v18: career retirements in offseason summary.
    17: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const lastOff = file.state.lastOffseason as Record<string, unknown> | null | undefined;
        if (lastOff) {
            lastOff.playersRetired ??= 0;
            lastOff.userRetirements ??= [];
        }
        file.state.version = 18;
        return { ...file, formatVersion: 18 };
    },
    // v18 -> v19: named player movements in offseason summary.
    18: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const lastOff = file.state.lastOffseason as Record<string, unknown> | null | undefined;
        if (lastOff) {
            lastOff.playerMovements ??= [];
        }
        file.state.version = 19;
        return { ...file, formatVersion: 19 };
    },
    // v19 -> v20: sponsor signing fees on ambition deals.
    19: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const club = file.state.club as {
            sponsors?: Array<Record<string, unknown>>;
            sponsorOffers?: Array<Record<string, unknown>>;
        } | undefined;
        for (const deal of club?.sponsors ?? []) {
            deal.signingBonus ??= 0;
        }
        for (const offer of club?.sponsorOffers ?? []) {
            offer.signingBonus ??= 0;
        }
        file.state.version = 20;
        return { ...file, formatVersion: 20 };
    },
    // v20 -> v21: NBL regular-season table prizes in offseason summary.
    20: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const lastOff = file.state.lastOffseason as Record<string, unknown> | null | undefined;
        if (lastOff) {
            lastOff.nblLeagueRank ??= null;
            lastOff.nblLeaguePrize ??= 0;
        }
        file.state.version = 21;
        return { ...file, formatVersion: 21 };
    },
    // v21 -> v22: BCL qualification from NBL playoff finish, not regular season.
    21: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        file.state.lastBclQualifierIds ??= [];
        file.state.version = 22;
        return { ...file, formatVersion: 22 };
    },
    // v22 -> v23: cap new academy arrivals per season.
    22: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const market = (file.state.market ?? {}) as {
            youthProspects?: unknown[];
            pendingFixedYouthArrivals?: unknown[];
            youthArrivalsThisSeason?: number;
        };
        if (market.youthArrivalsThisSeason === undefined) {
            const visible = market.youthProspects?.length ?? 0;
            const pending = market.pendingFixedYouthArrivals?.length ?? 0;
            market.youthArrivalsThisSeason = visible + pending;
        }
        file.state.market = market;
        file.state.version = 23;
        return { ...file, formatVersion: 23 };
    },
    // v23 -> v24: AI NBL club budgets (nblFinances).
    23: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const state = file.state;
        const userTeamId = state.userTeamId as string;
        const finances: Record<string, { budget: number; fanSupport: number; sponsorTier: number }> = {};
        for (const teamDef of leagueConfig.teams) {
            if (teamDef.id === userTeamId) {
                continue;
            }
            const tier = Math.max(1, Math.min(5, Math.round(teamDef.tier)));
            finances[teamDef.id] = {
                budget: economyConfig.startingBudgetByTier[tier - 1] ?? economyConfig.startingBudget,
                fanSupport: economyConfig.fanSupport.start,
                sponsorTier: tier,
            };
        }
        state.nblFinances = finances;
        state.version = 24;
        return { ...file, formatVersion: 24 };
    },
    // v24 -> v25: NBL 3rd-place playoff, BCL qualifying entrant, FIBA Europe Cup.
    24: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const state = file.state;
        const playoffs = state.playoffs as Record<string, unknown> | null | undefined;
        if (playoffs) {
            playoffs.thirdPlaceSeries ??= null;
            playoffs.thirdPlaceTeamId ??= null;
        }
        state.bclDirectQualified ??= state.bclQualified ?? false;
        state.bclQualifyingEntrantId ??= null;
        state.fecQualified ??= false;
        state.lastFecQualifierIds ??= [];
        const comps = state.competitions as Record<string, Record<string, unknown>> | undefined;
        if (comps?.bcl) {
            comps.bcl.qualifyingSeries ??= null;
            comps.bcl.qualifyingEntrantId ??= null;
            comps.bcl.qualifyingOpponentId ??= null;
        }
        state.version = 25;
        return { ...file, formatVersion: 25 };
    },
    // v25 -> v26: European weekly prize tracking and pre-season scouting state.
    25: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const state = file.state;
        const market = state.market as Record<string, unknown> | undefined;
        if (market) {
            market.scoutingComplete ??= true;
            market.scoutedFreeAgents ??= {};
            market.scoutingBudget ??= 0;
            market.scoutingBudgetTotal ??= 0;
        }
        const comps = state.competitions as Record<string, Record<string, unknown>> | undefined;
        for (const key of ['bcl', 'fec']) {
            if (comps?.[key]) {
                comps[key].weeklyPrizePaidTotal ??= 0;
            }
        }
        state.version = 26;
        return { ...file, formatVersion: 26 };
    },
    // v26 -> v27: resync all player contracts to the current salary / transfer scale.
    26: (old) => {
        const file = old as { formatVersion: number; state: GameState };
        resyncRosterContracts(file.state, economyConfig, marketConfig);
        file.state.version = 27;
        return { ...file, formatVersion: 27 };
    },
    // v27 -> v28: real-NBL salary table and decoupled transfer values.
    27: (old) => {
        const file = old as { formatVersion: number; state: GameState };
        resyncRosterContracts(file.state, economyConfig, marketConfig);
        file.state.version = 28;
        return { ...file, formatVersion: 28 };
    },
    // v28 -> v29: watchlist, press hooks, awards, career history, difficulty, tutorial.
    28: (old) => {
        const file = old as { formatVersion: number; state: GameState };
        const state = file.state;
        const market = state.market as unknown as Record<string, unknown>;
        market.watchlist ??= [];
        market.pendingPressHooks ??= [];
        state.lastSeasonAwards ??= null;
        state.careerHistory ??= [];
        state.difficulty ??= 'hard';
        state.tutorialStep ??= null;
        for (const team of Object.values(state.teams)) {
            team.aiListings ??= [];
        }
        file.state.version = 29;
        return { ...file, formatVersion: 29 };
    },
    // v29 -> v30: board objectives, career milestones, contextual hints, AI facilities.
    29: (old) => {
        const file = old as { formatVersion: number; state: GameState };
        const state = file.state;
        state.boardObjective ??= null;
        state.careerMilestones ??= {
            championships: 0,
            playoffAppearances: 0,
            bclTitles: 0,
            boardWarnings: 0,
            seasonsCompleted: state.careerHistory?.length ?? 0,
        };
        state.contextualHintsSeen ??= [];
        if (state.club) {
            state.club.transferEmbargo ??= false;
        }
        for (const finance of Object.values(state.nblFinances ?? {})) {
            finance.facilities ??= { arena: 1, training: 1, academy: 1 };
            finance.roundsSinceFacilityUpgrade ??= 0;
        }
        file.state.version = 30;
        return { ...file, formatVersion: 30 };
    },
};

export function serializeSave(state: GameState, name: string, savedAtIso: string): string {
    const file: SaveFile = { formatVersion: SAVE_FORMAT_VERSION, name, savedAtIso, state };
    return JSON.stringify(file);
}

export function deserializeSave(raw: string): SaveFile {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new SaveError('corrupt', 'Save data is not valid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || !('formatVersion' in parsed)) {
        throw new SaveError('corrupt', 'Save data has no formatVersion');
    }
    let file = parsed as { formatVersion: number };
    if (typeof file.formatVersion !== 'number') {
        throw new SaveError('corrupt', 'formatVersion is not a number');
    }
    if (file.formatVersion > SAVE_FORMAT_VERSION) {
        throw new SaveError('tooNew', `Save version ${file.formatVersion} is newer than supported ${SAVE_FORMAT_VERSION}`);
    }
    while (file.formatVersion < SAVE_FORMAT_VERSION) {
        const migrate = migrations[file.formatVersion];
        if (!migrate) {
            throw new SaveError('corrupt', `No migration from save version ${file.formatVersion}`);
        }
        file = migrate(file) as { formatVersion: number };
    }
    const complete = file as SaveFile;
    if (typeof complete.state !== 'object' || complete.state === null) {
        throw new SaveError('corrupt', 'Save has no game state');
    }
    const comps = complete.state.competitions;
    if (comps.bcl) {
        relinkCompetitionGroups(comps.bcl);
    }
    if (comps.fec) {
        relinkCompetitionGroups(comps.fec);
    }
    return complete;
}
