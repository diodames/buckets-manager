/** Maps real-player tiers / box-score signals onto the game's 1..99 rating band. */

/** Attribute mean by within-league player tier 1..5. Tier 3 ≈ league-average starter. */
export const TIER_MEANS = [46, 52, 58, 65, 72] as const;

export interface RatingBand {
    /** Overall at ~10th percentile of the competition. */
    p10: number;
    /** Overall at median. */
    p50: number;
    /** Overall at ~90th percentile. */
    p90: number;
    /** Overall at ~99th percentile / soft ceiling. */
    p99: number;
    min: number;
    max: number;
}

export const NBL_RATING_BAND: RatingBand = Object.freeze({
    p10: 48,
    p50: 58,
    p90: 70,
    p99: 75,
    min: 44,
    max: 76,
});

export const BCL_RATING_BAND: RatingBand = Object.freeze({
    p10: 52,
    p50: 64,
    p90: 74,
    p99: 80,
    min: 48,
    max: 82,
});

export const FEC_RATING_BAND: RatingBand = Object.freeze({
    p10: 48,
    p50: 58,
    p90: 68,
    p99: 74,
    min: 44,
    max: 76,
});

export interface BoxScoreAverages {
    games: number;
    mpg: number;
    ppg: number;
    rpg: number;
    apg: number;
    spg?: number;
    val?: number;
}

export function tierMean(tier: number, bonus = 0): number {
    const t = Math.max(1, Math.min(5, Math.round(tier)));
    return (TIER_MEANS[t - 1] as number) + bonus;
}

/** Discrete tier nearest to a continuous overall (keeps older tier consumers working). */
export function tierFromOverall(overall: number): number {
    let best = 1;
    let bestDist = Infinity;
    for (let t = 1; t <= 5; t++) {
        const dist = Math.abs(overall - (TIER_MEANS[t - 1] as number));
        if (dist < bestDist) {
            best = t;
            bestDist = dist;
        }
    }
    return best;
}

export function compositeBoxScore(stats: BoxScoreAverages): number {
    const stocks = stats.spg ?? 0;
    const val = stats.val ?? 0;
    return (
        stats.ppg +
        0.85 * stats.rpg +
        0.9 * stats.apg +
        0.15 * stats.mpg +
        0.55 * stocks +
        0.04 * val
    );
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** Map a 0..1 competition percentile onto the rating band. */
export function percentileToOverall(percentile: number, band: RatingBand): number {
    const p = Math.max(0, Math.min(1, percentile));
    let raw: number;
    if (p <= 0.1) {
        raw = lerp(band.min, band.p10, p / 0.1);
    } else if (p <= 0.5) {
        raw = lerp(band.p10, band.p50, (p - 0.1) / 0.4);
    } else if (p <= 0.9) {
        raw = lerp(band.p50, band.p90, (p - 0.5) / 0.4);
    } else {
        raw = lerp(band.p90, band.p99, (p - 0.9) / 0.1);
    }
    return Math.max(band.min, Math.min(band.max, Math.round(raw)));
}

/**
 * Rank scores within a competition and map to target overalls.
 * Returns null for entries without a usable score (caller should fall back to tier mean).
 */
export function overallsFromScores(scores: ReadonlyArray<number | null>, band: RatingBand): Array<number | null> {
    const ranked = scores
        .map((score, index) => ({ score, index }))
        .filter((row): row is { score: number; index: number } => row.score !== null && Number.isFinite(row.score));
    ranked.sort((a, b) => a.score - b.score);

    const out: Array<number | null> = scores.map(() => null);
    const n = ranked.length;
    if (n === 0) {
        return out;
    }
    for (let i = 0; i < n; i++) {
        const percentile = n === 1 ? 0.5 : i / (n - 1);
        out[ranked[i]!.index] = percentileToOverall(percentile, band);
    }
    return out;
}

/** Soft-pull a stats-derived overall toward the club's tier mean so outliers don't warp depth. */
export function blendWithTeamTier(statsOverall: number, teamTier: number, weight = 0.18): number {
    const teamMean = tierMean(teamTier);
    return Math.round(statsOverall * (1 - weight) + teamMean * weight);
}

/**
 * Prestige bump after stats mapping. Tier-5 (Nymburk) gets a modest lift so
 * the flagship stays ahead without inflating into the mid-high 60s.
 */
export function clubPrestigeBonus(teamTier: number): number {
    const t = Math.max(1, Math.min(5, Math.round(teamTier)));
    if (t >= 5) {
        return 2;
    }
    if (t === 4) {
        return 1;
    }
    if (t === 3) {
        return 0;
    }
    if (t === 2) {
        return -1;
    }
    return -2;
}

/** Youth / depth fill-in mean scaled to club strength (not a flat 44). */
export function youthFillMean(teamTier: number): number {
    return Math.max(40, tierMean(teamTier) - (teamTier >= 5 ? 8 : 12));
}

/**
 * Raise every player on the strongest club(s) so their mean targetOverall is
 * at least `gap` above the next club. Used to keep Nymburk clearly #1.
 */
export function enforceTopClubOverallGap(
    teamOveralls: Record<string, number>,
    topTeamIds: readonly string[],
    gap = 3,
): Record<string, number> {
    const topSet = new Set(topTeamIds);
    const topAvgs = topTeamIds.map((id) => teamOveralls[id]).filter((v): v is number => v != null);
    if (topAvgs.length === 0) {
        return {};
    }
    const topMean = topAvgs.reduce((a, b) => a + b, 0) / topAvgs.length;
    const second = Math.max(
        0,
        ...Object.entries(teamOveralls)
            .filter(([id]) => !topSet.has(id))
            .map(([, avg]) => avg),
    );
    const bump = Math.max(0, Math.ceil(second + gap - topMean));
    if (bump <= 0) {
        return {};
    }
    const out: Record<string, number> = {};
    for (const id of topTeamIds) {
        out[id] = bump;
    }
    return out;
}

export function clampOverall(value: number, band: RatingBand): number {
    return Math.max(band.min, Math.min(band.max, Math.round(value)));
}

export interface PotentialRoll {
    /** Inclusive low headroom added to overall. */
    lo: number;
    /** Inclusive high headroom added to overall. */
    hi: number;
}

export function potentialHeadroomForAge(age: number): PotentialRoll {
    if (age <= 20) {
        return { lo: 10, hi: 18 };
    }
    if (age <= 23) {
        return { lo: 6, hi: 14 };
    }
    if (age <= 26) {
        return { lo: 3, hi: 9 };
    }
    if (age <= 29) {
        return { lo: 0, hi: 4 };
    }
    return { lo: -2, hi: 1 };
}

/** Minutes bonus for young high-usage players (0..3). */
export function minutesPotentialBonus(age: number, mpg: number | null | undefined): number {
    if (mpg == null || age > 23) {
        return 0;
    }
    if (mpg >= 28) {
        return 3;
    }
    if (mpg >= 22) {
        return 2;
    }
    if (mpg >= 16) {
        return 1;
    }
    return 0;
}
