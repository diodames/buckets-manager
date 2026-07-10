import { describe, expect, it } from 'vitest';
import {
    blendWithTeamTier,
    clubPrestigeBonus,
    compositeBoxScore,
    enforceTopClubOverallGap,
    NBL_RATING_BAND,
    overallsFromScores,
    percentileToOverall,
    potentialHeadroomForAge,
    tierFromOverall,
    tierMean,
    youthFillMean,
} from '../src/core/league/playerRating';

describe('playerRating', () => {
    it('maps tiers to the historical mean band', () => {
        expect(tierMean(1)).toBe(46);
        expect(tierMean(3)).toBe(58);
        expect(tierMean(5)).toBe(72);
        expect(tierMean(5, 6)).toBe(78);
    });

    it('round-trips overalls to nearby tiers', () => {
        expect(tierFromOverall(46)).toBe(1);
        expect(tierFromOverall(58)).toBe(3);
        expect(tierFromOverall(72)).toBe(5);
    });

    it('maps percentiles onto the NBL band', () => {
        expect(percentileToOverall(0, NBL_RATING_BAND)).toBe(NBL_RATING_BAND.min);
        expect(percentileToOverall(0.5, NBL_RATING_BAND)).toBe(NBL_RATING_BAND.p50);
        expect(percentileToOverall(1, NBL_RATING_BAND)).toBe(NBL_RATING_BAND.p99);
    });

    it('ranks box scores into ordered overalls', () => {
        const scores = [10, 30, 20, null];
        const overalls = overallsFromScores(scores, NBL_RATING_BAND);
        expect(overalls[3]).toBeNull();
        expect(overalls[0]!).toBeLessThan(overalls[2]!);
        expect(overalls[2]!).toBeLessThan(overalls[1]!);
    });

    it('soft-pulls outliers toward club tier', () => {
        const blended = blendWithTeamTier(74, 2);
        expect(blended).toBeLessThan(74);
        expect(blended).toBeGreaterThan(tierMean(2));
    });

    it('weights counting stats into a composite score', () => {
        const star = compositeBoxScore({ games: 40, mpg: 28, ppg: 18, rpg: 6, apg: 5, spg: 1.2, val: 20 });
        const bench = compositeBoxScore({ games: 40, mpg: 8, ppg: 3, rpg: 1, apg: 0.5, spg: 0.2, val: 2 });
        expect(star).toBeGreaterThan(bench);
    });

    it('gives young players more potential headroom than veterans', () => {
        const young = potentialHeadroomForAge(19);
        const vet = potentialHeadroomForAge(32);
        expect(young.lo).toBeGreaterThan(vet.hi);
    });

    it('gives tier-5 clubs a prestige bump and stronger youth fills', () => {
        expect(clubPrestigeBonus(5)).toBe(2);
        expect(clubPrestigeBonus(4)).toBe(1);
        expect(clubPrestigeBonus(3)).toBe(0);
        expect(clubPrestigeBonus(1)).toBe(-2);
        expect(youthFillMean(5)).toBe(64);
        expect(youthFillMean(3)).toBe(46);
        expect(youthFillMean(1)).toBe(40);
    });

    it('computes the bump needed to keep the top club ahead by a gap', () => {
        expect(enforceTopClubOverallGap({ NYM: 62, BRN: 63, HKR: 55 }, ['NYM'], 3)).toEqual({ NYM: 4 });
        expect(enforceTopClubOverallGap({ NYM: 70, BRN: 63 }, ['NYM'], 3)).toEqual({});
    });
});
