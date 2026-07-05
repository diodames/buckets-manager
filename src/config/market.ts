// Transfer market, contract negotiation, and youth intake tuning.
// Formulas follow docs/design/transfers-contracts-youth-brief.md.
export const marketConfig = Object.freeze({
    contracts: Object.freeze({
        yearsMin: 1,
        yearsMax: 3,
        // Demand multipliers (M2).
        ageFactor: Object.freeze([
            { maxAge: 23, factor: 0.9 },
            { maxAge: 29, factor: 1.0 },
            { maxAge: 32, factor: 1.05 },
            { maxAge: 99, factor: 0.9 },
        ]),
        happinessMin: 0.9, // morale >= 80
        happinessMax: 1.25, // morale <= 30
        // Acceptance scoring (M3).
        acceptThreshold: 60,
        moneyWeight: 40,
        playingTimeWeight: 10,
        topTableBonus: 8,
        bottomTablePenalty: 8,
        longDealYoungBonus: 5,
        longDealOldPenalty: 5,
        // Negotiation flow.
        maxRounds: 3,
        firmMinimumFactor: 0.97,
        lockRounds: 5,
        lockMoralePenalty: 10,
        renewalsOpenFromRound: 12,
        // Free agents demand leverage mid-season (M5).
        freeAgentDemandMult: 1.15,
        // Salary stepper granularity in the UI.
        salaryStep: 50_000,
        // Terminating a contract costs this share of the remaining salary.
        buyoutFactor: 0.5,
        // Locker-room morale hit when a teammate is cut.
        releaseTeamMorale: 2,
    }),
    transfers: Object.freeze({
        // Transfer value TV = salary * base * ageV * potV * contractV (M6).
        salaryMult: 2.2,
        ageValue: Object.freeze([
            { maxAge: 22, factor: 1.5 },
            { maxAge: 26, factor: 1.2 },
            { maxAge: 29, factor: 1.0 },
            { maxAge: 32, factor: 0.6 },
            { maxAge: 99, factor: 0.35 },
        ]),
        potentialCap: 1.6,
        contractValue: Object.freeze({ multi: 1.0, finalYear: 0.55 }),
        // Window: market open through this round (deadline), FA always open (M9).
        deadlineRound: 12,
        // AI offers for listed players (M7).
        listingMoralePenalty: 5,
        offerChancePerRound: 0.5,
        offerFactorMin: 0.7,
        offerFactorMax: 1.0,
        needFactorMax: 1.15,
        aiCounterCeiling: 1.1,
        offerTtlRounds: 2,
        // Bidding on AI players (M8).
        sellFactorSurplus: 0.85,
        sellFactorNormal: 1.1,
        sellFactorCore: 1.5,
        // Unsolicited bids for stars (M10).
        unsolicitedChancePerRound: 0.06,
        unsolicitedFactorMin: 1.2,
        unsolicitedFactorMax: 1.4,
        rejectedBigBidMorale: 8,
        // Personal terms after a transfer: single round, demand * this (M8).
        postTransferDemandMult: 1.05,
        bidStep: 250_000,
    }),
    youth: Object.freeze({
        // Intake after this round (M11).
        intakeRound: 14,
        ageMin: 16,
        ageMax: 18,
        potentialBase: 45,
        potentialPerAcademyLevel: 6,
        potentialRandom: 20,
        overallShareMin: 0.45,
        overallShareMax: 0.65,
        // Youth deal (M13).
        salary: 200_000,
        years: 2,
        decisionRounds: 3,
        // Star presentation (M12): band width in stars by academy level 1..5.
        starBandByLevel: Object.freeze([2.0, 1.5, 1.0, 0.75, 0.5]),
        coachQuotes: 4,
        // Morale hit when a signed talent is sent back to the junior team.
        returnMoralePenalty: 5,
    }),
    roster: Object.freeze({
        // Real Kooperativa NBL limits.
        maxPlayers: 14,
        minPlayers: 10,
    }),
    // AI team-needs evaluation (M14-M15).
    ai: Object.freeze({
        evaluateEveryRounds: 2,
        depthOverallOffset: 5,
        surplusDepth: 3,
    }),
});

export type MarketConfig = typeof marketConfig;
