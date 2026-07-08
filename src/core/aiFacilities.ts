import type { EconomyConfig, FacilityKey } from '../config/economy';
import type { LeagueConfig } from '../config/league';
import { aiFacilityMaintenancePerRound, teamSeasonWageBill, teamTier } from './economy';
import type { GameState, TeamFinance } from './model/types';

const DEFAULT_FACILITIES: Record<FacilityKey, number> = { arena: 1, training: 1, academy: 1 };

export function aiFacilities(finance: TeamFinance): Record<FacilityKey, number> {
    return finance.facilities ?? DEFAULT_FACILITIES;
}

export function aiTrainingDevMultiplier(finance: TeamFinance, economy: EconomyConfig): number {
    const level = aiFacilities(finance).training;
    const table = economy.facilities.trainingDevMultiplier;
    return table[Math.max(0, Math.min(table.length - 1, level - 1))] ?? 1;
}

/** Solvent tier 3-5 AI clubs slowly invest in training facilities. */
export function tickAiFacilities(state: GameState, economy: EconomyConfig, league: LeagueConfig): void {
    for (const teamDef of league.teams) {
        if (teamDef.id === state.userTeamId) {
            continue;
        }
        const finance = state.nblFinances[teamDef.id];
        if (!finance) {
            continue;
        }
        finance.facilities ??= { ...DEFAULT_FACILITIES };
        finance.roundsSinceFacilityUpgrade = (finance.roundsSinceFacilityUpgrade ?? 0) + 1;

        const tier = teamTier(teamDef.id, league);
        if (tier < 3) {
            continue;
        }
        const trainingLevel = finance.facilities.training;
        const maxLevel = economy.facilities.maxLevel;
        const trainingCap = tier >= 5 ? Math.min(4, maxLevel) : tier >= 4 ? Math.min(3, maxLevel) : Math.min(2, maxLevel);
        if (trainingLevel >= trainingCap) {
            continue;
        }
        const payroll = teamSeasonWageBill(state, teamDef.id, economy);
        const maintenance = aiFacilityMaintenancePerRound(economy);
        const reserve = payroll * 0.5 + maintenance * 4;
        if (finance.budget < reserve) {
            continue;
        }
        const upgradeInterval = tier >= 5 ? 36 : tier >= 4 ? 66 : 80;
        if ((finance.roundsSinceFacilityUpgrade ?? 0) < upgradeInterval) {
            continue;
        }
        const targetLevel = trainingLevel + 1;
        const costTable = economy.facilities.upgradeCost.training;
        const cost = costTable[targetLevel] ?? 0;
        if (cost <= 0 || finance.budget < cost + reserve) {
            continue;
        }
        finance.budget -= cost;
        finance.facilities.training = targetLevel;
        finance.roundsSinceFacilityUpgrade = 0;

        if (tier >= 5 && finance.facilities.arena < 2 && finance.budget > cost + reserve * 1.5) {
            const arenaCost = economy.facilities.upgradeCost.arena[2] ?? 0;
            if (arenaCost > 0 && finance.budget >= arenaCost) {
                finance.budget -= arenaCost;
                finance.facilities.arena = 2;
            }
        }
    }
}

export function initAiFacilities(state: GameState, league: LeagueConfig): void {
    for (const teamDef of league.teams) {
        if (teamDef.id === state.userTeamId) {
            continue;
        }
        const finance = state.nblFinances[teamDef.id];
        if (finance && !finance.facilities) {
            finance.facilities = { ...DEFAULT_FACILITIES };
            finance.roundsSinceFacilityUpgrade = 0;
        }
    }
}
