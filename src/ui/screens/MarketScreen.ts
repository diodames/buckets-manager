import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { marketConfig } from '../../config/market';
import {
    acceptTransferOffer, bidOnPlayer, canNegotiate, counterTransferOffer, executePurchase,
    isMarketOpen, rejectTransferOffer, transferValue, unlistPlayer,
} from '../../core/market';
import type { Player, PlayerId } from '../../core/model/types';
import { overallRating } from '../../core/model/types';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { formatMoney, playerName, teamDef } from '../format';
import { ROLE } from '../theme';
import { ConfirmDialog } from './ConfirmDialog';
import { DataTable } from '../widgets/DataTable';
import { NegotiationScreen } from './NegotiationScreen';

type Tab = 'offers' | 'league' | 'freeAgents';
const TABS: Tab[] = ['offers', 'league', 'freeAgents'];

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
        } else {
            const players = Object.values(state.players)
                .filter((p): p is Player =>
                    this.tab === 'league'
                        ? p.teamId !== null && p.teamId !== state.userTeamId
                        : p.teamId === null && !state.market.youthProspects.some((y) => y.player.id === p.id),
                )
                .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes))
                .slice(0, 60);
            for (const player of players) {
                rows.push({ kind: 'player', playerId: player.id });
                cells.push({
                    cells: [
                        playerName(player),
                        player.position,
                        String(overallRating(player.attributes)),
                        player.teamId ? teamDef(player.teamId).abbr : t('market.freeAgent'),
                        formatMoney(transferValue(player, marketConfig, economy)),
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
            // Free agent: straight to personal terms.
            if (!canNegotiate(state, player, marketConfig)) {
                this.say(t('nego.locked'), ROLE.danger);
                return;
            }
            this.ctx.screens.push(
                new NegotiationScreen(this.ctx, player.id, 'freeAgent', (accepted) => {
                    this.say(accepted ? t('market.signed', { player: playerName(player) }) : t('market.noDeal'), accepted ? ROLE.success : ROLE.textDim);
                }),
            );
            return;
        }
        // League player: bid at the AI's expected price.
        const economy = this.ctx.config.economy;
        const bid = transferValue(player, marketConfig, economy);
        const result = bidOnPlayer(state, player.id, Math.min(bid, state.club.budget), marketConfig, economy);
        switch (result.status) {
            case 'agreed':
                this.startTerms(player.id, Math.min(bid, state.club.budget));
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
        this.rebuild();
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
        drawChrome(this.ctx, t('market.title'), [t('hint.pages'), t('hint.select'), t('hint.back')]);

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
        grid.putRight(grid.cols - 2, 2, isMarketOpen(state, marketConfig) ? ROLE.success : ROLE.danger,
            isMarketOpen(state, marketConfig)
                ? t('market.open', { round: marketConfig.transfers.deadlineRound })
                : t('market.deadlinePassed'));

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
