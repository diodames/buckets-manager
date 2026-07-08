// Transfer market, contract negotiation, and youth intake tuning.
// Formulas follow docs/design/transfers-contracts-youth-brief.md.
export const marketConfig = Object.freeze({
    contracts: Object.freeze({
        yearsMin: 1,
        yearsMax: 3,
        // Agent fee on signing/renewal (M4).
        agentFeePct: 0.08,
        agentFeeElitePct: 0.10,
        agentFeeEliteOverall: 85,
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
        // Free agents demand leverage by season phase (M5).
        freeAgentDemandByRound: Object.freeze([
            { maxRound: 7, mult: 1.05 },
            { maxRound: 12, mult: 1.15 },
            { maxRound: 99, mult: 1.25 },
        ]),
        // Performance form factor on demand (M2): hot/cold streak from season game score.
        formFactorMin: 0.92,
        formFactorMax: 1.10,
        formRatioHot: 1.08,
        formRatioCold: 0.95,
        // Position scarcity on demand and transfer value.
        scarcePositionBonus: 1.08,
        surplusPositionDiscount: 0.95,
        scarcePositions: Object.freeze(['PG', 'C'] as const),
        scarceOverallOffset: 8,
        // Czech players command a modest premium (limited foreign slots, domestic value).
        czechMarketSalaryMult: 1.10,
        // Salary stepper granularity in the UI.
        salaryStep: 50_000,
        // Terminating a contract costs this share of the remaining salary.
        buyoutFactor: 0.5,
        // Locker-room morale hit when a teammate is cut.
        releaseTeamMorale: 2,
    }),
    transfers: Object.freeze({
        // Transfer value TV = salary * base * ageV * potV * contractV * scarcity (M6).
        salaryMult: 2.2,
        // Smoother age curve: avoid a cliff at 30; veterans still discount but stay tradable.
        ageValue: Object.freeze([
            { maxAge: 22, factor: 1.35 },
            { maxAge: 26, factor: 1.15 },
            { maxAge: 29, factor: 1.0 },
            { maxAge: 32, factor: 0.88 },
            { maxAge: 35, factor: 0.72 },
            { maxAge: 99, factor: 0.5 },
        ]),
        potentialCap: 1.6,
        // Final-year deals cost less, but not so much that prime veterans look broken.
        contractValue: Object.freeze({ multi: 1.0, finalYear: 0.78, expiringSoon: 0.58 }),
        expiringSoonRounds: 6,
        // Transfer market (M9): open all season; closes when NBL playoffs start. FA always open.
        preseasonWindowRound: 1,
        midWindowStartRound: 8,
        midWindowEndRound: 12,
        deadlineRound: 22,
        deadlineOfferBurstCount: 3,
        forcedSellFactor: 0.70,
        // AI offers for listed players (M7).
        listingMoralePenalty: 5,
        offerChancePerRound: 0.5,
        offerFactorMin: 0.7,
        offerFactorMax: 1.0,
        needFactorMax: 1.15,
        aiCounterCeiling: 1.1,
        offerTtlRounds: 2,
        // Bidding on AI players (M8). Tighter spread so asking prices track ability more closely.
        sellFactorSurplus: 0.93,
        sellFactorNormal: 1.05,
        sellFactorCore: 1.22,
        sellFactorCzechCore: 1.28,
        // Unsolicited bids for stars (M10) — rare; at most one per season.
        unsolicitedChancePerRound: 0.005,
        unsolicitedFactorMin: 1.2,
        unsolicitedFactorMax: 1.4,
        rejectedBigBidMorale: 8,
        // Personal terms after a transfer (M8).
        postTransferDemandMult: 1.05,
        // Extra acceptance score once a fee is agreed — player is ready to move.
        transferTermsAcceptBonus: 5,
        // When fee >= transfer value, demand scales by this (serious buyer signal).
        transferFeeCommitmentMult: 0.96,
        bidStep: 200_000,
        // Premium for buying a player under contract (rights fee on top of sell factor).
        clubRightsPremium: 1.1,
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
        // Fixed real academy talents surface on random rounds through this deadline.
        fixedAcademyDeadlineRound: 12,
        // Max hand-authored generation talents queued per club per season.
        fixedProspectsPerSeason: 1,
        // Cap on new academy arrivals (fixed + random intake) each season.
        maxProspectsPerSeason: 3,
        // Unsigned prospects leave the academy after this many season rollovers.
        maxUnsignedSeasons: 2,
    }),
    roster: Object.freeze({
        // Real Kooperativa NBL limits.
        maxPlayers: 14,
        minPlayers: 10,
        maxForeigners: 6,
    }),
    // AI team-needs evaluation (M14-M15).
    ai: Object.freeze({
        evaluateEveryRounds: 2,
        depthOverallOffset: 5,
        surplusDepth: 3,
        maxTransferSpendPct: 0.60,
        forcedSellPayrollWeeks: 2,
    }),
    /** AI contract renewals, walk-aways, and elite signing gates. */
    aiRenewal: Object.freeze({
        baseRenewChance: 0.55,
        czechBonus: 0.22,
        coreBonus: 0.28,
        starSalaryPremium: 0.10,
        coreYearsMin: 2,
        coreYearsMax: 3,
        walkAwayIntentThreshold: 0.35,
        foreignAbroadWalkChance: 0.55,
        userForeignAbroadWalkChance: 0.25,
        minGames: 12,
        bottomHalfRank: 7,
        bclQualifiers: 2,
        bclOnlyMinOverall: 62,
        walkAwayIntentCap: 0.65,
        renewAcceptMin: 0.15,
        renewAcceptMax: 0.98,
        userRenewalIntentPenalty: 8,
        userRenewalIntentThreshold: 0.2,
        eliteTransferTermsMult: 1.15,
        /** Soft pull/push from Champions League project appeal (acceptance, walk-away, demand). */
        bclPrestige: Object.freeze({
            minGamesForProjection: 8,
            projectedRankCushion: 1,
            confirmedAcceptBonus: 6,
            activeSeasonAcceptBonus: 4,
            projectedAcceptBonus: 3,
            noBclAcceptPenalty: 5,
            walkAwayReductionConfirmed: 0.08,
            walkAwayReductionActive: 0.1,
            walkAwayReductionProjected: 0.04,
            walkAwayIncreaseNoBcl: 0.07,
            aiRenewBonusConfirmed: 0.08,
            aiRenewBonusActive: 0.06,
            aiRenewBonusProjected: 0.04,
            aiRenewPenaltyNoBcl: 0.06,
            demandDiscountConfirmed: 0.94,
            demandDiscountActive: 0.92,
            demandPremiumNoBcl: 1.06,
            ambitiousMaxAge: 30,
            ambitiousMinOverall: 56,
        }),
    }),
    /** Offseason career retirements (age + playing-time outlook). */
    retirement: Object.freeze({
        mandatoryAge: 38,
        voluntaryMinAge: 33,
        minutesCheckMinAge: 28,
        baseRetireChance: 0.06,
        chancePerYearOver: 0.11,
        minGamesForShare: 10,
        lowGamesShare: 0.22,
        blockedDepthCount: 2,
        moraleRetireBoost: 0.08,
        starterShareProtection: 0.35,
        faRetireMinAge: 33,
        fanSupportPenalty: 1,
        teammateMoralePenalty: 3,
    }),
});

export type MarketConfig = typeof marketConfig;
