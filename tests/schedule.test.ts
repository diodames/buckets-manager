import { describe, expect, it } from 'vitest';
import { createSchedule, totalRounds } from '../src/core/league/schedule';

const TEAMS_12 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

describe('createSchedule (double round-robin, 12 teams)', () => {
    const fixtures = createSchedule(TEAMS_12, 2);

    it('has 22 rounds of 6 matches each', () => {
        expect(totalRounds(12, 2)).toBe(22);
        expect(fixtures).toHaveLength(132);
        for (let round = 1; round <= 22; round++) {
            expect(fixtures.filter((f) => f.round === round)).toHaveLength(6);
        }
    });

    it('gives every team exactly one match per round', () => {
        for (let round = 1; round <= 22; round++) {
            const playing = fixtures.filter((f) => f.round === round).flatMap((f) => [f.homeTeamId, f.awayTeamId]);
            expect(new Set(playing).size).toBe(12);
        }
    });

    it('plays every pairing exactly twice with venues swapped', () => {
        const pairCounts = new Map<string, number>();
        for (const f of fixtures) {
            expect(f.homeTeamId).not.toBe(f.awayTeamId);
            const key = `${f.homeTeamId}-${f.awayTeamId}`;
            pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
        // Directed pairs: each ordered pair appears exactly once.
        expect(pairCounts.size).toBe(12 * 11);
        for (const count of pairCounts.values()) {
            expect(count).toBe(1);
        }
    });

    it('gives every team 11 home and 11 away games', () => {
        for (const team of TEAMS_12) {
            expect(fixtures.filter((f) => f.homeTeamId === team)).toHaveLength(11);
            expect(fixtures.filter((f) => f.awayTeamId === team)).toHaveLength(11);
        }
    });

    it('has unique fixture ids', () => {
        expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length);
    });

    it('works for any even team count', () => {
        for (const n of [2, 4, 6, 8, 10]) {
            const ids = Array.from({ length: n }, (_, i) => `T${i}`);
            const result = createSchedule(ids, 2);
            expect(result).toHaveLength(n * (n - 1));
        }
    });

    it('rejects odd or too-small team counts', () => {
        expect(() => createSchedule(['A'], 2)).toThrow();
        expect(() => createSchedule(['A', 'B', 'C'], 2)).toThrow();
        expect(() => createSchedule(TEAMS_12, 0)).toThrow();
    });
});
