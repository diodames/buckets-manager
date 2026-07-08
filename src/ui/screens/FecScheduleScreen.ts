import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { competitionLabel, fixtureLine } from '../format';
import { ROLE } from '../theme';

/** FIBA Europe Cup fixture list by week. */
export class FecScheduleScreen implements Screen {
    private readonly ctx: AppContext;
    private page = 0;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
    }

    private get state() {
        const state = this.ctx.session?.state;
        if (!state) {
            throw new Error('FecScheduleScreen: no session');
        }
        return state;
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
        const weeks = [...new Set(fec.fixtures.map((f) => f.week ?? f.round))].sort((a, b) => a - b);
        if (input.left) {
            this.page = Math.max(0, this.page - 1);
        }
        if (input.right) {
            this.page = Math.min(weeks.length - 1, this.page + 1);
        }
    }

    render(): void {
        const state = this.state;
        const grid = this.ctx.grid;
        const fec = state.competitions.fec;
        drawChrome(this.ctx, t('fec.schedule'), [t('hint.pages'), t('hint.back')]);

        if (!fec) {
            grid.put(3, 5, ROLE.textDim, '-');
            return;
        }

        const weeks = [...new Set(fec.fixtures.map((f) => f.week ?? f.round))].sort((a, b) => a - b);
        const week = weeks[this.page] ?? 1;
        grid.put(3, 3, ROLE.header, `${competitionLabel('fec')} - ${t('common.round', { round: week })}`);
        const fixtures = fec.fixtures.filter((f) => (f.week ?? f.round) === week);
        let row = 5;
        for (const f of fixtures) {
            const isUser = f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId;
            grid.put(3, row, isUser ? ROLE.accent : ROLE.text, fixtureLine(f));
            row++;
        }
    }
}
