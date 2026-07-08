// Club economy tuning: all amounts in CZK. The user manages one club's
// books; AI NBL clubs keep a lightweight budget in GameState.nblFinances.
export const economyConfig = Object.freeze({
    startingBudget: 9_500_000,
    // Starting cash by club tier 1..5 (weaker clubs begin with less).
    startingBudgetByTier: Object.freeze([8_000_000, 9_500_000, 10_500_000, 12_000_000, 13_500_000]),
    // Player salary per season (CZK). Real NBL contracts are ~9 months; monthly ≈ season / 9.
    // base + (overall - 50) * perPoint (floored at min).
    salary: Object.freeze({
        base: 400_000,
        // OVR 50-70: perPoint | 71-80: perPointMid | 81+: perPointElite.
        perPoint: 48_000,
        perPointMid: 60_000,
        perPointElite: 75_000,
        min: 340_000,
    }),
    tickets: Object.freeze({
        defaultPrice: 220,
        minPrice: 80,
        maxPrice: 600,
        priceStep: 10,
        referencePrice: 220,
        incomeScale: 0.82,
        plateauMin: 0.75,
        plateauMax: 1.25,
        fairPriceBase: 0.90,
        fairPriceSupportWeight: 0.20,
        priceElasticity: 0.55,
        discountBoost: 0.12,
        overpriceFanDrift: -0.3,
        underpriceFanDrift: 0.15,
        overpriceBand: 1.30,
        underpriceBand: 0.70,
        // Attendance share of capacity: base + fan-support weight; clamped.
        baseAttendance: 0.35,
        fanSupportWeight: 0.55,
        minAttendance: 0.15,
        maxAttendance: 1.0,
        // Weakest crowd still gives this share of full home-court shooting boost.
        homeAdvantageMinMult: 0.35,
        homeAdvantageFromPrice: false,
        /** Multiplier on attendance-scaled home-court shooting boost. */
        homeAdvantageAttendanceScale: 1.35,
    }),
    // Regional derby home gates: +25% ticket income when hosting a listed rival (NBL only).
    derbies: Object.freeze({
        incomeMult: 1.25,
        pairs: Object.freeze([
            Object.freeze(['DEC', 'UST']),
            Object.freeze(['HKR', 'PCE']),
            Object.freeze(['OPA', 'OST']),
            Object.freeze(['BRN', 'PIS']),
            Object.freeze(['SLA', 'USK']),
        ]),
    }),
    facilities: Object.freeze({
        maxLevel: 5,
        // Arena seating capacity by level (level 1 = default NBL hall). When
        // real arena capacity is known, level 1 uses it and higher levels
        // scale it by capacityScale.
        arenaCapacityByLevel: Object.freeze([1500, 2200, 3200, 4500, 6500]),
        arenaCapacityScale: Object.freeze([1.0, 1.35, 1.8, 2.4, 3.2]),
        // Training facility: multiplies player development speed.
        trainingDevMultiplier: Object.freeze([1.0, 1.15, 1.3, 1.5, 1.75]),
        // Academy: quality bonus of generated youth fill-ins and future draftees.
        academyYouthBonus: Object.freeze([0, 3, 6, 10, 15]),
        // Upgrade cost to REACH level index (level 1 is free/default).
        upgradeCost: Object.freeze({
            arena: Object.freeze([0, 4_000_000, 9_000_000, 18_000_000, 35_000_000]),
            // Training ~20% pricier: development is strong but indirect.
            training: Object.freeze([0, 3_000_000, 6_000_000, 12_000_000, 22_000_000]),
            // Academy ~50% pricier: best long-term value, should not be trivial early.
            academy: Object.freeze([0, 2_500_000, 5_500_000, 10_500_000, 18_000_000]),
        }),
        // Per-round maintenance by facility level index 1..5 (summed across arena/training/academy).
        maintenancePerLevelPerRound: Object.freeze([0, 10_000, 10_000, 12_000, 16_000, 20_000]),
        // Rounds until upgrade benefits fully apply (index = target level 1..5).
        upgradeRounds: Object.freeze({
            arena: Object.freeze([0, 5, 6, 7, 9]),
            training: Object.freeze([0, 4, 5, 6, 8]),
            academy: Object.freeze([0, 4, 5, 6, 8]),
        }),
    }),
    // NBL playoff prize money (CZK), paid once at season end.
    playoffPrizes: Object.freeze({
        champion: 1_000_000,
        finalist: 500_000,
        thirdPlace: 320_000,
        fourthPlace: 200_000,
        semifinal: 260_000,
        quarterfinal: 130_000,
        playoffs: 65_000,
    }),
    // NBL regular-season table prize money (CZK), paid once at season end (in addition to playoff prizes).
    leaguePrizesByRank: Object.freeze([
        { maxRank: 1, prize: 1_500_000 },
        { maxRank: 2, prize: 1_100_000 },
        { maxRank: 3, prize: 900_000 },
        { maxRank: 6, prize: 650_000 },
        { maxRank: 9, prize: 400_000 },
        { maxRank: 11, prize: 200_000 },
        { maxRank: 12, prize: 130_000 },
    ]),
    // Weekly NBL central income (TV / league pool) by club tier 1..5.
    leagueSharePerRoundByTier: Object.freeze([70_000, 100_000, 130_000, 165_000, 210_000]),
    /** Bonus multiplier for clubs currently in the NBL top four (e.g. 0.15 = +15%). */
    leagueShareTop4Bonus: 0.15,
    // AI weekly gate-income estimate by club tier (replaces flat 45k heuristic).
    aiGateEstimatePerRoundByTier: Object.freeze([35_000, 42_000, 52_000, 58_000, 68_000]),
    sponsors: Object.freeze({
        slots: 1,
        // Per-round base payment range by deal tier 1..5 (success bonuses are separate).
        perRoundByTier: Object.freeze([85_000, 145_000, 210_000, 300_000, 420_000]),
        // Relationship 0..100 scales payment [minMult..maxMult].
        relationMinMult: 0.8,
        relationMaxMult: 1.25,
        startRelationship: 55,
        // Relationship drift per result.
        winDrift: 1.5,
        lossDrift: -1,
        // Deal ends early when relationship falls below this at round end.
        terminateBelow: 20,
        // Ambition sponsor profiles shown at game start and each offseason.
        ambitionProfiles: Object.freeze([
            { id: 'safe', promisedMaxRank: 10, tier: 1, signingBonus: 450_000, bonusAmount: 350_000 },
            { id: 'standard', promisedMaxRank: 8, tier: 2, signingBonus: 425_000, bonusAmount: 1_000_000 },
            { id: 'bold', promisedMaxRank: 1, tier: 3, signingBonus: 250_000, bonusAmount: 2_500_000 },
        ]),
        // signingBonus on ambition profiles is scaled by club tier at offer time:
        // paid = round25k(profile.signingBonus * (0.85 + 0.03 * tier)).
        signingBonusTierBase: 0.85,
        signingBonusTierStep: 0.03,
        signingBonusRoundStep: 25_000,
        // New offer generation: chance per round when a slot is free (disabled; ambition picks only).
        offerChancePerRound: 0,
        offerSeasonsMin: 1,
        offerSeasonsMax: 1,
        // Sponsor interest by NBL finishing rank (1-based).
        interestByRank: Object.freeze([
            { maxRank: 3, tierMin: 4, tierMax: 5 },
            { maxRank: 6, tierMin: 3, tierMax: 4 },
            { maxRank: 9, tierMin: 2, tierMax: 3 },
            { maxRank: 12, tierMin: 1, tierMax: 2 },
        ]),
        // BCL participation bumps sponsor tier interest by this amount.
        bclTierBonus: 1,
        // FEC participation bumps sponsor tier interest (capped in offer generation).
        fecTierBonus: 1,
        // Multiplier on per-round payment for European-qualified clubs.
        europePerRoundMult: 1.1,
        // Fictional sponsor brand name keys (i18n: sponsor.<key>).
        brands: Object.freeze([
            'pivovar', 'kolonial', 'drogerie', 'strojirny', 'banka',
            'pojistovna', 'energetika', 'autoservis', 'pekarna', 'itfirma',
        ]),
    }),
    fanSupport: Object.freeze({
        start: 50,
        winDrift: 2,
        lossDrift: -1.5,
        blowoutBonus: 1,
        min: 5,
        max: 100,
    }),
    ledgerCapacity: 60,
    european: Object.freeze({
        travelCost: Object.freeze({ bcl: 120_000, fec: 80_000 }),
        matchFee: Object.freeze({ bcl: 150_000, fec: 100_000 }),
        weeklyParticipation: Object.freeze({ bcl: 80_000, fec: 50_000 }),
    }),
    scouting: Object.freeze({
        baseBudgetByTier: Object.freeze([300_000, 350_000, 450_000, 550_000, 650_000]),
        bclBonus: 150_000,
        fecBonus: 75_000,
        quickReportCost: 40_000,
        deepReportCost: 90_000,
        workoutCost: 120_000,
        academyDiscountPerLevel: 10_000,
    }),
    // Board wage budget and cashflow warning thresholds (Football Manager-style).
    financial: Object.freeze({
        wageBudgetPct: 0.68,
        minEndBalance: 500_000,
        lowCashRunwayWeeks: 2,
    }),
});

export type EconomyConfig = typeof economyConfig;
export type FacilityKey = 'arena' | 'training' | 'academy';
