import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { resolveGroupFixtures } from '../../core/bcl/index';
import { computeStandings } from '../../core/league/standings';
import type { BclGroup, StandingsRow } from '../../core/model/types';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { teamName } from '../format';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';
import { TeamDetailScreen } from './TeamDetailScreen';

interface GroupView {
    group: BclGroup;
    phaseKey: 'bcl.phase.regularSeason' | 'bcl.phase.roundOf16';
}

/** BCL group standings tables. */
export class BclStandingsScreen implements Screen {
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
            throw new Error('BclStandingsScreen: no session');
        }
        return state;
    }

    private groupViews(): GroupView[] {
        const comp = this.state.competitions.bcl;
        if (!comp) {
            return [];
        }
        const views: GroupView[] = [];
        if (comp.archivedGroups && comp.archivedGroups.length > 0) {
            for (const group of comp.archivedGroups) {
                views.push({ group, phaseKey: 'bcl.phase.regularSeason' });
            }
        }
        const currentPhaseKey: GroupView['phaseKey'] = comp.phase === 'roundOf16'
            ? 'bcl.phase.roundOf16'
            : 'bcl.phase.regularSeason';
        for (const group of comp.groups) {
            views.push({ group, phaseKey: currentPhaseKey });
        }
        return views;
    }

    private clampGroupIndex(count: number): void {
        if (count <= 0) {
            this.groupIndex = 0;
            return;
        }
        this.groupIndex = Math.max(0, Math.min(this.groupIndex, count - 1));
    }

    private currentStandings(): StandingsRow[] {
        const views = this.groupViews();
        this.clampGroupIndex(views.length);
        const view = views[this.groupIndex];
        if (!view) {
            return [];
        }
        const bcl = this.state.competitions.bcl;
        if (!bcl) {
            return [];
        }
        return computeStandings(view.group.teamIds, resolveGroupFixtures(bcl, view.group));
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        const bcl = this.state.competitions.bcl;
        if (!bcl) {
            return;
        }
        const views = this.groupViews();
        this.clampGroupIndex(views.length);
        if (input.left) {
            this.groupIndex = Math.max(0, this.groupIndex - 1);
        }
        if (input.right) {
            this.groupIndex = Math.min(views.length - 1, this.groupIndex + 1);
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
        const bcl = state.competitions.bcl;
        drawChrome(this.ctx, t('bcl.standings'), [t('hint.pages'), t('hint.navigate'), t('hint.select'), t('hint.back')]);

        if (!bcl) {
            grid.put(3, 5, ROLE.textDim, '-');
            return;
        }

        const views = this.groupViews();
        this.clampGroupIndex(views.length);
        if (views.length === 0) {
            grid.put(3, 5, ROLE.textDim, '-');
            return;
        }

        const view = views[this.groupIndex];
        if (!view) {
            return;
        }
        const { group, phaseKey } = view;
        const groupName = group.id.replace('BCL-G', '');
        grid.put(3, 3, ROLE.header, `${t('bcl.group', { name: groupName })} - ${t(phaseKey)}`);

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
