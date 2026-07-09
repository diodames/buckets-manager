import { describe, expect, it } from 'vitest';
import { bclConfig } from '../src/config/bcl';
import { createGroupFixtures } from '../src/core/bcl/index';
import type { BclGroup } from '../src/core/model/types';

const TEAMS = ['A', 'B', 'C', 'D'] as const;
const WEEKS = bclConfig.groupWeeks.slice(0, 6);

function makeGroup(): BclGroup {
    return { id: 'G1', teamIds: [...TEAMS], fixtures: [] };
}

describe('createGroupFixtures (4-team double round-robin)', () => {
    const group = makeGroup();
    const fixtures = createGroupFixtures([group], WEEKS);

    it('creates 12 fixtures (6 games per team)', () => {
        expect(fixtures).toHaveLength(12);
        for (const team of TEAMS) {
            const played = fixtures.filter(
                (f) => f.homeTeamId === team || f.awayTeamId === team,
            );
            expect(played).toHaveLength(6);
        }
    });

    it('uses 6 distinct calendar weeks', () => {
        const weeks = [...new Set(fixtures.map((f) => f.week))].sort((a, b) => a! - b!);
        expect(weeks).toHaveLength(6);
        expect(weeks).toEqual([...WEEKS]);
    });

    it('gives every team exactly one match per week', () => {
        for (const week of WEEKS) {
            const weekFixtures = fixtures.filter((f) => f.week === week);
            expect(weekFixtures).toHaveLength(2);
            const playing = weekFixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]);
            expect(new Set(playing).size).toBe(4);
        }
    });

    it('does not schedule both legs of a pairing in the same week', () => {
        for (const week of WEEKS) {
            const weekFixtures = fixtures.filter((f) => f.week === week);
            const pairs = new Set(
                weekFixtures.map((f) => [f.homeTeamId, f.awayTeamId].sort().join('-')),
            );
            expect(pairs.size).toBe(weekFixtures.length);
        }
    });

    it('plays every directed pairing exactly once', () => {
        const pairCounts = new Map<string, number>();
        for (const f of fixtures) {
            expect(f.homeTeamId).not.toBe(f.awayTeamId);
            const key = `${f.homeTeamId}-${f.awayTeamId}`;
            pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
        expect(pairCounts.size).toBe(4 * 3);
        for (const count of pairCounts.values()) {
            expect(count).toBe(1);
        }
    });

    it('gives every team 3 home and 3 away games', () => {
        for (const team of TEAMS) {
            expect(fixtures.filter((f) => f.homeTeamId === team)).toHaveLength(3);
            expect(fixtures.filter((f) => f.awayTeamId === team)).toHaveLength(3);
        }
    });

    it('has unique fixture ids', () => {
        expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length);
    });
});
