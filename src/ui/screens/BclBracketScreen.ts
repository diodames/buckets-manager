import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { drawChrome } from '../chrome';
import { teamName } from '../format';
import { t } from '../../i18n';
import { ROLE } from '../theme';

/** BCL knockout bracket viewer. */
export class BclBracketScreen implements Screen {
    private readonly ctx: AppContext;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
    }

    private get state() {
        const state = this.ctx.session?.state;
        if (!state) {
            throw new Error('BclBracketScreen: no session');
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
        const bcl = state.competitions.bcl;
        drawChrome(this.ctx, t('bcl.bracket'), [t('hint.back')]);

        if (!bcl) {
            grid.put(3, 5, ROLE.textDim, t('bcl.phase.qualifying'));
            return;
        }

        grid.put(3, 3, ROLE.header, t(`bcl.phase.${bcl.phase}` as Parameters<typeof t>[0]));
        let row = 5;

        if (bcl.playoffs) {
            for (const series of bcl.playoffs.series) {
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

        if (bcl.championTeamId) {
            row++;
            grid.put(3, row, ROLE.gold, t('bcl.champion', { team: teamName(bcl.championTeamId) }));
        }
    }
}
