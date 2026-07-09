import { bclConfig } from './bcl';

/** Tuning for breakthrough-season interest from European clubs (offers-only). */
export const externalOffersConfig = Object.freeze({
    /** Minimum games with box-score data to qualify for evaluation. */
    minGames: 12,
    /** Hollinger-lite game score: (pts + reb + ast + stl + blk - tov) / games vs expected from OVR. */
    expectedGameScoreSlope: 0.42,
    expectedGameScoreIntercept: 4,
    bcl: Object.freeze({
        minRatio: 1.28,
        minOverall: 58,
        maxAge: 30,
    }),
    euroleague: Object.freeze({
        minRatio: 1.42,
        minOverall: 66,
        maxAge: 27,
        minPotentialGap: 2,
    }),
    /** Transfer fee = baseFee * (feeBase + severity * feeSeverityScale). */
    fee: Object.freeze({
        severityBase: 1.2,
        severityMax: 0.6,
        bclBase: 2.2,
        bclSeverityScale: 2.0,
        euroBase: 4.5,
        euroSeverityScale: 4.0,
        roundTo: 100_000,
    }),
    /** Gross salary offers abroad (CZK/season). */
    salary: Object.freeze({
        bclDemandMult: 2.8,
        bclBaseMult: 3.2,
        bclCap: 6_000_000,
        euroDemandMult: 5.5,
        euroBaseMult: 6.5,
        euroCap: 14_000_000,
    }),
    /** BCL deals are 2 years; Euroleague 2 or 3 (weighted toward 3). */
    bclContractYears: 2 as const,
    euroContractYears: Object.freeze([2, 3] as const),
    /** User must respond by this round of the new season. */
    expiresRound: 4,
    /** Morale / fan support when a star leaves abroad. */
    rejectMoralePenalty: 12,
    retainMoralePenalty: 5,
    departTeamMoralePenalty: 5,
    departFanSupportPenalty: 2,
    /** After rejecting a Euroleague bid, this chance the player still leaves at the deadline. */
    euroRejectForceDepartureChance: 0.3,
    /** Retention negotiation (vs foreign salary benchmark). */
    retention: Object.freeze({
        acceptThreshold: 66,
        prestigePenaltyBcl: 10,
        prestigePenaltyEuro: 18,
        matchBonus: 8,
        underpayPenalty: 12,
        matchThreshold: 0.9,
        underpayThreshold: 0.7,
    }),
    /** BCL club names drawn from existing BCL config (tier 4+). */
    bclClubPool: Object.freeze(
        bclConfig.teams
            .filter((t) => t.tier >= 4)
            .map((t) => ({ name: t.name, city: t.city })),
    ),
    /** Fictional Euroleague-tier clubs (offers only, not playable). */
    euroleagueClubPool: Object.freeze([
        { name: 'BC Olympiacos Piraeus', city: 'Piraeus' },
        { name: 'Fenerbahce Istanbul', city: 'Istanbul' },
        { name: 'Real Madrid Baloncesto', city: 'Madrid' },
        { name: 'Panathinaikos Athens', city: 'Athens' },
        { name: 'AS Monaco Basket', city: 'Monaco' },
        { name: 'Virtus Bologna', city: 'Bologna' },
        { name: 'FC Barcelona Basket', city: 'Barcelona' },
        { name: 'Maccabi Tel Aviv', city: 'Tel Aviv' },
    ]),
});

export type ExternalOffersConfig = typeof externalOffersConfig;
