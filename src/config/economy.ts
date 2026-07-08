// Club economy tuning: all amounts in CZK. The user manages one club's
// books; AI clubs do not keep ledgers.
export const economyConfig = Object.freeze({
    startingBudget: 9_000_000,
    // Starting cash by club tier 1..5 (weaker clubs begin with less).
    startingBudgetByTier: Object.freeze([6_500_000, 8_000_000, 9_000_000, 10_500_000, 12_000_000]),
    // Player salary per season derived from overall rating:
    // base + (overall - 50) * perPoint (floored at min).
    salary: Object.freeze({
        base: 600_000,
        perPoint: 40_000,
        min: 300_000,
    }),
    tickets: Object.freeze({
        defaultPrice: 220,
        minPrice: 80,
        maxPrice: 600,
        priceStep: 10,
        referencePrice: 220,
        incomeScale: 0.35,
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
        homeAdvantageMinMult: 0.2,
        homeAdvantageFromPrice: false,
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
        // Per-round maintenance per facility level (sum of levels * this).
        maintenancePerLevelPerRound: 25_000,
        // Rounds until upgrade benefits fully apply (index = target level 1..5).
        upgradeRounds: Object.freeze({
            arena: Object.freeze([0, 5, 6, 7, 9]),
            training: Object.freeze([0, 4, 5, 6, 8]),
            academy: Object.freeze([0, 4, 5, 6, 8]),
        }),
    }),
    // NBL playoff prize money (CZK), paid once at season end.
    playoffPrizes: Object.freeze({
        champion: 800_000,
        finalist: 400_000,
        semifinal: 200_000,
        quarterfinal: 100_000,
        playoffs: 50_000,
    }),
    // NBL regular-season table prize money (CZK), paid once at season end (in addition to playoff prizes).
    leaguePrizesByRank: Object.freeze([
        { maxRank: 1, prize: 1_200_000 },
        { maxRank: 3, prize: 800_000 },
        { maxRank: 6, prize: 500_000 },
        { maxRank: 9, prize: 300_000 },
        { maxRank: 11, prize: 150_000 },
        { maxRank: 12, prize: 100_000 },
    ]),
    sponsors: Object.freeze({
        slots: 1,
        // Per-round base payment range by deal tier 1..5 (success bonuses are separate).
        perRoundByTier: Object.freeze([35_000, 60_000, 90_000, 130_000, 180_000]),
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
            { id: 'safe', promisedMaxRank: 10, tier: 1, signingBonus: 850_000, bonusAmount: 350_000 },
            { id: 'standard', promisedMaxRank: 8, tier: 2, signingBonus: 425_000, bonusAmount: 1_000_000 },
            { id: 'bold', promisedMaxRank: 1, tier: 3, signingBonus: 125_000, bonusAmount: 2_500_000 },
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
    // Board wage budget and cashflow warning thresholds (Football Manager-style).
    financial: Object.freeze({
        wageBudgetPct: 0.65,
        minEndBalance: 0,
        lowCashRunwayWeeks: 2,
    }),
});

export type EconomyConfig = typeof economyConfig;
export type FacilityKey = 'arena' | 'training' | 'academy';
