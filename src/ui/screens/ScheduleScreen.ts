import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { fixturesOfRound, seasonRounds } from '../../core/game';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { teamDef } from '../format';
import { ROLE } from '../theme';

export class ScheduleScreen implements Screen {
    private readonly ctx: AppContext;
    private round: number;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        const state = ctx.session?.state;
        const rounds = state ? seasonRounds(state, ctx.config) : 1;
        this.round = state ? Math.min(state.currentRound, rounds) : 1;
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        const state = this.ctx.session?.state;
        if (!state) {
            return;
        }
        const rounds = seasonRounds(state, this.ctx.config);
        if (input.left) {
            this.round = Math.max(1, this.round - 1);
        }
        if (input.right) {
            this.round = Math.min(rounds, this.round + 1);
        }
    }

    render(): void {
        const session = this.ctx.session;
        if (!session) {
            return;
        }
        const grid = this.ctx.grid;
        drawChrome(this.ctx, t('schedule.title'), [t('hint.pages'), t('hint.back')]);
        grid.put(4, 2, ROLE.header, `< ${t('common.round', { round: this.round })} >`);

        let row = 4;
        for (const fixture of fixturesOfRound(session.state, this.round)) {
            const isUserMatch =
                fixture.homeTeamId === session.state.userTeamId || fixture.awayTeamId === session.state.userTeamId;
            const home = teamDef(fixture.homeTeamId);
            const away = teamDef(fixture.awayTeamId);
            const score = fixture.result ? `${fixture.result.homeScore}:${fixture.result.awayScore}` : '-:-';
            const overtime = fixture.result && fixture.result.quarterScores.length > this.ctx.config.balance.match.quarters
                ? ` ${t('common.ot')}`
                : '';
            const line = `${home.abbr.padEnd(4)} ${score.padStart(7)}  ${away.abbr}${overtime}`;
            grid.put(5, row, isUserMatch ? ROLE.accent : ROLE.text, line);
            row++;
        }
    }
}
