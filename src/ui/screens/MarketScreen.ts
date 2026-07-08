import { BT } from 'blit386';
import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { marketConfig } from '../../config/market';
import {
    acceptTransferOffer, bidOnPlayer, canNegotiate, counterTransferOffer, executePurchase,
    isFreeAgentMarketOpen, isFullTransferMarketOpen, rejectTransferOffer, toggleWatchlist, transferAskingPrice, transferValue, unlistPlayer,
} from '../../core/market';
import type { Player, PlayerId } from '../../core/model/types';
import { overallRating } from '../../core/model/types';
import {
    canNegotiateScoutedFreeAgent,
    canScoutPlayer,
    displayedOverall,
    requestDeepReport,
    requestQuickReport,
} from '../../core/scouting';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { formatMoney, playerName, teamDef } from '../format';
import { ROLE } from '../theme';
import { ConfirmDialog } from './ConfirmDialog';
import { DataTable } from '../widgets/DataTable';
import { NegotiationScreen } from './NegotiationScreen';
import {
    DEFAULT_MARKET_FILTERS,
    cycleFilterPosition,
    type MarketFilters,
} from '../marketFilters';

type Tab = 'offers' | 'league' | 'freeAgents' | 'watchlist';
const TABS: Tab[] = ['offers', 'league', 'freeAgents', 'watchlist'];

interface Row {
    kind: 'offer' | 'listing' | 'player';
    playerId: PlayerId;
    offerId?: string;
}

/**
 * Transfer market (M18): incoming offers & own listings, league players to
 * bid on, and the free-agent pool. Tab switches with Left/Right on the header.
 */
