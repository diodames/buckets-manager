import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { drawChrome } from '../chrome';
import { teamName } from '../format';
import { t } from '../../i18n';
import { ROLE } from '../theme';

/** FIBA Europe Cup knockout bracket viewer. */
export class FecBracketScreen implements Screen {
    private readonly ctx: AppContext;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
    }

    private get state() {
        const state = this.ctx.session?.state;
        if (!state) {
            throw new Error('FecBracketScreen: no session');
        }
        return state;
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
        }
    }

    render(): void {
        const state = this.state;
        const grid = this.ctx.grid;
        const fec = state.competitions.fec;
        drawChrome(this.ctx, t('fec.bracket'), [t('hint.back')]);

        if (!fec) {
            grid.put(3, 5, ROLE.textDim, t('fec.phase.qualifying'));
            return;
        }

        grid.put(3, 3, ROLE.header, t(`fec.phase.${fec.phase}` as Parameters<typeof t>[0]));
        let row = 5;

        if (fec.playoffs) {
            for (const series of fec.playoffs.series) {
                const winner = series.homeWins > series.awayWins
                    ? series.homeTeamId
                    : series.awayWins > series.homeWins
                      ? series.awayTeamId
                      : null;
                const line = `${teamName(series.homeTeamId)} ${series.homeWins}:${series.awayWins} ${teamName(series.awayTeamId)}`;
                grid.put(3, row, winner ? ROLE.success : ROLE.text, line);
                row++;
            }
        }

        if (fec.championTeamId) {
            row++;
            grid.put(3, row, ROLE.gold, t('fec.champion', { team: teamName(fec.championTeamId) }));
        }
    }
}
