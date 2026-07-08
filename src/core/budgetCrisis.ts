import type { EconomyConfig } from '../config/economy';
import type { LeagueConfig } from '../config/league';
import { projectSeasonCashflow } from './cashflow';
import type { GameState } from './model/types';

/** Activate or clear transfer embargo and wage-arrears morale effects. */
export function tickBudgetCrisis(state: GameState, economy: EconomyConfig, league: LeagueConfig): boolean {
    const projection = projectSeasonCashflow(state, economy, league);
    const inCrisis = projection.warningTier === 'red' || state.club.budget < economy.financial.minEndBalance;
    const wasEmbargo = state.club.transferEmbargo ?? false;

    if (inCrisis) {
        if (!wasEmbargo) {
            state.club.transferEmbargo = true;
            const team = state.teams[state.userTeamId];
            for (const playerId of team?.playerIds ?? []) {
                const player = state.players[playerId];
                if (player) {
                    player.morale = Math.max(0, player.morale - 3);
                }
            }
            return true;
        }
        return false;
    }

    if (wasEmbargo && projection.projectedEndBalance >= economy.financial.minEndBalance) {
        state.club.transferEmbargo = false;
        return true;
    }
    return false;
}

export function isTransferEmbargoed(state: GameState): boolean {
    return state.club.transferEmbargo === true;
}
