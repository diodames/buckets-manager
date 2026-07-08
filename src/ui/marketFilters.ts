import type { Position } from '../core/model/types';
import { POSITIONS } from '../core/model/types';

export interface MarketFilters {
    position: Position | 'all';
    maxAge: number | null;
    maxPrice: number | null;
    watchlistOnly: boolean;
}

export const DEFAULT_MARKET_FILTERS: MarketFilters = {
    position: 'all',
    maxAge: null,
    maxPrice: null,
    watchlistOnly: false,
};

export function cycleFilterPosition(current: Position | 'all', dir: 1 | -1): Position | 'all' {
    const options: Array<Position | 'all'> = ['all', ...POSITIONS];
    const idx = (options.indexOf(current) + dir + options.length) % options.length;
    return options[idx] as Position | 'all';
}

export function cycleFilterMaxAge(current: number | null): number | null {
    const steps = [null, 23, 27, 30, 35] as const;
    const idx = steps.indexOf(current as (typeof steps)[number]);
    return steps[(idx + 1) % steps.length] ?? null;
}

export function cycleFilterMaxPrice(current: number | null): number | null {
    const steps = [null, 2_000_000, 5_000_000, 10_000_000, 20_000_000] as const;
    const idx = steps.indexOf(current as (typeof steps)[number]);
    return steps[(idx + 1) % steps.length] ?? null;
}
