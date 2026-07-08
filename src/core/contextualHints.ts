import type { GameState } from './model/types';
import { isFreeAgentMarketOpen, isFullTransferMarketOpen } from './market';
import type { MarketConfig } from '../config/market';
import { pendingExternalOffers } from './breakthrough';
import { projectSeasonCashflow } from './cashflow';
import type { EconomyConfig } from '../config/economy';
import type { LeagueConfig } from '../config/league';

export type ContextualHintId =
    | 'financeWarning'
    | 'renewals'
    | 'youthIntake'
    | 'europeanFixture'
    | 'breakthroughOffer'
    | 'transferWindowClosed';

export function hasSeenHint(state: GameState, id: ContextualHintId): boolean {
    return (state.contextualHintsSeen ?? []).includes(id);
}

export function markHintSeen(state: GameState, id: ContextualHintId): void {
    state.contextualHintsSeen ??= [];
    if (!state.contextualHintsSeen.includes(id)) {
        state.contextualHintsSeen.push(id);
    }
}

/** Next contextual hint to show on the dashboard, if any. */
export function nextContextualHint(
    state: GameState,
    market: MarketConfig,
    economy: EconomyConfig,
    league: LeagueConfig,
): ContextualHintId | null {
    const projection = projectSeasonCashflow(state, economy, league);
    if (projection.warningTier !== 'green' && !hasSeenHint(state, 'financeWarning')) {
        return 'financeWarning';
    }
    if (state.currentRound >= 12 && !hasSeenHint(state, 'renewals')) {
        return 'renewals';
    }
    if (state.currentRound >= 14 && !state.market.youthIntakeDone && !hasSeenHint(state, 'youthIntake')) {
        return 'youthIntake';
    }
    const hasEuro = state.fixtures.some(
        (f) =>
            !f.result &&
            (f.competitionId === 'bcl' || f.competitionId === 'fec') &&
            (f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId),
    );
    if (hasEuro && !hasSeenHint(state, 'europeanFixture')) {
        return 'europeanFixture';
    }
    if (pendingExternalOffers(state).length > 0 && !hasSeenHint(state, 'breakthroughOffer')) {
        return 'breakthroughOffer';
    }
    if (
        !isFullTransferMarketOpen(state, market) &&
        isFreeAgentMarketOpen(state) &&
        state.currentRound > market.transfers.midWindowEndRound &&
        !hasSeenHint(state, 'transferWindowClosed')
    ) {
        return 'transferWindowClosed';
    }
    return null;
}
