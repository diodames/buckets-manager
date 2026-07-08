import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { marketConfig } from '../../config/market';
import { economyConfig } from '../../config/economy';
import { facilityProjectRoundsLeft } from '../../core/economy';
import { releaseYouth, signYouth } from '../../core/market';
import { overallRating } from '../../core/model/types';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { formatMoney, playerName } from '../format';
import { ROLE } from '../theme';
import { ConfirmDialog } from './ConfirmDialog';
import { MenuList } from '../widgets/MenuList';

function stars(value: number): string {
    const full = Math.floor(value);
    const half = value - full >= 0.5;
    return '*'.repeat(full) + (half ? '+' : '');
}

/**
 * Youth intake report (M19): academy prospects with blurred potential shown
 * as a star range. Enter signs (roster cap allowing), Confirm dialog offers
 * release instead.
 */
export class YouthIntakeScreen implements Screen {
    private readonly ctx: AppContext;
    private menu: MenuList;
    private message: string | null = null;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.menu = new MenuList([], { col: 3, row: 5, width: 70 });
    }

    onEnter(): void {
        this.rebuild();
    }

    private get state() {
        const state = this.ctx.session?.state;
        if (!state) {
            throw new Error('YouthIntakeScreen: no session');
        }
        return state;
    }

    private rebuild(): void {
        const prospects = this.state.market.youthProspects;
        this.menu = new MenuList(
            prospects.map((p) => ({
                id: p.player.id,
                label: `${playerName(p.player).padEnd(22)} ${p.player.position}  ${p.player.age}${t('youth.yrs')}  ${t('col.ovr')}~${overallRating(p.player.attributes)}  ${stars(p.starMin)}-${stars(p.starMax)}`,
            })),
            { col: 3, row: 5, width: 70 },
        );
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        const picked = this.menu.update(input, this.ctx.grid);
        if (picked) {
            const state = this.state;
            const prospect = state.market.youthProspects.find((p) => p.player.id === picked);
            if (!prospect) {
                return;
            }
            this.ctx.screens.push(
                new ConfirmDialog(this.ctx, t('youth.confirmSign', { salary: formatMoney(marketConfig.youth.salary) }), (confirmed) => {
                    if (confirmed) {
                        const result = signYouth(state, picked, marketConfig, economyConfig);
                        this.message = result === 'signed'
                            ? t('youth.signed', { player: playerName(prospect.player) })
                            : result === 'wageBudgetExceeded'
                              ? t('market.wageBudgetExceeded')
                              : result === 'projectedDeficit'
                                ? t('market.projectedDeficit')
                                : result === 'foreignCapFull'
                                  ? t('youth.foreignCapFull')
                                  : t('nego.rosterFull');
                    } else {
                        releaseYouth(state, picked);
                        this.message = t('youth.released', { player: playerName(prospect.player) });
                    }
                    this.rebuild();
                }),
            );
        }
    }

    render(): void {
        const state = this.state;
        const grid = this.ctx.grid;
        drawChrome(this.ctx, t('youth.title'), [t('hint.navigate'), t('hint.select'), t('hint.back')]);
        const academyProject = state.club.facilityProjects.academy;
        if (academyProject) {
            grid.put(3, 2, ROLE.warning, t('youth.introUpgrading', {
                level: state.club.facilities.academy,
                target: academyProject.targetLevel,
                rounds: facilityProjectRoundsLeft(state, 'academy') ?? 0,
            }));
        } else {
            grid.put(3, 2, ROLE.textDim, `${t('youth.intro', { level: state.club.facilities.academy })} ${t('youth.leavesAfterSeasons', { n: marketConfig.youth.maxUnsignedSeasons })}`);
        }

        if (state.market.youthProspects.length === 0) {
            grid.put(3, 5, ROLE.textDim, t('youth.empty'));
        } else {
            this.menu.render(grid);
            const selected = state.market.youthProspects[this.menu.selected];
            if (selected) {
                const row = 6 + this.menu.items.length + 1;
                grid.put(3, row, ROLE.accent, t(`youth.quote.${selected.quoteIndex}` as Parameters<typeof t>[0]));
            }
        }
        if (this.message) {
            grid.put(3, grid.rows - 3, ROLE.success, this.message);
        }
    }
}
