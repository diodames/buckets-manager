import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { relinkCompetitionGroups, resolveGroupFixtures } from '../../core/bcl/index';
import { computeStandings } from '../../core/league/standings';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { teamName } from '../format';
import { ROLE } from '../theme';

/** FIBA Europe Cup group standings tables. */
export class FecStandingsScreen implements Screen {
    private readonly ctx: AppContext;
    private groupIndex = 0;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
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
    }

    render(): void {
        const state = this.state;
        const grid = this.ctx.grid;
        const fec = state.competitions.fec;
        drawChrome(this.ctx, t('fec.standings'), [t('hint.pages'), t('hint.back')]);

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
        const standings = computeStandings(group.teamIds, resolveGroupFixtures(fec, group));
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
