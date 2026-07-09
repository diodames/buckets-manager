import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { relinkCompetitionGroups, resolveGroupFixtures } from '../../core/bcl/index';
import { computeStandings } from '../../core/league/standings';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { teamName } from '../format';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';
import { TeamDetailScreen } from './TeamDetailScreen';

/** FIBA Europe Cup group standings tables. */
export class FecStandingsScreen implements Screen {
    private readonly ctx: AppContext;
    private groupIndex = 0;
    private readonly table: DataTable;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.table = new DataTable({ col: 3, row: 5, visibleRows: 8 }, true);
    }

    private get state() {
        const state = this.ctx.session?.state;
        if (!state) {
            throw new Error('FecStandingsScreen: no session');
        }
        return state;
    }

    private clampGroupIndex(count: number): void {
        if (count <= 0) {
            this.groupIndex = 0;
            return;
        }
        this.groupIndex = Math.max(0, Math.min(this.groupIndex, count - 1));
    }

    private currentStandings() {
        const fec = this.state.competitions.fec;
        if (!fec || fec.groups.length === 0) {
            return [];
        }
        relinkCompetitionGroups(fec);
        this.clampGroupIndex(fec.groups.length);
        const group = fec.groups[this.groupIndex];
        if (!group) {
            return [];
        }
        return computeStandings(group.teamIds, resolveGroupFixtures(fec, group));
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        const fec = this.state.competitions.fec;
        if (!fec) {
            return;
        }
        this.clampGroupIndex(fec.groups.length);
        if (input.left) {
            this.groupIndex = Math.max(0, this.groupIndex - 1);
        }
        if (input.right) {
            this.groupIndex = Math.min(fec.groups.length - 1, this.groupIndex + 1);
        }

        const activated = this.table.update(input, this.ctx.grid);
        if (activated !== null) {
            const row = this.currentStandings()[activated];
            if (row) {
                this.ctx.screens.push(
                    new TeamDetailScreen(this.ctx, row.teamId, {
                        wins: row.wins,
                        losses: row.losses,
                        diff: row.pointsFor - row.pointsAgainst,
                    }),
                );
            }
        }
    }

    render(): void {
        const state = this.state;
        const grid = this.ctx.grid;
        const fec = state.competitions.fec;
        drawChrome(this.ctx, t('fec.standings'), [t('hint.pages'), t('hint.navigate'), t('hint.select'), t('hint.back')]);

        if (!fec || fec.groups.length === 0) {
            grid.put(3, 5, ROLE.textDim, '-');
            return;
        }

        relinkCompetitionGroups(fec);
        this.clampGroupIndex(fec.groups.length);
        const group = fec.groups[this.groupIndex];
        if (!group) {
            return;
        }
        const groupName = group.id.replace('FEC-', '');
        grid.put(3, 3, ROLE.header, t('fec.group', { name: groupName }));

        const standings = this.currentStandings();
        this.table.setData(
            [
                { header: t('col.rank'), width: 3, align: 'right' },
                { header: t('col.team'), width: 22 },
                { header: t('col.wins'), width: 3, align: 'right' },
                { header: t('col.losses'), width: 3, align: 'right' },
                { header: t('col.diff'), width: 5, align: 'right' },
            ],
            standings.map((row, index) => ({
                cells: [
                    String(index + 1),
                    teamName(row.teamId),
                    String(row.wins),
                    String(row.losses),
                    String(row.pointsFor - row.pointsAgainst),
                ],
                ...(row.teamId === state.userTeamId ? { color: ROLE.accent } : {}),
            })),
        );
        this.table.render(grid);
    }
}
