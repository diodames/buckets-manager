import { describe, expect, it } from 'vitest';
import { economyConfig } from '../src/config/economy';
import { baseSalary } from '../src/core/market';

function withinPct(actual: number, target: number, pct: number): boolean {
    const delta = target * pct;
    return actual >= target - delta && actual <= target + delta;
}

describe('real-world salary anchors', () => {
    it('maps key overall bands to NBL-realistic season salaries', () => {
        expect(withinPct(baseSalary(65, economyConfig), 1_120_000, 0.1)).toBe(true);
        expect(withinPct(baseSalary(75, economyConfig), 1_600_000, 0.1)).toBe(true);
        expect(withinPct(baseSalary(85, economyConfig), 2_350_000, 0.1)).toBe(true);
    });

    it('implies plausible monthly pay at 75 OVR', () => {
        const monthly = Math.round(baseSalary(75, economyConfig) / 9);
        expect(monthly).toBeGreaterThanOrEqual(150_000);
        expect(monthly).toBeLessThanOrEqual(200_000);
    });
});
