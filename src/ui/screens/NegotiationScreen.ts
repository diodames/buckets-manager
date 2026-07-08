import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { marketConfig } from '../../config/market';
import { leagueConfig } from '../../config/league';
import { contractCashflowPreview } from '../../core/cashflow';
import type { ExternalOffersConfig } from '../../config/externalOffers';
import { clubBclPrestigeMessageKey, agentFeeAmount, negotiateOffer, negotiationDemand, type NegotiationResult } from '../../core/market';
import type { GameState, NegotiationState, Player, PlayerId } from '../../core/model/types';
import { overallRating } from '../../core/model/types';
import { t } from '../../i18n';
import { formatMoney, formatSalaryWithMonthly, playerName } from '../format';
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
    private readonly foreignBenchmark: number | null;
    private readonly agreedTransferFee: number | undefined;

    constructor(
        ctx: AppContext,
        playerId: PlayerId,
        mode: NegotiationState['mode'],
        onDone: (accepted: boolean) => void,
        _externalOfferId?: string,
        foreignBenchmark?: number,
        agreedTransferFee?: number,
    ) {
        this.ctx = ctx;
        this.playerId = playerId;
        this.mode = mode;
        this.onDone = onDone;
        this.foreignBenchmark = foreignBenchmark ?? null;
        this.agreedTransferFee = agreedTransferFee;
        const state = ctx.session?.state;
        const player = state?.players[playerId];
        const terms = agreedTransferFee !== undefined ? { agreedTransferFee } : {};
        const demand = state && player
            ? negotiationDemand(state, player, mode, marketConfig, ctx.config.economy, terms)
            : 1_000_000;
        if (mode === 'externalRetention' && foreignBenchmark) {
            this.salary = Math.round((foreignBenchmark * 0.75) / marketConfig.contracts.salaryStep) * marketConfig.contracts.salaryStep;
        } else {
            // Opening offer anchored slightly below the player's idea of fair.
            this.salary = Math.round((demand * 0.9) / marketConfig.contracts.salaryStep) * marketConfig.contracts.salaryStep;
        }
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

    /** First grid row for the dynamic detail block (BCL, rounds, budget). */
    private detailStartRow(): number {
        return this.mode === 'externalRetention' ? 11 : 10;
    }

    /** Last grid row used by the detail block above the action menu. */
    private detailEndRow(state: GameState, player: Player): number {
        let row = this.detailStartRow();
        const bclKey = clubBclPrestigeMessageKey(state, state.userTeamId, player, marketConfig, this.ctx.config.externalOffers);
        if (bclKey) {
            row++;
        }
        row++; // negotiation rounds
        row++; // wage budget impact
        row++; // projected end / affordability warning
        return row;
    }

    private syncMenuLayout(state: GameState, player: Player): number {
        const menuRow = this.detailEndRow(state, player) + 1;
        this.menu.setRow(menuRow);
        return menuRow;
    }

    update(input: UiInputFrame): void {
        const state = this.ctx.session?.state;
        const player = state?.players[this.playerId];
        if (state && player) {
            this.syncMenuLayout(state, player);
        }
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
            const negoOptions: { externalOffers?: ExternalOffersConfig; agreedTransferFee?: number } = {};
            if (this.mode === 'externalRetention') {
                negoOptions.externalOffers = this.ctx.config.externalOffers;
            }
            if (this.agreedTransferFee !== undefined) {
                negoOptions.agreedTransferFee = this.agreedTransferFee;
            }
            this.lastResult = negotiateOffer(
                state,
                this.playerId,
                { salary: this.salary, years: this.years },
                this.mode,
                marketConfig,
                this.ctx.config.economy,
                negoOptions,
            );
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
        const menuRow = this.syncMenuLayout(state, player);
        const resultRow = menuRow + this.menu.items.length + 1;
        const continueRow = resultRow + 2;
        const panelHeight = Math.max(17, continueRow - 6 + 1);
        grid.fillCells(12, 6, 52, panelHeight, ROLE.panel);
        grid.frame(12, 6, 52, panelHeight, ROLE.border);
        grid.put(14, 7, ROLE.header, t(`nego.title.${this.mode}` as Parameters<typeof t>[0]));
        grid.put(14, 8, ROLE.textBright, `${playerName(player)}  (${player.position}, ${player.age}, ${t('col.ovr')} ${overallRating(player.attributes)})`);
        const current = player.contract;
        if (current) {
            grid.put(14, 9, ROLE.textDim, t('nego.current', {
                salary: formatSalaryWithMonthly(current.salary),
                years: current.yearsLeft,
            }));
        }
        if (this.mode === 'externalRetention' && this.foreignBenchmark) {
            grid.put(14, 10, ROLE.gold, t('nego.foreignBenchmark', { amount: formatMoney(this.foreignBenchmark) }));
        }
        const bclKey = clubBclPrestigeMessageKey(state, state.userTeamId, player, marketConfig, this.ctx.config.externalOffers);
        let detailRow = this.detailStartRow();
        if (bclKey) {
            grid.put(14, detailRow, ROLE.text, t(bclKey as Parameters<typeof t>[0]));
            detailRow++;
        }
        grid.put(14, detailRow, ROLE.textDim, t('nego.roundsLeft', { n: Math.max(1, marketConfig.contracts.maxRounds - (this.lastResult?.negotiationRound ?? 0)) }));
        detailRow++;

        const replacesPlayerId = this.mode === 'renew' || this.mode === 'transferTerms' || this.mode === 'externalRetention'
            ? player.id
            : undefined;
        const preview = contractCashflowPreview(state, this.ctx.config.economy, leagueConfig, this.salary, replacesPlayerId);
        const budgetRole = preview.newWageBill <= preview.maxWageBill ? ROLE.textDim : ROLE.warning;
        grid.put(14, detailRow, budgetRole, t('nego.budgetImpact', {
            used: formatMoney(preview.newWageBill),
            max: formatMoney(preview.maxWageBill),
        }));
        detailRow++;
        if (preview.affordability.ok) {
            const endRole = preview.projectedEndBalance >= 0 ? ROLE.textDim : ROLE.danger;
            grid.put(14, detailRow, endRole, t('nego.projectedEnd', { amount: formatMoney(preview.projectedEndBalance) }));
            detailRow++;
        } else {
            grid.put(14, detailRow, ROLE.danger, t(preview.affordability.reason === 'wageBudgetExceeded' ? 'nego.wageBudgetExceeded' : 'nego.projectedDeficit'));
            detailRow++;
        }
        if (this.mode !== 'externalRetention') {
            grid.put(14, detailRow, ROLE.textDim, t('nego.agentFee', { amount: formatMoney(agentFeeAmount(player, this.salary, marketConfig)) }));
        }

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
            switch (this.lastResult.status) {
                case 'accepted':
                    grid.put(14, resultRow, ROLE.success, t('nego.accepted'));
                    break;
                case 'rejected':
                    grid.put(14, resultRow, ROLE.warning, this.lastResult.hintSalary
                        ? t('nego.rejectedHint', { amount: formatMoney(this.lastResult.hintSalary) })
                        : t('nego.rejected'));
                    break;
                case 'finalRejected':
                    grid.put(14, resultRow, ROLE.danger, t('nego.finalRejected'));
                    break;
                case 'locked':
                    grid.put(14, resultRow, ROLE.danger, t('nego.locked'));
                    break;
                case 'rosterFull':
                    grid.put(14, resultRow, ROLE.danger, t('nego.rosterFull'));
                    break;
                case 'foreignCapFull':
                    grid.put(14, resultRow, ROLE.danger, t('nego.foreignCapFull'));
                    break;
                    break;
                case 'wageBudgetExceeded':
                    grid.put(14, resultRow, ROLE.danger, t('nego.wageBudgetExceeded'));
                    break;
                case 'projectedDeficit':
                    grid.put(14, resultRow, ROLE.danger, t('nego.projectedDeficit'));
                    break;
            }
            if (this.finished) {
                grid.put(14, continueRow, ROLE.textDim, t('report.continue'));
            }
        }
    }
}
