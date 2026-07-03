import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { createNewGame } from '../../core/game';
import { generateLeague, type GeneratedLeague } from '../../core/league/generate';
import { overallRating } from '../../core/model/types';
import { createRng } from '../../core/rng';
import { t, teamCityName, teamDisplayName } from '../../i18n';
import { drawChrome } from '../chrome';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';
import { DashboardScreen } from './DashboardScreen';

export class TeamSelectScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly seed: number;
    private readonly preview: GeneratedLeague;
    private readonly table: DataTable;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        // The league is generated deterministically from this seed; the same
        // seed is passed to createNewGame below, so the ratings previewed
        // here are exactly the league the player will manage.
        this.seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
        this.preview = generateLeague(
            createRng(this.seed).fork('league'),
            ctx.config.league,
            ctx.config.balance,
            ctx.config.names,
        );
        this.table = new DataTable({ col: 4, row: 4, visibleRows: ctx.config.league.teams.length }, true);
    }

    private teamRating(teamId: string): number {
        const team = this.preview.teams[teamId];
        if (!team) {
            return 0;
        }
        const ratings = team.playerIds
            .map((id) => this.preview.players[id])
            .filter((p) => p !== undefined)
            .map((p) => overallRating(p.attributes));
        return Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        const activated = this.table.update(input, this.ctx.grid);
        if (activated !== null) {
            const teamDef = this.ctx.config.league.teams[activated];
            if (teamDef) {
                const state = createNewGame(this.ctx.config, this.seed, teamDef.id);
                this.ctx.session = { state, lastRound: null };
                this.ctx.screens.reset(new DashboardScreen(this.ctx));
            }
        }
    }

    render(): void {
        this.table.setData(
            [
                { header: t('col.abbr'), width: 4 },
                { header: t('col.team'), width: 24 },
                { header: t('col.city'), width: 18 },
                { header: t('col.rating'), width: 6, align: 'right' },
            ],
            this.ctx.config.league.teams.map((teamDef) => ({
                cells: [teamDef.abbr, teamDisplayName(teamDef), teamCityName(teamDef), String(this.teamRating(teamDef.id))],
            })),
        );
        drawChrome(this.ctx, t('teamSelect.title'), [t('hint.navigate'), t('hint.select'), t('hint.back')]);
        this.ctx.grid.put(4, 2, ROLE.textDim, t('teamSelect.hint'));
        this.table.render(this.ctx.grid);
    }
}
