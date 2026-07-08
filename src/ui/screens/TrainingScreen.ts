import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { trainingConfig, type TrainingFocus } from '../../config/training';
import { facilityProjectRoundsLeft } from '../../core/economy';
import type { Player } from '../../core/model/types';
import { overallRating } from '../../core/model/types';
import { t, type TranslationKey } from '../../i18n';
import { drawChrome } from '../chrome';
import { playerName } from '../format';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';

/**
 * Weekly training: pick the team focus (applies between rounds) and review
 * fatigue, morale, potential, and injuries.
 */
export class TrainingScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly table: DataTable;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.table = new DataTable({ col: 2, row: 6, visibleRows: 14 }, true);
    }

    private userPlayers(): Player[] {
        const state = this.ctx.session?.state;
        if (!state) {
            return [];
        }
        const team = state.teams[state.userTeamId];
        return (team?.playerIds ?? [])
            .map((id) => state.players[id])
            .filter((p): p is Player => p !== undefined)
            .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes));
    }

    private cycleFocus(direction: 1 | -1): void {
        const state = this.ctx.session?.state;
        if (!state) {
            return;
        }
        const order = trainingConfig.focusOrder;
        const index = order.indexOf(state.club.trainingFocus);
        const next = order[(index + direction + order.length) % order.length] as TrainingFocus;
        state.club.trainingFocus = next;
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        if (input.left) {
            this.cycleFocus(-1);
        }
        if (input.right) {
            this.cycleFocus(1);
        }
        this.table.update(input, this.ctx.grid);
    }

    render(): void {
        const state = this.ctx.session?.state;
        if (!state) {
            return;
        }
        const grid = this.ctx.grid;
        drawChrome(this.ctx, t('training.title'), [t('hint.navigate'), t('training.hintFocus'), t('hint.back')]);

        const focus = state.club.trainingFocus;
        grid.put(2, 2, ROLE.header, t('training.focus', { focus: t(`training.focus.${focus}` as TranslationKey) }));
        grid.put(2, 3, ROLE.textDim, t(`training.focusDesc.${focus}` as TranslationKey));
        const trainingProject = state.club.facilityProjects.training;
        if (trainingProject) {
            grid.put(2, 4, ROLE.warning, t('training.facilityUpgrading', {
                level: state.club.facilities.training,
                target: trainingProject.targetLevel,
                rounds: facilityProjectRoundsLeft(state, 'training') ?? 0,
            }));
        } else {
            grid.put(2, 4, ROLE.textDim, t('training.facility', { level: state.club.facilities.training }));
        }

        this.table.setData(
            [
                { header: t('col.name'), width: 22 },
                { header: t('col.pos'), width: 3 },
                { header: t('col.age'), width: 3, align: 'right' },
                { header: t('col.ovr'), width: 3, align: 'right' },
                { header: t('col.pot'), width: 3, align: 'right' },
                { header: t('col.fatigue'), width: 5, align: 'right' },
                { header: t('col.morale'), width: 5, align: 'right' },
                { header: t('col.status'), width: 16 },
            ],
            this.userPlayers().map((p) => ({
                cells: [
                    playerName(p),
                    p.position,
                    String(p.age),
                    String(overallRating(p.attributes)),
                    String(p.potential),
                    String(Math.round(p.fatigue)),
                    String(Math.round(p.morale)),
                    p.injury ? t('training.injured', { rounds: p.injury.roundsOut }) : t('training.fit'),
                ],
                ...(p.injury ? { color: ROLE.danger } : p.fatigue > 60 ? { color: ROLE.warning } : {}),
            })),
        );
        this.table.render(grid);
    }
}
