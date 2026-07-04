// Club economy tuning: all amounts in CZK. The user manages one club's
// books; AI clubs do not keep ledgers.
export const economyConfig = Object.freeze({
    startingBudget: 8_000_000,
    // Player salary per season derived from overall rating:
    // base + (overall - 50) * perPoint (floored at min).
    salary: Object.freeze({
        base: 600_000,
        perPoint: 40_000,
        min: 300_000,
    }),
    tickets: Object.freeze({
        price: 220,
        // Attendance share of capacity: base + fan-support weight; clamped.
        baseAttendance: 0.35,
        fanSupportWeight: 0.55,
        minAttendance: 0.15,
        maxAttendance: 1.0,
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
            training: Object.freeze([0, 2_500_000, 5_000_000, 10_000_000, 18_000_000]),
            academy: Object.freeze([0, 1_500_000, 3_500_000, 7_000_000, 12_000_000]),
        }),
        // Per-round maintenance per facility level (sum of levels * this).
        maintenancePerLevelPerRound: 25_000,
    }),
    sponsors: Object.freeze({
        slots: 3,
        // Per-round payment range by deal tier 1..5.
        perRoundByTier: Object.freeze([60_000, 110_000, 180_000, 280_000, 420_000]),
        // Relationship 0..100 scales payment [minMult..maxMult].
        relationMinMult: 0.8,
        relationMaxMult: 1.25,
        startRelationship: 55,
        // Relationship drift per result.
        winDrift: 1.5,
        lossDrift: -1,
        // Deal ends early when relationship falls below this at round end.
        terminateBelow: 20,
        // New offer generation: chance per round when a slot is free.
        offerChancePerRound: 0.35,
        offerSeasonsMin: 1,
        offerSeasonsMax: 2,
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
});

export type EconomyConfig = typeof economyConfig;
export type FacilityKey = 'arena' | 'training' | 'academy';
