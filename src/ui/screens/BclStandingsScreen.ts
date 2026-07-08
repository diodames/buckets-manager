import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { computeStandings } from '../../core/league/standings';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { teamName } from '../format';
import { ROLE } from '../theme';

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

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        const bcl = this.state.competitions.bcl;
        if (!bcl) {
            return;
        }
        if (input.left) {
            this.groupIndex = Math.max(0, this.groupIndex - 1);
        }
        if (input.right) {
            this.groupIndex = Math.min(bcl.groups.length - 1, this.groupIndex + 1);
        }
    }

    render(): void {
        const state = this.state;
        const grid = this.ctx.grid;
        const bcl = state.competitions.bcl;
        drawChrome(this.ctx, t('bcl.standings'), [t('hint.pages'), t('hint.back')]);

        if (!bcl || bcl.groups.length === 0) {
            grid.put(3, 5, ROLE.textDim, '-');
            return;
        }

        const group = bcl.groups[this.groupIndex];
        if (!group) {
            return;
        }
        grid.put(3, 3, ROLE.header, t('bcl.group', { name: group.id.replace('BCL-G', '') }));
        const standings = computeStandings(group.teamIds, group.fixtures);
        let row = 5;
        for (let i = 0; i < standings.length; i++) {
            const s = standings[i];
            if (!s) {
                continue;
            }
            const diff = s.pointsFor - s.pointsAgainst;
            const highlight = s.teamId === state.userTeamId ? ROLE.accent : ROLE.text;
            grid.put(3, row, highlight,
                `${i + 1}. ${teamName(s.teamId).padEnd(16)} ${s.wins}-${s.losses}  (${diff >= 0 ? '+' : ''}${diff})`);
            row++;
        }
    }
}
