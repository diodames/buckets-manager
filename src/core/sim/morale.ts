import type { BalanceConfig } from '../../config/balance';

/** Effective skill multiplier from pre-match morale (0..100). */
export function moraleSkillMultiplier(morale: number, balance: BalanceConfig): number {
    const cfg = balance.energy;
    const moraleNorm = Math.max(0, Math.min(100, morale)) / 100;
    return cfg.moraleSkillMin + (cfg.moraleSkillMax - cfg.moraleSkillMin) * moraleNorm;
}
