import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { economyConfig, type FacilityKey } from '../../config/economy';
import { acceptSponsorOffer, arenaCapacity, facilityProjectRoundsLeft, facilityUpgradeCost, realArenaCapacity, rejectSponsorOffer, upgradeFacility } from '../../core/economy';
import { t, type TranslationKey } from '../../i18n';
import { drawChrome } from '../chrome';
import { formatMoney, sponsorTargetLabel } from '../format';
import { ROLE } from '../theme';
import { ConfirmDialog } from './ConfirmDialog';
import { TicketPriceScreen } from './TicketPriceScreen';
import { MenuList } from '../widgets/MenuList';

const FACILITIES: FacilityKey[] = ['arena', 'training', 'academy'];

/**
 * Club development: facility upgrades, active sponsor deals, and incoming
 * sponsor offers (accept with Enter, reject with Delete/Backspace).
 */
export class ClubScreen implements Screen {
    private readonly ctx: AppContext;
    private menu: MenuList;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.menu = new MenuList([], { col: 2, row: 4, width: 56 });
    }

    onEnter(): void {
        this.rebuild();
    }

    private get state() {
        const state = this.ctx.session?.state;
        if (!state) {
            throw new Error('ClubScreen: no session');
        }
        return state;
    }

    private rebuild(): void {
        const state = this.state;
        const selected = this.menu.selected;
        const items: { id: string; label: string; disabled?: boolean }[] = [];
        for (const key of FACILITIES) {
            const level = state.club.facilities[key];
            const project = state.club.facilityProjects[key];
            const cost = facilityUpgradeCost(state, key, economyConfig);
            const name = t(`club.facility.${key}` as TranslationKey);
            const extra =
                key === 'arena'
                    ? ` (${t('club.capacity', { n: arenaCapacity(state, economyConfig, realArenaCapacity(this.ctx.config.league, state.userTeamId)) })})`
                    : '';
            let label: string;
            if (project) {
                const roundsLeft = facilityProjectRoundsLeft(state, key) ?? 0;
                label = `${name}  ${t('club.level', { level })}${extra}  ${t('club.upgrading', { target: project.targetLevel, rounds: roundsLeft })}`;
            } else if (cost === null) {
                label = `${name}  ${t('club.levelMax', { level })}${extra}`;
            } else {
                label = `${name}  ${t('club.level', { level })}${extra}  ${t('club.upgrade', { cost: formatMoney(cost) })}`;
            }
            items.push({ id: `facility:${key}`, label, disabled: cost === null || state.club.budget < cost });
        }
        items.push({
            id: 'ticketPrice',
            label: t('club.ticketPrice', { amount: state.club.ticketPrice }),
        });
        for (const offer of state.club.sponsorOffers) {
            items.push({
                id: `offer:${offer.id}`,
                label: t('club.offerAmbition', {
                    brand: t(`sponsor.${offer.brandKey}` as TranslationKey),
                    perRound: formatMoney(offer.perRound),
                    target: sponsorTargetLabel(offer.promisedMaxRank),
                }),
            });
        }
        this.menu = new MenuList(items, { col: 2, row: 4, width: 66 });
        this.menu.selected = Math.min(selected, Math.max(0, items.length - 1));
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        const action = this.menu.update(input, this.ctx.grid);
        if (!action) {
            return;
        }
        const [kind, id] = action.split(':', 2);
        if (kind === 'facility' && id) {
            const key = id as FacilityKey;
            const cost = facilityUpgradeCost(this.state, key, economyConfig);
            if (cost !== null) {
                this.ctx.screens.push(
                    new ConfirmDialog(this.ctx, t('club.confirmUpgradeTimed', { cost: formatMoney(cost) }), (confirmed) => {
                        if (confirmed) {
                            upgradeFacility(this.state, key, economyConfig);
                        }
                        this.rebuild();
                    }),
                );
            }
        } else if (kind === 'ticketPrice') {
            this.ctx.screens.push(new TicketPriceScreen(this.ctx));
        } else if (kind === 'offer' && id) {
            this.ctx.screens.push(
                new ConfirmDialog(this.ctx, t('club.confirmSponsor'), (confirmed) => {
                    if (confirmed) {
                        acceptSponsorOffer(this.state, id, economyConfig);
                    } else {
                        rejectSponsorOffer(this.state, id);
                    }
                    this.rebuild();
                }),
            );
        }
    }

    render(): void {
        const state = this.state;
        const grid = this.ctx.grid;
        this.rebuild();
        drawChrome(this.ctx, t('club.title'), [t('hint.navigate'), t('hint.select'), t('hint.back')]);
        grid.put(2, 2, ROLE.header, t('club.budget', { amount: formatMoney(state.club.budget) }));
        grid.putRight(grid.cols - 2, 2, ROLE.accent, t('club.fans', { n: Math.round(state.club.fanSupport) }));

        this.menu.render(grid);

        // Active sponsor deals.
        let row = 4 + this.menu.items.length + 2;
        grid.put(2, row, ROLE.header, t('club.sponsors'));
        row++;
        if (state.club.sponsors.length === 0) {
            grid.put(3, row, ROLE.textDim, t('club.noSponsors'));
            row++;
        }
        for (const deal of state.club.sponsors) {
            const relColor = deal.relationship >= 60 ? ROLE.success : deal.relationship >= 35 ? ROLE.warning : ROLE.danger;
            grid.put(3, row, ROLE.text, t('club.dealSeasons', {
                brand: t(`sponsor.${deal.brandKey}` as TranslationKey),
                perRound: formatMoney(deal.perRound),
                seasons: deal.seasonsRemaining,
            }));
            grid.putRight(grid.cols - 4, row, relColor, t('club.relationship', { n: Math.round(deal.relationship) }));
            row++;
            if (deal.signingBonus > 0) {
                grid.put(4, row, ROLE.textDim, t('sponsor.signingReceived', { amount: formatMoney(deal.signingBonus) }));
                row++;
            }
            if (deal.bonusAmount > 0) {
                grid.put(4, row, ROLE.textDim, t('club.sponsorTarget', { target: sponsorTargetLabel(deal.promisedMaxRank) }));
                row++;
                grid.put(4, row, ROLE.textDim, t('sponsor.bonusIfMet', { amount: formatMoney(deal.bonusAmount) }));
                row++;
            }
        }
    }
}
