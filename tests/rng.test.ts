import { describe, expect, it } from 'vitest';
import { createRng, hashString } from '../src/core/rng';

describe('rng', () => {
    it('is deterministic for the same seed', () => {
        const a = createRng(12345);
        const b = createRng(12345);
        for (let i = 0; i < 100; i++) {
            expect(a.next()).toBe(b.next());
        }
    });

    it('produces different streams for different seeds', () => {
        const a = createRng(1);
        const b = createRng(2);
        const sameCount = Array.from({ length: 50 }, () => (a.next() === b.next() ? 1 : 0)).reduce<number>(
            (s, v) => s + v,
            0,
        );
        expect(sameCount).toBeLessThan(5);
    });

    it('int stays within inclusive bounds and covers them', () => {
        const rng = createRng(7);
        const seen = new Set<number>();
        for (let i = 0; i < 2000; i++) {
            const value = rng.int(1, 6);
            expect(value).toBeGreaterThanOrEqual(1);
            expect(value).toBeLessThanOrEqual(6);
            seen.add(value);
        }
        expect(seen.size).toBe(6);
    });

    it('forks are independent of parent consumption and label-stable', () => {
        const parent1 = createRng(42);
        const fork1 = parent1.fork('match:X');
        parent1.next();
        parent1.next();
        const parent2 = createRng(42);
        const fork2 = parent2.fork('match:X');
        expect(fork1.next()).toBe(fork2.next());
        expect(createRng(42).fork('match:Y').next()).not.toBe(createRng(42).fork('match:X').next());
    });

    it('weightedIndex respects weights', () => {
        const rng = createRng(9);
        let heavy = 0;
        for (let i = 0; i < 1000; i++) {
            if (rng.weightedIndex([1, 9]) === 1) {
                heavy++;
            }
        }
        expect(heavy).toBeGreaterThan(800);
        expect(heavy).toBeLessThan(980);
    });

    it('hashString is stable and spreads values', () => {
        expect(hashString('abc')).toBe(hashString('abc'));
        expect(hashString('abc')).not.toBe(hashString('abd'));
    });

    it('throws on invalid weighted input', () => {
        const rng = createRng(1);
        expect(() => rng.weightedIndex([0, 0])).toThrow();
        expect(() => rng.weightedIndex([-1, 2])).toThrow();
        expect(() => rng.pick([])).toThrow();
    });
});
