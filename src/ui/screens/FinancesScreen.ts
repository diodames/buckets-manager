import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { balanceConfig } from '../../config/balance';
import { economyConfig } from '../../config/economy';
import { leagueConfig } from '../../config/league';
import { projectSeasonCashflow } from '../../core/cashflow';
import { arenaCapacity, computeGateReceipts, homeAdvantageDisplayPct, homeCourtAdvantage, playerSalary, realArenaCapacity } from '../../core/economy';
import { t, type TranslationKey } from '../../i18n';
import { drawChrome, financeWarningMessage } from '../chrome';
import { formatMoney } from '../format';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';

/** Budget overview and the recent ledger. */
export class FinancesScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly table: DataTable;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.table = new DataTable({ col: 4, row: 12, visibleRows: 12 }, false);
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        this.table.update(input, this.ctx.grid);
    }

    render(): void {
        const state = this.ctx.session?.state;
        if (!state) {
            return;
        }
        const grid = this.ctx.grid;
        drawChrome(this.ctx, t('finance.title'), [t('hint.navigate'), t('hint.back')]);

        const team = state.teams[state.userTeamId];
        const seasonSalaries = (team?.playerIds ?? []).reduce((sum, id) => sum + playerSalary(state, id, economyConfig), 0);
        const projection = projectSeasonCashflow(state, economyConfig, leagueConfig);
        const warning = financeWarningMessage(state, this.ctx);

        grid.put(4, 2, ROLE.header, t('club.budget', { amount: formatMoney(state.club.budget) }));
        grid.put(4, 3, ROLE.text, t('finance.salaries', { amount: formatMoney(seasonSalaries) }));
        grid.put(4, 4, ROLE.text, t('finance.wageBudget', {
            used: formatMoney(projection.seasonWageBill),
            max: formatMoney(projection.maxWageBill),
        }));
        grid.put(4, 5, ROLE.text, t('finance.weeklyBurn', { amount: formatMoney(projection.weeklyBurn) }));
        grid.put(4, 6, ROLE.text, t('finance.sponsorsPerRound', {
            amount: formatMoney(state.club.sponsors.reduce((s, d) => s + d.perRound, 0)),
        }));
        const realCap = realArenaCapacity(leagueConfig, state.userTeamId);
        const capacity = arenaCapacity(state, economyConfig, realCap);
        const gate = computeGateReceipts(state.club.fanSupport, state.club.ticketPrice, capacity, economyConfig);
        grid.put(4, 7, ROLE.text, t('finance.ticketPrice', { amount: state.club.ticketPrice }));
        grid.put(4, 8, ROLE.textDim, t('finance.projectedGate', {
            amount: formatMoney(gate.ticketIncome),
            sold: gate.ticketsSold,
            capacity,
        }));
        const endRole = projection.projectedEndBalance >= 0 ? ROLE.success : ROLE.danger;
        grid.put(4, 9, endRole, t('finance.projectedEnd', { amount: formatMoney(projection.projectedEndBalance) }));
        const homeBoost = homeCourtAdvantage(
            state,
            state.userTeamId,
            economyConfig,
            leagueConfig,
            balanceConfig.match.homeAdvantage,
        );
        grid.put(4, 10, ROLE.textDim, t('finance.homeAdvantage', { pct: homeAdvantageDisplayPct(homeBoost) }));
        if (warning) {
            grid.put(4, 11, projection.warningTier === 'red' ? ROLE.danger : ROLE.warning, warning);
        }
        grid.putRight(grid.cols - 4, 2, ROLE.accent, t('club.fans', { n: Math.round(state.club.fanSupport) }));

        this.table.setData(
            [
                { header: t('col.round'), width: 5, align: 'right' },
                { header: t('col.item'), width: 26 },
                { header: t('col.amount'), width: 10, align: 'right' },
            ],
            [...state.club.ledger].reverse().map((entry) => ({
                cells: [String(entry.round), t(`ledger.${entry.kind}` as TranslationKey), formatMoney(entry.amount)],
                color: entry.amount >= 0 ? ROLE.success : ROLE.danger,
            })),
        );
        this.table.render(grid);
    }
}
