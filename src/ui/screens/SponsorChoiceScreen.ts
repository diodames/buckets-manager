import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { acceptSponsorOffer } from '../../core/economy';
import type { SponsorOffer } from '../../core/model/types';
import { t, type TranslationKey } from '../../i18n';
import { drawChrome } from '../chrome';
import { formatMoney, sponsorTargetLabel } from '../format';
import { ROLE } from '../theme';
import { MenuList } from '../widgets/MenuList';

/** Mandatory sponsor picker shown at new game start and each offseason renewal. */
export class SponsorChoiceScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly onContinue: () => void;
    private readonly menu: MenuList;

    constructor(ctx: AppContext, onContinue: () => void) {
        this.ctx = ctx;
        this.onContinue = onContinue;
        const offers = this.offers();
        this.menu = new MenuList(
            offers.map((offer) => ({
                id: offer.id,
                label: this.offerMenuLabel(offer),
            })),
            { col: 4, row: 6, width: 72 },
        );
    }

    private get state() {
        const session = this.ctx.session;
        if (!session) {
            throw new Error('SponsorChoiceScreen: no session');
        }
        return session.state;
    }

    private offers(): SponsorOffer[] {
        return this.state.club.sponsorOffers;
    }

    private offerMenuLabel(offer: SponsorOffer): string {
        const brand = t(`sponsor.${offer.brandKey}` as TranslationKey);
        const ambition = t(`sponsor.ambition.${offer.ambitionId}` as TranslationKey);
        const signing = offer.signingBonus > 0 ? `  ${formatMoney(offer.signingBonus)}` : '';
        return `${ambition}: ${brand}  ${formatMoney(offer.perRound)}/rd${signing}`;
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            return;
        }
        const picked = this.menu.update(input, this.ctx.grid);
        if (picked) {
            acceptSponsorOffer(this.state, picked, this.ctx.config.economy);
            this.ctx.screens.pop();
            this.onContinue();
        }
    }

    render(): void {
        const grid = this.ctx.grid;
        const offers = this.offers();
        drawChrome(this.ctx, t('sponsorChoice.title'), [t('hint.navigate'), t('sponsorChoice.select')]);
        grid.put(4, 3, ROLE.textDim, t('sponsorChoice.hint'));

        this.menu.render(grid);

        const selected = offers[this.menu.selected];
        if (selected) {
            let row = 6 + offers.length + 2;
            const brand = t(`sponsor.${selected.brandKey}` as TranslationKey);
            grid.put(4, row, ROLE.header, brand);
            row++;
            const riskKey = selected.ambitionId === 'bold'
                ? 'sponsorChoice.riskHigh'
                : selected.ambitionId === 'standard'
                  ? 'sponsorChoice.riskMid'
                  : 'sponsorChoice.riskLow';
            grid.put(4, row, ROLE.textDim, t('sponsorChoice.risk', { level: t(riskKey as TranslationKey) }));
            row++;
            grid.put(4, row, ROLE.text, t('sponsorChoice.weeklyIncome', { amount: formatMoney(selected.perRound) }));
            row++;
            if (selected.signingBonus > 0) {
                grid.put(4, row, ROLE.success, t('sponsorChoice.signing', { amount: formatMoney(selected.signingBonus) }));
                row++;
            }
            if (selected.ambitionId === 'bold') {
                grid.put(4, row, ROLE.textDim, t('sponsorChoice.boldNote'));
                row++;
            }
            grid.put(4, row, ROLE.accent, sponsorTargetLabel(selected.promisedMaxRank));
            row++;
            grid.put(4, row, ROLE.success, t('sponsor.bonusIfMet', { amount: formatMoney(selected.bonusAmount) }));
        }
    }
}
