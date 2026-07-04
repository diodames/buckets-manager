import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { economyConfig } from '../../config/economy';
import { playerSalary } from '../../core/economy';
import { t, type TranslationKey } from '../../i18n';
import { drawChrome } from '../chrome';
import { formatMoney } from '../format';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';

/** Budget overview and the recent ledger. */
export class FinancesScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly table: DataTable;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.table = new DataTable({ col: 4, row: 8, visibleRows: 14 }, false);
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
        grid.put(4, 2, ROLE.header, t('club.budget', { amount: formatMoney(state.club.budget) }));
        grid.put(4, 4, ROLE.text, t('finance.salaries', { amount: formatMoney(seasonSalaries) }));
        grid.put(4, 5, ROLE.text, t('finance.sponsorsPerRound', {
            amount: formatMoney(state.club.sponsors.reduce((s, d) => s + d.perRound, 0)),
        }));
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
