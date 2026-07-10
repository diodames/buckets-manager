import type { RealPlayerDef } from './league';
import { tierMean } from '../core/league/playerRating';

/** A real player who enters the free-agent pool during a season. */
export interface SeasonSigningDef extends RealPlayerDef {
    /** Round when the player appears on the market (1 = season start). */
    availableFromRound: number;
    /** Club that signed this player in real life; nudges AI interest. */
    likelyTeamId?: string;
    /** Optional scout presentation tier for marquee summer targets. */
    scoutTier?: 'headline' | 'veteran' | 'journeyman';
}

/** A rostered player who leaves mid-season and returns to the FA pool. */
export interface SeasonDepartureDef {
    teamId: string;
    firstName: string;
    lastName: string;
    /** Round when the player is released to free agency. */
    departureRound: number;
}

export interface SeasonMarketConfig {
    seasonYear: number;
    /** Available on the transfer market from round 1. */
    openingFreeAgents: readonly SeasonSigningDef[];
    /** Join the market when the given round begins. */
    timedSignings: readonly SeasonSigningDef[];
    /** Leave their club when the given round begins. */
    departures: readonly SeasonDepartureDef[];
    /** Random Czech journeymen added alongside real names. */
    fictionalPadding: number;
}

const s = (
    firstName: string,
    lastName: string,
    position: SeasonSigningDef['position'],
    tier: number,
    availableFromRound: number,
    likelyTeamId: string | null = null,
    heightCm: number | null = null,
    born: number | null = null,
    nationality: string | null = null,
): SeasonSigningDef => {
    const def: SeasonSigningDef = {
        firstName,
        lastName,
        position,
        tier,
        targetOverall: tierMean(tier),
        availableFromRound,
        heightCm,
        born,
        nationality,
    };
    if (likelyTeamId) {
        def.likelyTeamId = likelyTeamId;
    }
    return def;
};

// Maxa NBL 2025/26 uses a playoff-era opening snapshot (see rosterAdjustments.ts).
// Mid-season arrivals/departures are absorbed into opening rosters, so timed
// signings and departures stay empty to avoid double-appearing players.
export const seasonMarket2025 = Object.freeze<SeasonMarketConfig>({
    seasonYear: 2025,
    openingFreeAgents: Object.freeze([
        // Between clubs / not on a playoff opening roster.
        s('Petr', 'Šafarčík', 'SG', 3, 1, null, 190, 1994, 'CZE'),
    ]),
    timedSignings: Object.freeze([]),
    departures: Object.freeze<SeasonDepartureDef[]>([]),
    fictionalPadding: 4,
});

// Maxa NBL 2027/28: Czech veterans returning from abroad at season start.
export const seasonMarket2027 = Object.freeze<SeasonMarketConfig>({
    seasonYear: 2027,
    openingFreeAgents: Object.freeze([
        s('Patrik', 'Auda', 'C', 4, 1, 'USK', 207, 1990, 'CZE'),
        s('Tomáš', 'Kyzlink', 'PG', 4, 1, null, 186, 1993, 'CZE'),
        s('Ondřej', 'Balvín', 'C', 4, 1, null, 217, 1992, 'CZE'),
    ]),
    timedSignings: Object.freeze([]),
    departures: Object.freeze<SeasonDepartureDef[]>([]),
    fictionalPadding: 4,
});

// Maxa NBL 2028/29: headline Czech returnees after Satoransky's Barca exit.
export const seasonMarket2028 = Object.freeze<SeasonMarketConfig>({
    seasonYear: 2028,
    openingFreeAgents: Object.freeze([
        s('Tomáš', 'Satoranský', 'PG', 5, 1, 'NYM', 201, 1991, 'CZE'),
        s('Martin', 'Peterka', 'PF', 4, 1, 'NYM', 206, 1995, 'CZE'),
    ]),
    timedSignings: Object.freeze([]),
    departures: Object.freeze<SeasonDepartureDef[]>([]),
    fictionalPadding: 4,
});

const seasonMarkets: readonly SeasonMarketConfig[] = [seasonMarket2025, seasonMarket2027, seasonMarket2028];

export function seasonMarketForYear(seasonYear: number): SeasonMarketConfig | null {
    return seasonMarkets.find((m) => m.seasonYear === seasonYear) ?? null;
}

export type SeasonSigningsConfig = typeof seasonMarket2025;
