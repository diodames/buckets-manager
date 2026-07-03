// Deterministic seeded RNG. Everything random in the game flows through this
// module so a saved seed reproduces matches, seasons, and generated leagues.

export interface Rng {
    /** Uniform float in [0, 1). */
    next(): number;
    /** Uniform integer in [min, max] inclusive. */
    int(min: number, max: number): number;
    /** True with probability p. */
    chance(p: number): boolean;
    /** Random element of a non-empty array. */
    pick<T>(items: readonly T[]): T;
    /** Weighted index pick; weights must be non-negative with a positive sum. */
    weightedIndex(weights: readonly number[]): number;
    /** In-place Fisher-Yates shuffle; returns the same array. */
    shuffle<T>(items: T[]): T[];
    /** Independent child stream derived from this seed and a label. */
    fork(label: string): Rng;
}

/** FNV-1a 32-bit string hash, used to derive fork seeds from labels. */
export function hashString(text: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/** mulberry32 PRNG: tiny, fast, and good enough for game simulation. */
export function createRng(seed: number): Rng {
    let state = seed >>> 0;

    const next = (): number => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const rng: Rng = {
        next,
        int(min, max) {
            if (max < min) {
                throw new Error(`Rng.int: max (${max}) < min (${min})`);
            }
            return min + Math.floor(next() * (max - min + 1));
        },
        chance(p) {
            return next() < p;
        },
        pick(items) {
            if (items.length === 0) {
                throw new Error('Rng.pick: empty array');
            }
            const item = items[Math.floor(next() * items.length)];
            return item as (typeof items)[number];
        },
        weightedIndex(weights) {
            let total = 0;
            for (const w of weights) {
                if (w < 0) {
                    throw new Error('Rng.weightedIndex: negative weight');
                }
                total += w;
            }
            if (total <= 0) {
                throw new Error('Rng.weightedIndex: weights sum to zero');
            }
            let roll = next() * total;
            for (let i = 0; i < weights.length; i++) {
                roll -= weights[i] ?? 0;
                if (roll < 0) {
                    return i;
                }
            }
            return weights.length - 1;
        },
        shuffle(items) {
            for (let i = items.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1));
                const a = items[i] as (typeof items)[number];
                items[i] = items[j] as (typeof items)[number];
                items[j] = a;
            }
            return items;
        },
        fork(label) {
            return createRng((seed ^ hashString(label)) >>> 0);
        },
    };
    return rng;
}
