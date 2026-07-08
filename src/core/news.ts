import { financeWarningTier } from './cashflow';
import { pendingExternalOffers } from './breakthrough';
import { isFreeAgentMarketOpen, isFullTransferMarketOpen } from './market';
import type { EconomyConfig } from '../config/economy';
import type { LeagueConfig } from '../config/league';
import type { MarketConfig } from '../config/market';
import type { GameState } from './model/types';
import { marketConfig } from '../config/market';

export type NewsItemId =
    | 'expiringContracts'
    | 'incomingOffers'
    | 'externalOffers'
    | 'financeWarning'
    | 'injuryReturns'
    | 'transferWindow'
    | 'youthIntake'
    | 'negotiationLocked';

export interface NewsItem {
    id: NewsItemId;
    /** i18n key */
    labelKey: string;
    /** Screen/menu to open when selected */
    action: 'roster' | 'market' | 'finances' | 'externalOffer' | 'youthIntake' | 'none';
    priority: number;
}

/** Dashboard inbox headlines sorted by priority. */
export function buildNewsItems(
    state: GameState,
    economy: EconomyConfig,
    league: LeagueConfig,
    market: MarketConfig = marketConfig,
): NewsItem[] {
    const items: NewsItem[] = [];
    const team = state.teams[state.userTeamId];

    if (state.currentRound >= market.contracts.renewalsOpenFromRound && team) {
        const expiring = team.playerIds.filter((id) => {
            const p = state.players[id];
            return p?.contract && p.contract.yearsLeft <= 1;
        });
        if (expiring.length > 0) {
            items.push({
                id: 'expiringContracts',
                labelKey: 'news.expiringContracts',
                action: 'roster',
                priority: 80,
            });
        }
    }

    if (state.market.incomingOffers.length > 0) {
        items.push({
            id: 'incomingOffers',
            labelKey: 'news.incomingOffers',
            action: 'market',
            priority: 90,
        });
    }

    if (pendingExternalOffers(state).length > 0) {
        items.push({
            id: 'externalOffers',
            labelKey: 'news.externalOffers',
            action: 'externalOffer',
            priority: 95,
        });
    }

    const finTier = financeWarningTier(state, economy, league);
    if (finTier === 'yellow' || finTier === 'red') {
        items.push({
            id: 'financeWarning',
            labelKey: finTier === 'red' ? 'news.financeRed' : 'news.financeYellow',
            action: 'finances',
            priority: finTier === 'red' ? 100 : 70,
        });
    }

    if (team) {
        const returning = team.playerIds.filter((id) => {
            const p = state.players[id];
            return p?.injury && p.injury.roundsOut <= 1;
        });
        if (returning.length > 0) {
            items.push({
                id: 'injuryReturns',
                labelKey: 'news.injuryReturns',
                action: 'roster',
                priority: 50,
            });
        }
    }

    const transferLabel = isFullTransferMarketOpen(state, market)
        ? 'news.transferWindowOpen'
        : isFreeAgentMarketOpen(state)
          ? 'news.transferWindowFaOnly'
          : 'news.transferWindowClosed';
    items.push({
        id: 'transferWindow',
        labelKey: transferLabel,
        action: 'market',
        priority: 30,
    });

    if (!state.market.youthIntakeDone && state.currentRound >= 14) {
        items.push({
            id: 'youthIntake',
            labelKey: 'news.youthIntake',
            action: 'youthIntake',
            priority: 75,
        });
    }

    return items.sort((a, b) => b.priority - a.priority).slice(0, 6);
}
