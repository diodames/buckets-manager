import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { seriesWinner, thirdPlaceWinsNeeded, thirdPlaceWinner, winsNeeded } from '../../core/playoffs';
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
        const hasThirdPlace = playoffs.thirdPlaceSeries !== null;
        const columnCount = stages + (hasThirdPlace ? 1 : 0);
        const stageWidth = Math.max(22, Math.floor((grid.cols - 6) / columnCount));
        const headerRow = 3;
        const maxPerRow = Math.max(1, Math.floor((grid.cols - 6) / stageWidth));

        const renderStage = (stageIndex: number, stageLabel: Parameters<typeof t>[0], stageSeries: typeof playoffs.series): void => {
            const col = 3 + (stageIndex % maxPerRow) * stageWidth;
            const rowOffset = stageIndex >= maxPerRow ? 14 : 0;
            grid.put(col, headerRow + rowOffset, ROLE.header, t(stageLabel));
            if (stageSeries.length === 0) {
                grid.put(col, headerRow + rowOffset + 2, ROLE.textDim, '?');
                return;
            }
            stageSeries.forEach((series, index) => {
                const row = headerRow + rowOffset + 2 + index * 3;
                const winner = seriesWinner(series, this.ctx.config.league);
                const needed = winsNeeded(Math.min(stageIndex, stages - 1), this.ctx.config.league);
                const homeSeed = playoffs.seeds[series.homeTeamId] ?? 0;
                const awaySeed = playoffs.seeds[series.awayTeamId] ?? 0;
                const line = `(${homeSeed}) ${teamDef(series.homeTeamId).abbr} ${series.homeWins}:${series.awayWins} ${teamDef(series.awayTeamId).abbr} (${awaySeed})`;
                grid.put(col, row, winner ? ROLE.textDim : ROLE.text, line);
                grid.put(col, row + 1, winner ? ROLE.success : ROLE.textDim,
                    winner ? t('playoff.advances', { team: teamDef(winner).abbr }) : t('playoff.firstTo', { n: needed }));
            });
        };

        for (let stage = 0; stage < stages; stage++) {
            const stageSeries = playoffs.series.filter((s) => s.stage === stage).sort((a, b) => a.slot - b.slot);
            renderStage(stage, `playoff.stage.${stage}` as Parameters<typeof t>[0], stageSeries);
        }

        if (playoffs.thirdPlaceSeries) {
            const series = playoffs.thirdPlaceSeries;
            const col = 3 + (stages % maxPerRow) * stageWidth;
            const rowOffset = stages >= maxPerRow ? 14 : 0;
            grid.put(col, headerRow + rowOffset, ROLE.header, t('playoff.stage.3'));
            const winner = thirdPlaceWinner(playoffs, this.ctx.config.league);
            const needed = thirdPlaceWinsNeeded(this.ctx.config.league);
            const homeSeed = playoffs.seeds[series.homeTeamId] ?? 0;
            const awaySeed = playoffs.seeds[series.awayTeamId] ?? 0;
            const line = `(${homeSeed}) ${teamDef(series.homeTeamId).abbr} ${series.homeWins}:${series.awayWins} ${teamDef(series.awayTeamId).abbr} (${awaySeed})`;
            grid.put(col, headerRow + rowOffset + 2, winner ? ROLE.textDim : ROLE.text, line);
            grid.put(col, headerRow + rowOffset + 3, winner ? ROLE.success : ROLE.textDim,
                winner ? t('playoff.advances', { team: teamDef(winner).abbr }) : t('playoff.firstTo', { n: needed }));
        }

        if (playoffs.championTeamId) {
            grid.putCenter(grid.rows - 5, ROLE.gold, t('playoff.champion', { team: teamName(playoffs.championTeamId) }));
        }
        if (playoffs.thirdPlaceTeamId) {
            grid.putCenter(grid.rows - 4, ROLE.text, `3rd: ${teamName(playoffs.thirdPlaceTeamId)}`);
        }
    }
}
