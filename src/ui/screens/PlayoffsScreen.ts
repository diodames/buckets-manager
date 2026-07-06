import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { seriesWinner, winsNeeded } from '../../core/playoffs';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { teamDef, teamName } from '../format';
import { ROLE } from '../theme';

/** Post-season bracket: one column per stage with series scores. */
export class PlayoffsScreen implements Screen {
    private readonly ctx: AppContext;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
    }

    update(input: UiInputFrame): void {
        if (input.cancel || input.confirm) {
            this.ctx.screens.pop();
        }
    }

    render(): void {
        const state = this.ctx.session?.state;
        const grid = this.ctx.grid;
        drawChrome(this.ctx, t('playoff.title'), [t('hint.back')]);
        const playoffs = state?.playoffs;
        if (!state || !playoffs) {
            grid.put(4, 4, ROLE.textDim, t('playoff.notStarted'));
            return;
        }
        const stages = (this.ctx.config.league.playoffs.winsNeeded as readonly number[]).length;
        for (let stage = 0; stage < stages; stage++) {
            const col = 3 + stage * 34;
            grid.put(col, 3, ROLE.header, t(`playoff.stage.${stage}` as Parameters<typeof t>[0]));
            const stageSeries = playoffs.series.filter((s) => s.stage === stage).sort((a, b) => a.slot - b.slot);
            if (stageSeries.length === 0) {
                grid.put(col, 5, ROLE.textDim, '?');
            }
            stageSeries.forEach((series, index) => {
                const row = 5 + index * 3;
                const winner = seriesWinner(series, this.ctx.config.league);
                const needed = winsNeeded(stage, this.ctx.config.league);
                const homeSeed = playoffs.seeds[series.homeTeamId] ?? 0;
                const awaySeed = playoffs.seeds[series.awayTeamId] ?? 0;
                const line = `(${homeSeed}) ${teamDef(series.homeTeamId).abbr} ${series.homeWins}:${series.awayWins} ${teamDef(series.awayTeamId).abbr} (${awaySeed})`;
                grid.put(col, row, winner ? ROLE.textDim : ROLE.text, line);
                grid.put(col, row + 1, winner ? ROLE.success : ROLE.textDim,
                    winner ? t('playoff.advances', { team: teamDef(winner).abbr }) : t('playoff.firstTo', { n: needed }));
            });
        }
        if (playoffs.championTeamId) {
            grid.putCenter(grid.rows - 5, ROLE.gold, t('playoff.champion', { team: teamName(playoffs.championTeamId) }));
        }
    }
}
