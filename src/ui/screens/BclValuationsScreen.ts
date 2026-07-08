import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { bclValuationSeasonYear, bclValuationsData } from '../../data/bclValuations';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { formatMoney } from '../format';
import { padLeft, padRight } from '../text';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';

const TABLE_COL = 2;
const TABLE_ROW = 5;
const VISIBLE_ROWS = 16;
const CSV_URL = '/data/bcl-valuations.csv';

/** Scrollable BCL player valuation reference (salary / demand / transfer value). */
export class BclValuationsScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly table: DataTable;
    private showRealOnly = false;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.table = new DataTable({ col: TABLE_COL, row: TABLE_ROW, visibleRows: VISIBLE_ROWS }, false);
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        if (input.confirm) {
            this.showRealOnly = !this.showRealOnly;
            return;
        }
        this.table.update(input, this.ctx.grid);
    }

    private visibleRows() {
        return this.showRealOnly
            ? bclValuationsData.filter((row) => row.source === 'real')
            : [...bclValuationsData];
    }

    render(): void {
        const grid = this.ctx.grid;
        const rows = this.visibleRows();
        const filterLabel = this.showRealOnly ? t('bcl.valuations.realOnly') : t('bcl.valuations.allPlayers');

        drawChrome(this.ctx, t('bcl.valuations.title'), [t('hint.navigate'), t('bcl.valuations.toggleFilter'), t('hint.back')]);
        grid.put(2, 2, ROLE.textDim, t('bcl.valuations.subtitle', { year: bclValuationSeasonYear, filter: filterLabel }));
        grid.put(2, 3, ROLE.textDim, t('bcl.valuations.csvHint', { url: CSV_URL }));

        this.table.setData(
            [
                { header: t('col.team'), width: 10 },
                { header: t('col.name'), width: 16 },
                { header: t('col.pos'), width: 3 },
                { header: t('col.age'), width: 3, align: 'right' },
                { header: t('col.ovr'), width: 3, align: 'right' },
                { header: t('col.salary'), width: 6, align: 'right' },
                { header: t('col.price'), width: 6, align: 'right' },
            ],
            rows.map((row) => ({
                cells: [
                    padRight(row.club, 10),
                    padRight(row.name, 16),
                    row.position,
                    String(row.age),
                    String(row.ovr),
                    padLeft(formatMoney(row.estSalary), 6),
                    padLeft(formatMoney(row.estValue), 6),
                ],
                color: row.source === 'real' ? ROLE.textBright : ROLE.text,
            })),
        );
        this.table.render(grid);
        grid.put(2, grid.rows - 2, ROLE.textDim, t('bcl.valuations.footer', { n: rows.length }));
    }
}
