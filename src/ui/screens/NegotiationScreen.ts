import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { marketConfig } from '../../config/market';
import { contractDemand, negotiateOffer, type NegotiationResult } from '../../core/market';
import type { NegotiationState, PlayerId } from '../../core/model/types';
import { overallRating } from '../../core/model/types';
import { t } from '../../i18n';
import { formatMoney, playerName } from '../format';
import { ROLE } from '../theme';
import { MenuList } from '../widgets/MenuList';

/**
 * Contract negotiation dialog (M17): salary and years steppers, up to three
 * offers. Used for renewals, free-agent signings, and post-transfer terms.
 */
export class NegotiationScreen implements Screen {
    readonly isOverlay = false;
    private readonly ctx: AppContext;
    private readonly playerId: PlayerId;
    private readonly mode: NegotiationState['mode'];
    private readonly onDone: (accepted: boolean) => void;
    private readonly menu: MenuList;
    private salary: number;
    private years = 2;
    private lastResult: NegotiationResult | null = null;
    private finished = false;

    constructor(ctx: AppContext, playerId: PlayerId, mode: NegotiationState['mode'], onDone: (accepted: boolean) => void) {
        this.ctx = ctx;
        this.playerId = playerId;
        this.mode = mode;
        this.onDone = onDone;
        const state = ctx.session?.state;
        const player = state?.players[playerId];
        const demand = state && player ? contractDemand(state, player, marketConfig, ctx.config.economy) : 1_000_000;
        // Opening offer anchored slightly below the player's idea of fair.
        this.salary = Math.round((demand * 0.9) / marketConfig.contracts.salaryStep) * marketConfig.contracts.salaryStep;
        this.menu = new MenuList(
            [
                { id: 'salary', label: '' },
                { id: 'years', label: '' },
                { id: 'offer', label: t('nego.makeOffer') },
                { id: 'leave', label: t('nego.leave') },
            ],
            { col: 14, row: 12, width: 46 },
        );
    }

    update(input: UiInputFrame): void {
        if (this.finished) {
            if (input.confirm || input.cancel) {
                this.ctx.screens.pop();
                this.onDone(this.lastResult?.status === 'accepted');
            }
            return;
        }
        if (input.cancel) {
            this.ctx.screens.pop();
            this.onDone(false);
            return;
        }
        const selected = this.menu.items[this.menu.selected]?.id;
        if ((input.left || input.right) && selected === 'salary') {
            const step = marketConfig.contracts.salaryStep * (input.right ? 1 : -1);
            this.salary = Math.max(marketConfig.contracts.salaryStep, this.salary + step);
        }
        if ((input.left || input.right) && selected === 'years') {
            const dir = input.right ? 1 : -1;
            this.years = Math.max(marketConfig.contracts.yearsMin, Math.min(marketConfig.contracts.yearsMax, this.years + dir));
        }
        const action = this.menu.update(input, this.ctx.grid);
        if (action === 'leave') {
            this.ctx.screens.pop();
            this.onDone(false);
        } else if (action === 'offer') {
            const state = this.ctx.session?.state;
            if (!state) {
                return;
            }
            this.lastResult = negotiateOffer(state, this.playerId, { salary: this.salary, years: this.years }, this.mode, marketConfig, this.ctx.config.economy);
            if (this.lastResult.status !== 'rejected') {
                this.finished = true;
            } else if (this.lastResult.hintSalary) {
                this.salary = this.lastResult.hintSalary;
            }
        }
    }

    render(): void {
        const grid = this.ctx.grid;
        const state = this.ctx.session?.state;
        const player = state?.players[this.playerId];
        if (!player || !state) {
            return;
        }
        grid.fillCells(12, 6, 52, 16, ROLE.panel);
        grid.frame(12, 6, 52, 16, ROLE.border);
        grid.put(14, 7, ROLE.header, t(`nego.title.${this.mode}` as Parameters<typeof t>[0]));
        grid.put(14, 8, ROLE.textBright, `${playerName(player)}  (${player.position}, ${player.age}, ${t('col.ovr')} ${overallRating(player.attributes)})`);
        const current = player.contract;
        if (current) {
            grid.put(14, 9, ROLE.textDim, t('nego.current', { salary: formatMoney(current.salary), years: current.yearsLeft }));
        }
        grid.put(14, 10, ROLE.textDim, t('nego.roundsLeft', { n: Math.max(1, marketConfig.contracts.maxRounds - (this.lastResult?.negotiationRound ?? 0)) }));

        const first = this.menu.items[0];
        const second = this.menu.items[1];
        if (first) {
            first.label = t('nego.salary', { amount: formatMoney(this.salary) });
        }
        if (second) {
            second.label = t('nego.years', { n: this.years });
        }
        this.menu.render(grid);

        if (this.lastResult) {
            const row = 18;
            switch (this.lastResult.status) {
                case 'accepted':
                    grid.put(14, row, ROLE.success, t('nego.accepted'));
                    break;
                case 'rejected':
                    grid.put(14, row, ROLE.warning, this.lastResult.hintSalary
                        ? t('nego.rejectedHint', { amount: formatMoney(this.lastResult.hintSalary) })
                        : t('nego.rejected'));
                    break;
                case 'finalRejected':
                    grid.put(14, row, ROLE.danger, t('nego.finalRejected'));
                    break;
                case 'locked':
                    grid.put(14, row, ROLE.danger, t('nego.locked'));
                    break;
                case 'rosterFull':
                    grid.put(14, row, ROLE.danger, t('nego.rosterFull'));
                    break;
            }
            if (this.finished) {
                grid.put(14, 20, ROLE.textDim, t('report.continue'));
            }
        }
    }
}
