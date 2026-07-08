import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { computeNblStandings } from '../../core/league/standings';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { teamName } from '../format';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';

export class StandingsScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly table: DataTable;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.table = new DataTable({ col: 4, row: 4, visibleRows: ctx.config.league.teams.length }, false);
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        this.table.update(input, this.ctx.grid);
    }

    render(): void {
        const session = this.ctx.session;
        if (!session) {
            return;
        }
        const standings = computeNblStandings(session.state);
        this.table.setData(
            [
                { header: t('col.rank'), width: 3, align: 'right' },
                { header: t('col.team'), width: 24 },
                { header: t('col.played'), width: 3, align: 'right' },
                { header: t('col.wins'), width: 3, align: 'right' },
                { header: t('col.losses'), width: 3, align: 'right' },
                { header: t('col.pf'), width: 5, align: 'right' },
                { header: t('col.pa'), width: 5, align: 'right' },
                { header: t('col.diff'), width: 5, align: 'right' },
            ],
            standings.map((row, index) => ({
                cells: [
                    String(index + 1),
                    teamName(row.teamId),
                    String(row.played),
                    String(row.wins),
                    String(row.losses),
                    String(row.pointsFor),
                    String(row.pointsAgainst),
                    String(row.pointsFor - row.pointsAgainst),
                ],
                ...(row.teamId === session.state.userTeamId ? { color: ROLE.accent } : {}),
            })),
        );
        drawChrome(this.ctx, t('standings.title'), [t('hint.back')]);
        this.table.render(this.ctx.grid);
    }
}
