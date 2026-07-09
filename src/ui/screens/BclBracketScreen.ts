import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { drawChrome } from '../chrome';
import { teamName } from '../format';
import { t } from '../../i18n';
import { ROLE } from '../theme';
import type { PlayoffSeries } from '../../core/model/types';

const STAGE_LABELS: Record<number, string> = {
    0: 'bcl.bracket.qf',
    1: 'bcl.bracket.sf',
    2: 'bcl.bracket.final',
};

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

    private renderSeriesLine(series: PlayoffSeries): string {
        const winner = series.homeWins > series.awayWins
            ? series.homeTeamId
            : series.awayWins > series.homeWins
              ? series.awayTeamId
              : null;
        const line = `${teamName(series.homeTeamId)} ${series.homeWins}:${series.awayWins} ${teamName(series.awayTeamId)}`;
        return winner ? line : line;
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
            const byStage = new Map<number, PlayoffSeries[]>();
            for (const series of bcl.playoffs.series) {
                const list = byStage.get(series.stage) ?? [];
                list.push(series);
                byStage.set(series.stage, list);
            }
            for (const stage of [0, 1, 2]) {
                const stageSeries = byStage.get(stage);
                if (!stageSeries || stageSeries.length === 0) {
                    continue;
                }
                const labelKey = STAGE_LABELS[stage];
                if (labelKey) {
                    grid.put(3, row, ROLE.accent, t(labelKey as Parameters<typeof t>[0]));
                    row++;
                }
                for (const series of stageSeries.sort((a, b) => a.slot - b.slot)) {
                    const winner = series.homeWins > series.awayWins
                        ? series.homeTeamId
                        : series.awayWins > series.homeWins
                          ? series.awayTeamId
                          : null;
                    grid.put(3, row, winner ? ROLE.success : ROLE.text, this.renderSeriesLine(series));
                    row++;
                }
            }
        }

        if (bcl.championTeamId) {
            row++;
            grid.put(3, row, ROLE.gold, t('bcl.champion', { team: teamName(bcl.championTeamId) }));
        }
    }
}