export class MarketScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly table: DataTable;
    private tab: Tab = 'offers';
    private filters: MarketFilters = { ...DEFAULT_MARKET_FILTERS };
    private showFilters = false;
    private rows: Row[] = [];
    private message: { text: string; color: number } | null = null;
    // Pending purchase: agreed fee awaiting personal terms.
    private pendingFee: { playerId: PlayerId; fee: number } | null = null;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.table = new DataTable({ col: 2, row: 5, visibleRows: 15 }, true);
    }

    private get state() {
        const state = this.ctx.session?.state;
        if (!state) {
            throw new Error('MarketScreen: no session');
        }
        return state;
    }

    private switchTab(direction: 1 | -1): void {
        const index = (TABS.indexOf(this.tab) + direction + TABS.length) % TABS.length;
        this.tab = TABS[index] as Tab;
        this.table.selected = 0;
        this.message = null;
    }

    private rebuild(): void {
        const state = this.state;
        const rows: Row[] = [];
        const cells: Array<{ cells: string[]; color?: number }> = [];
        const economy = this.ctx.config.economy;

        if (this.tab === 'offers') {
            for (const offer of state.market.incomingOffers) {
                const player = state.players[offer.playerId];
                if (!player) {
                    continue;
                }
                rows.push({ kind: 'offer', playerId: offer.playerId, offerId: offer.id });
                cells.push({
                    cells: [
                        playerName(player),
                        player.position,
                        String(overallRating(player.attributes)),
                        t('market.offerFrom', { team: teamDef(offer.fromTeamId).abbr }),
                        formatMoney(offer.amount),
                        t('market.expires', { round: offer.expiresRound }),
                    ],
                    color: ROLE.gold,
                });
            }
            for (const listing of state.market.listings) {
                const player = state.players[listing.playerId];
                if (!player || state.market.incomingOffers.some((o) => o.playerId === listing.playerId)) {
                    continue;
                }
                rows.push({ kind: 'listing', playerId: listing.playerId });
                cells.push({
                    cells: [
                        playerName(player),
                        player.position,
                        String(overallRating(player.attributes)),
                        t('market.listed'),
                        listing.askingPrice ? formatMoney(listing.askingPrice) : '-',
                        '',
                    ],
                });
            }
        } else if (this.tab === 'watchlist') {
            const ids = state.market.watchlist ?? [];
            for (const playerId of ids) {
                const player = state.players[playerId];
                if (!player) {
                    continue;
                }
                rows.push({ kind: 'player', playerId: player.id });
                cells.push({
                    cells: [
                        playerName(player),
                        player.position,
                        String(overallRating(player.attributes)),
                        player.teamId ? teamDef(player.teamId).abbr : t('market.freeAgent'),
                        formatMoney(transferValue(player, marketConfig, economy, state)),
                        `${player.age}`,
                    ],
                    color: ROLE.accent,
                });
            }
        } else {
            const passesFilters = (p: Player): boolean => {
                if (this.filters.position !== 'all' && p.position !== this.filters.position) {
                    return false;
                }
                if (this.filters.maxAge !== null && p.age > this.filters.maxAge) {
                    return false;
                }
                const price = p.teamId && p.teamId !== state.userTeamId
                    ? transferAskingPrice(state, p, marketConfig, economy)
                    : transferValue(p, marketConfig, economy, state);
                if (this.filters.maxPrice !== null && price > this.filters.maxPrice) {
                    return false;
                }
                return true;
            };
            const players = Object.values(state.players)
                .filter((p): p is Player =>
                    this.tab === 'league'
                        ? p.teamId !== null && p.teamId !== state.userTeamId
                        : p.teamId === null && !state.market.youthProspects.some((y) => y.player.id === p.id),
                )
                .filter(passesFilters)
                .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes))
                .slice(0, 80);
            for (const player of players) {
                rows.push({ kind: 'player', playerId: player.id });
                const ovrCell = this.tab === 'freeAgents' && state.market.scoutedFreeAgents[player.id]
                    ? (state.market.scoutedFreeAgents[player.id]!.revealed
                        ? String(displayedOverall(state, player))
                        : `${state.market.scoutedFreeAgents[player.id]!.overallMin}-${state.market.scoutedFreeAgents[player.id]!.overallMax}`)
                    : String(overallRating(player.attributes));
                cells.push({
                    cells: [
                        playerName(player),
                        player.position,
                        ovrCell,
                        player.teamId ? teamDef(player.teamId).abbr : t('market.freeAgent'),
                        player.teamId && player.teamId !== state.userTeamId
                            ? formatMoney(transferAskingPrice(state, player, marketConfig, economy))
                            : formatMoney(transferValue(player, marketConfig, economy, state)),
                        `${player.age}`,
                    ],
                });
            }
        }

        this.rows = rows;
        this.table.setData(
            [
                { header: t('col.name'), width: 20 },
                { header: t('col.pos'), width: 3 },
                { header: t('col.ovr'), width: 3, align: 'right' },
                { header: t('col.team'), width: 14 },
                { header: t('col.price'), width: 8, align: 'right' },
                { header: t('col.age'), width: 6, align: 'right' },
            ],
            cells,
        );
    }

    private say(text: string, color: number): void {
        this.message = { text, color };
    }

    private openFreeAgentNegotiation(player: Player): void {
        const state = this.state;
        if (!canNegotiate(state, player, marketConfig)) {
            this.say(t('nego.locked'), ROLE.danger);
            return;
        }
        this.ctx.screens.push(
            new NegotiationScreen(this.ctx, player.id, 'freeAgent', (accepted) => {
                this.say(
                    accepted ? t('market.signed', { player: playerName(player) }) : t('market.noDeal'),
                    accepted ? ROLE.success : ROLE.textDim,
                );
            }),
        );
    }

    private tryNegotiateFreeAgent(player: Player): void {
        const state = this.state;
        if (!state.market.scoutingComplete
            && canScoutPlayer(state, player.id)
            && !canNegotiateScoutedFreeAgent(state, player.id)) {
            this.say(t('scouting.needReport'), ROLE.warning);
            return;
        }
        this.openFreeAgentNegotiation(player);
    }

    private handleFreeAgentActivate(player: Player): void {
        const state = this.state;
        const economy = this.ctx.config.economy;
        if (!state.market.scoutingComplete
            && canScoutPlayer(state, player.id)
            && !canNegotiateScoutedFreeAgent(state, player.id)) {
            const report = state.market.scoutedFreeAgents[player.id];
            if (!report) {
                this.say(t('scouting.needReport'), ROLE.warning);
                return;
            }
            if (report.tier === 'rumour') {
                if (requestQuickReport(state, player.id, economy)) {
                    this.say(t('scouting.quickDone', { player: playerName(player) }), ROLE.success);
                } else {
                    this.say(t('scouting.noBudget'), ROLE.warning);
                }
                return;
            }
            if (report.tier === 'quick') {
                if (requestDeepReport(state, player.id, economy)) {
                    this.say(t('scouting.deepDone', { player: playerName(player) }), ROLE.success);
                } else {
                    this.say(t('scouting.noBudget'), ROLE.warning);
                }
                return;
            }
            this.say(t('scouting.alreadyDeep'), ROLE.textDim);
            return;
        }
        this.openFreeAgentNegotiation(player);
    }

    private activate(row: Row): void {
        const state = this.state;
        const player = state.players[row.playerId];
        if (!player) {
            return;
        }
        if (row.kind === 'offer' && row.offerId) {
            this.handleOffer(row.offerId, player);
            return;
        }
        if (row.kind === 'listing') {
            this.ctx.screens.push(
                new ConfirmDialog(this.ctx, t('market.confirmUnlist'), (confirmed) => {
                    if (confirmed) {
                        unlistPlayer(state, player.id);
                    }
                }),
            );
            return;
        }
        if (player.teamId === null) {
            this.handleFreeAgentActivate(player);
            return;
        }
        // League player: bid at the AI's asking price.
        const economy = this.ctx.config.economy;
        const baseValue = transferValue(player, marketConfig, economy, state);
        const asking = transferAskingPrice(state, player, marketConfig, economy);
        const bid = Math.min(asking, state.club.budget);
        this.say(t('market.transferBreakdown', { base: formatMoney(baseValue), ask: formatMoney(asking) }), ROLE.textDim);
        const result = bidOnPlayer(state, player.id, bid, marketConfig, economy);
        switch (result.status) {
            case 'agreed':
                this.startTerms(player.id, bid);
                break;
            case 'counter':
                if (result.counterAmount) {
                    const counter = result.counterAmount;
                    this.ctx.screens.push(
                        new ConfirmDialog(this.ctx, t('market.counterAsk', { amount: formatMoney(counter) }), (confirmed) => {
                            if (confirmed) {
                                if (counter > state.club.budget) {
                                    this.say(t('market.cantAfford'), ROLE.danger);
                                } else {
                                    this.startTerms(player.id, counter);
                                }
                            }
                        }),
                    );
                }
                break;
            case 'notForSale':
                this.say(t('market.notForSale'), ROLE.danger);
                break;
            case 'marketClosed':
                this.say(t('market.closed'), ROLE.danger);
                break;
            case 'cantAfford':
                this.say(t('market.cantAfford'), ROLE.danger);
                break;
            default:
                this.say(t('market.bidRejected'), ROLE.warning);
                break;
        }
    }

    private startTerms(playerId: PlayerId, fee: number): void {
        this.pendingFee = { playerId, fee };
        this.ctx.screens.push(
            new NegotiationScreen(this.ctx, playerId, 'transferTerms', (accepted) => {
                const state = this.state;
                const player = state.players[playerId];
                if (accepted && this.pendingFee) {
                    const ok = executePurchase(state, playerId, this.pendingFee.fee, marketConfig, this.ctx.config.economy);
                    this.say(
                        ok && player ? t('market.bought', { player: playerName(player), amount: formatMoney(this.pendingFee.fee) }) : t('nego.rosterFull'),
                        ok ? ROLE.success : ROLE.danger,
                    );
                } else {
                    this.say(t('market.noDeal'), ROLE.textDim);
                }
                this.pendingFee = null;
            }, undefined, undefined, fee),
        );
    }

    private handleOffer(offerId: string, player: Player): void {
        const state = this.state;
        const offer = state.market.incomingOffers.find((o) => o.id === offerId);
        if (!offer) {
            return;
        }
        this.ctx.screens.push(
            new ConfirmDialog(this.ctx, t('market.confirmSale', { player: playerName(player), amount: formatMoney(offer.amount) }), (confirmed) => {
                if (confirmed) {
                    const ok = acceptTransferOffer(state, offerId, this.ctx.config.economy);
                    this.say(ok ? t('market.sold', { player: playerName(player), amount: formatMoney(offer.amount) }) : t('market.rosterMin'), ok ? ROLE.success : ROLE.danger);
                } else if (!offer.countered) {
                    // Counter once at +15%.
                    const counter = Math.round((offer.amount * 1.15) / 50_000) * 50_000;
                    const result = counterTransferOffer(state, offerId, counter, marketConfig, this.ctx.config.economy);
                    if (result === 'accepted') {
                        this.say(t('market.counterAccepted', { amount: formatMoney(counter) }), ROLE.success);
                    } else if (result === 'withdrawn') {
                        this.say(t('market.counterWithdrawn'), ROLE.warning);
                    }
                } else {
                    rejectTransferOffer(state, offerId, marketConfig, this.ctx.config.economy);
                }
            }),
        );
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        if (input.left) {
            this.switchTab(-1);
        }
        if (input.right) {
            this.switchTab(1);
        }
        if (BT.isKeyPressed('KeyF')) {
            this.showFilters = !this.showFilters;
        }
        if (BT.isKeyPressed('KeyW') && this.tab !== 'offers') {
            const row = this.rows[this.table.selected];
            if (row?.kind === 'player') {
                const added = toggleWatchlist(this.state, row.playerId);
                this.say(added ? t('market.watchlisted') : t('market.unwatchlisted'), ROLE.accent);
            }
        }
        if (this.showFilters && (input.left || input.right)) {
            const sel = this.table.selected;
            if (sel === 0) {
                this.filters.position = cycleFilterPosition(this.filters.position, input.right ? 1 : -1);
            }
        }
        this.rebuild();
        if (this.tab === 'freeAgents' && !this.state.market.scoutingComplete && BT.isKeyPressed('Space')) {
            const row = this.rows[this.table.selected];
            if (row?.kind === 'player') {
                const player = this.state.players[row.playerId];
                if (player?.teamId === null) {
                    this.tryNegotiateFreeAgent(player);
                    return;
                }
            }
        }
        const activated = this.table.update(input, this.ctx.grid);
        if (activated !== null) {
            const row = this.rows[activated];
            if (row) {
                this.activate(row);
            }
        }
    }

    render(): void {
        const state = this.state;
        const grid = this.ctx.grid;
        this.rebuild();
        const hints = [t('hint.pages'), t('hint.select'), t('hint.back')];
        if (this.tab === 'freeAgents' && !state.market.scoutingComplete) {
            hints.splice(2, 0, t('market.hintScout'), t('market.hintSign'));
        }
        drawChrome(this.ctx, t('market.title'), hints);

        let col = 2;
        for (const tab of TABS) {
            const label = t(`market.tab.${tab}` as Parameters<typeof t>[0]);
            const active = tab === this.tab;
            if (active) {
                grid.fillCells(col, 2, label.length + 2, 1, ROLE.highlight);
            }
            grid.put(col + 1, 2, active ? ROLE.highlightText : ROLE.textDim, label);
            col += label.length + 4;
        }
        const fullOpen = isFullTransferMarketOpen(state, marketConfig);
        const faOpen = isFreeAgentMarketOpen(state);
        const windowLabel = fullOpen
            ? t('market.openUntilPlayoffs')
            : faOpen
              ? t('market.deadlinePassed')
              : t('market.playoffsClosed');
        grid.putRight(grid.cols - 2, 2, fullOpen ? ROLE.success : faOpen ? ROLE.warning : ROLE.danger, windowLabel);
        if (this.tab !== 'offers' && this.tab !== 'watchlist') {
            grid.put(2, 3, ROLE.textDim, t('market.hintFilters'));
            if (this.showFilters) {
                grid.put(2, 4, ROLE.accent, [
                    t('market.filterPos', { pos: this.filters.position === 'all' ? t('market.filterAll') : this.filters.position }),
                    t('market.filterAge', { age: this.filters.maxAge ?? t('market.filterAll') }),
                    t('market.filterPrice', { price: this.filters.maxPrice ? formatMoney(this.filters.maxPrice) : t('market.filterAll') }),
                ].join('  '));
            }
        }

        if (this.rows.length === 0) {
            grid.put(3, 6, ROLE.textDim, t('market.empty'));
        } else {
            this.table.render(grid);
        }
        if (this.message) {
            grid.put(2, grid.rows - 3, this.message.color, this.message.text);
        }
    }
}
