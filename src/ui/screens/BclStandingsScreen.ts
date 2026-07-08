import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { resolveGroupFixtures } from '../../core/bcl/index';
import { computeStandings } from '../../core/league/standings';
import type { BclGroup } from '../../core/model/types';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { teamName } from '../format';
import { ROLE } from '../theme';

interface GroupView {
    group: BclGroup;
    phaseKey: 'bcl.phase.regularSeason' | 'bcl.phase.roundOf16';
}

/** BCL group standings tables. */
export class BclStandingsScreen implements Screen {
    private readonly ctx: AppContext;
    private groupIndex = 0;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
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
    }

    render(): void {
        const state = this.state;
        const grid = this.ctx.grid;
        const bcl = state.competitions.bcl;
        drawChrome(this.ctx, t('bcl.standings'), [t('hint.pages'), t('hint.back')]);

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
        const standings = computeStandings(group.teamIds, resolveGroupFixtures(bcl, group));
        let row = 5;
        for (let i = 0; i < standings.length; i++) {
            const s = standings[i];
            if (!s) {
                continue;
            }
            const diff = s.pointsFor - s.pointsAgainst;
            const highlight = s.teamId === state.userTeamId ? ROLE.accent : ROLE.text;
            grid.put(3, row, highlight,
                `${i + 1}. ${teamName(s.teamId).padEnd(14)} ${s.played}G ${s.wins}-${s.losses}  (${diff >= 0 ? '+' : ''}${diff})`);
            row++;
        }
    }
}
