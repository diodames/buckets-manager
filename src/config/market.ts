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
        freeAgentDemandMult: 1.22,
        // Salary stepper granularity in the UI.
        salaryStep: 50_000,
        // Terminating a contract costs this share of the remaining salary.
        buyoutFactor: 0.5,
        // Locker-room morale hit when a teammate is cut.
        releaseTeamMorale: 2,
    }),
    transfers: Object.freeze({
        // Transfer value TV = salary * base * ageV * potV * contractV (M6).
        salaryMult: 3.2,
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
        // Closes before playoffs (regular season is 22 rounds with 12 teams).
        deadlineRound: 22,
        // AI offers for listed players (M7).
        listingMoralePenalty: 5,
        offerChancePerRound: 0.5,
        offerFactorMin: 0.7,
        offerFactorMax: 1.0,
        needFactorMax: 1.15,
        aiCounterCeiling: 1.1,
        offerTtlRounds: 2,
        // Bidding on AI players (M8).
        sellFactorSurplus: 0.95,
        sellFactorNormal: 1.45,
        sellFactorCore: 2.05,
        sellFactorCzechCore: 2.55,
        // Unsolicited bids for stars (M10) — rare; at most one per season.
        unsolicitedChancePerRound: 0.005,
        unsolicitedFactorMin: 1.2,
        unsolicitedFactorMax: 1.4,
        rejectedBigBidMorale: 8,
        // Personal terms after a transfer (M8).
        postTransferDemandMult: 1.12,
        // Extra acceptance score once a fee is agreed — player is ready to move.
        transferTermsAcceptBonus: 5,
        // When fee >= transfer value, demand scales by this (serious buyer signal).
        transferFeeCommitmentMult: 0.96,
        bidStep: 300_000,
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
    }),
    // AI team-needs evaluation (M14-M15).
    ai: Object.freeze({
        evaluateEveryRounds: 2,
        depthOverallOffset: 5,
        surplusDepth: 3,
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
