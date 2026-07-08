import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import {
    acceptExternalOffer, beginExternalRetention, pendingExternalOffers, rejectExternalOffer,
} from '../../core/breakthrough';
import type { ExternalOffer } from '../../core/model/types';
import { overallRating } from '../../core/model/types';
import { createRng } from '../../core/rng';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { formatMoney, playerName } from '../format';
import { ROLE } from '../theme';
import { MenuList } from '../widgets/MenuList';
import { ConfirmDialog } from './ConfirmDialog';
import { NegotiationScreen } from './NegotiationScreen';

/** Offseason screen for BCL / Euroleague breakthrough transfer bids. */
export class ExternalOfferScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly onDone: () => void;
    private readonly menu: MenuList;
    private offers: ExternalOffer[] = [];
    private selected = 0;
    private message: { text: string; color: number } | null = null;

    constructor(ctx: AppContext, onDone: () => void) {
        this.ctx = ctx;
        this.onDone = onDone;
        this.menu = new MenuList([], { col: 3, row: 18, width: 62 });
        this.refresh();
    }

    private refresh(): void {
        const state = this.ctx.session?.state;
        this.offers = state ? pendingExternalOffers(state) : [];
        this.selected = Math.min(this.selected, Math.max(0, this.offers.length - 1));
        this.menu.items = [
            { id: 'accept', label: t('external.accept') },
            { id: 'retain', label: t('external.retain') },
            { id: 'reject', label: t('external.reject') },
            { id: 'later', label: t('external.later') },
        ];
        if (this.offers.length === 0) {
            this.finish();
        }
    }

    private finish(): void {
        this.ctx.screens.pop();
        this.onDone();
    }

    private currentOffer(): ExternalOffer | null {
        return this.offers[this.selected] ?? null;
    }

    update(input: UiInputFrame): void {
        if (this.offers.length === 0) {
            return;
        }
        if (input.cancel) {
            this.finish();
            return;
        }
        if ((input.left || input.right) && this.offers.length > 1) {
            const dir = input.right ? 1 : -1;
            this.selected = (this.selected + dir + this.offers.length) % this.offers.length;
            this.message = null;
            return;
        }
        const action = this.menu.update(input, this.ctx.grid);
        const offer = this.currentOffer();
        const state = this.ctx.session?.state;
        if (!action || !offer || !state) {
            return;
        }
        if (action === 'later') {
            this.finish();
            return;
        }
        const player = state.players[offer.playerId];
        if (!player) {
            this.refresh();
            return;
        }
        if (action === 'accept') {
            this.ctx.screens.push(new ConfirmDialog(this.ctx, t('external.confirmAccept', {
                player: playerName(player),
                fee: formatMoney(offer.transferFee),
                club: offer.clubName,
            }), (ok) => {
                if (ok && acceptExternalOffer(state, offer.id, this.ctx.config.economy, this.ctx.config.externalOffers, this.ctx.config.market)) {
                    this.message = { text: t('external.accepted', { player: playerName(player), amount: formatMoney(offer.transferFee) }), color: ROLE.success };
                    this.refresh();
                }
            }));
        } else if (action === 'reject') {
            const rng = createRng(state.masterSeed).fork(`ext-reject:${offer.id}`);
            rejectExternalOffer(state, offer.id, this.ctx.config.externalOffers, rng);
            this.message = { text: t('external.rejected', { player: playerName(player) }), color: ROLE.warning };
            this.refresh();
        } else if (action === 'retain') {
            if (beginExternalRetention(state, offer.id, this.ctx.config.market)) {
                this.ctx.screens.push(new NegotiationScreen(
                    this.ctx,
                    offer.playerId,
                    'externalRetention',
                    (accepted) => {
                        if (accepted) {
                            this.message = { text: t('external.retained', { player: playerName(player) }), color: ROLE.success };
                        } else {
                            this.message = { text: t('external.retainFailed', { player: playerName(player) }), color: ROLE.danger };
                        }
                        this.refresh();
                    },
                    offer.id,
                    offer.salaryOffer,
                ));
            }
        }
    }

    render(): void {
        const grid = this.ctx.grid;
        const offer = this.currentOffer();
        drawChrome(this.ctx, t('external.title'), [t('hint.pages'), t('hint.select'), t('hint.back')]);
        if (!offer) {
            return;
        }
        const state = this.ctx.session?.state;
        const player = state?.players[offer.playerId];
        if (!player || !state) {
            return;
        }
        const tierLabel = offer.tier === 'euroleague' ? t('external.tierEuro') : t('external.tierBcl');
        const pctAbove = Math.round((offer.breakthroughRatio - 1) * 100);
        let row = 4;
        grid.put(3, row, ROLE.gold, tierLabel);
        row++;
        grid.put(3, row, ROLE.header, t('external.fromClub', { club: offer.clubName, city: offer.clubCity }));
        row += 2;
        grid.put(3, row, ROLE.textBright, `${playerName(player)}  (${player.position}, ${player.age}, ${t('col.ovr')} ${overallRating(player.attributes)})`);
        row++;
        grid.put(3, row, ROLE.text, t('external.statsLine', {
            ppg: offer.seasonPpg.toFixed(1),
            gs: offer.seasonGameScore.toFixed(1),
            pct: String(pctAbove),
        }));
        row += 2;
        grid.put(3, row, ROLE.success, t('external.transferFee', { amount: formatMoney(offer.transferFee) }));
        row++;
        grid.put(3, row, ROLE.accent, t('external.salaryOffer', {
            amount: formatMoney(offer.salaryOffer),
            years: offer.contractYears,
        }));
        row++;
        grid.put(3, row, ROLE.textDim, t('external.deadline', { round: offer.expiresRound }));
        if (this.offers.length > 1) {
            row++;
            grid.put(3, row, ROLE.textDim, t('external.multiple', { n: this.selected + 1, total: this.offers.length }));
        }
        if (this.message) {
            grid.put(3, 16, this.message.color, this.message.text);
        }
        this.menu.render(grid);
    }
}
