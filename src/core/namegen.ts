import type { NamePools } from '../config/names';
import type { Rng } from './rng';

export interface GeneratedName {
    firstName: string;
    lastName: string;
}

/**
 * Draws a fictional name from the pools, avoiding exact duplicates within one
 * generation run (the `used` set is owned by the caller).
 */
export function generateName(rng: Rng, pools: NamePools, used: Set<string>): GeneratedName {
    const maxAttempts = 200;
    for (let i = 0; i < maxAttempts; i++) {
        const firstName = rng.pick(pools.firstNames);
        const lastName = rng.pick(pools.lastNames);
        const key = `${firstName} ${lastName}`;
        if (!used.has(key)) {
            used.add(key);
            return { firstName, lastName };
        }
    }
    throw new Error('generateName: name pools exhausted, add more names or fewer players');
}
