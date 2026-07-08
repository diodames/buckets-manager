import { describe, expect, it } from 'vitest';
import { bclValuationSeasonYear, bclValuationsData } from '../src/data/bclValuations';

describe('bclValuations', () => {
    it('ships reference data for all BCL-only clubs', () => {
        expect(bclValuationsData.length).toBe(612);
        expect(bclValuationSeasonYear).toBe(2026);
        const real = bclValuationsData.filter((row) => row.source === 'real');
        expect(real.length).toBe(45);
        expect(bclValuationsData[0]?.ovr).toBeGreaterThanOrEqual(68);
    });
});
