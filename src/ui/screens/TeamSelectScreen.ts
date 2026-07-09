import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { createNewGame } from '../../core/game';
import { startingBudgetForTeam, generateAmbitionSponsorOffers } from '../../core/economy';
import { generateLeague, type GeneratedLeague } from '../../core/league/generate';
import type { Player } from '../../core/model/types';
import { overallRating } from '../../core/model/types';
import { createRng } from '../../core/rng';
import { t, teamDisplayName } from '../../i18n';
import { drawChrome } from '../chrome';
import { drawTeamCrest } from '../crests';
import {
    renderTeamDetailPanel,
    sortTeamPlayers,
    teamArenaSeats,
    type TeamDetailLayout,
} from '../teamDetail';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';
import { DashboardScreen } from './DashboardScreen';
import { SponsorChoiceScreen } from './SponsorChoiceScreen';

const TEAM_TABLE_COL = 2;
const TEAM_TABLE_ROW = 4;
const LEGACY_CREST_COLS = 2;
const TEAM_TABLE_WIDTH = 30;
const DETAIL_GAP = 6;
const DETAIL_FRAME_COL = TEAM_TABLE_COL + TEAM_TABLE_WIDTH + DETAIL_GAP;
const DETAIL_COL = DETAIL_FRAME_COL + 1;
const DETAIL_ROW = 4;

export class TeamSelectScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly seed: number;
    private readonly preview: GeneratedLeague;
    private readonly table: DataTable;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
        this.preview = generateLeague(
            createRng(this.seed).fork('league'),
            ctx.config.league,
            ctx.config.balance,
            ctx.config.names,
        );
        this.table = new DataTable(
            { col: TEAM_TABLE_COL, row: TEAM_TABLE_ROW, visibleRows: ctx.config.league.teams.length },
            true,
        );
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

    private previewPlayers(teamId: string): Player[] {
        const team = this.preview.teams[teamId];
        if (!team) {
            return [];
        }
        return sortTeamPlayers(
            team.playerIds
                .map((id) => this.preview.players[id])
                .filter((p): p is Player => p !== undefined),
        );
    }

    private renderDetail(selected: number): void {
        const teamDef = this.ctx.config.league.teams[selected];
        if (!teamDef) {
            return;
        }

        const layout: TeamDetailLayout = {
            col: DETAIL_COL,
            row: DETAIL_ROW,
        };

        renderTeamDetailPanel(this.ctx.grid, layout, teamDef.id, this.previewPlayers(teamDef.id), {
            budget: startingBudgetForTeam(teamDef, this.ctx.config.economy),
            arenaSeats: teamArenaSeats(teamDef.id, null, this.ctx.config),
        });
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
                const state = createNewGame(this.ctx.config, this.seed, teamDef.id, 'hard');
                generateAmbitionSponsorOffers(state, this.ctx.config.economy, createRng(this.seed).fork('sponsors-initial'));
                this.ctx.session = { state, lastRound: null };
                this.ctx.screens.reset(
                    new SponsorChoiceScreen(this.ctx, () => {
                        this.ctx.screens.reset(new DashboardScreen(this.ctx));
                    }),
                );
            }
        }
    }

    render(): void {
        this.table.setData(
            [
                { header: t('col.abbr'), width: 4 },
                { header: t('col.team'), width: 18 },
                { header: t('col.rating'), width: 6, align: 'right' },
            ],
            this.ctx.config.league.teams.map((teamDef) => ({
                cells: [teamDef.abbr, teamDisplayName(teamDef), String(this.teamRating(teamDef.id))],
            })),
        );
        drawChrome(this.ctx, t('teamSelect.title'), [t('hint.navigate'), t('hint.select'), t('hint.back')]);
        const grid = this.ctx.grid;
        grid.put(TEAM_TABLE_COL, 2, ROLE.textDim, t('teamSelect.hint'));
        grid.fillCells(0, TEAM_TABLE_ROW, LEGACY_CREST_COLS, 1 + this.table.layoutVisibleRows, ROLE.bg);
        this.table.render(grid);
        const selectedTeam = this.ctx.config.league.teams[this.table.selected];
        if (selectedTeam) {
            const crestRow = TEAM_TABLE_ROW + 1 + (this.table.selected - this.table.scrollOffset);
            drawTeamCrest(grid, selectedTeam.id, TEAM_TABLE_COL - LEGACY_CREST_COLS, crestRow);
        }
        this.renderDetail(this.table.selected);
    }
}
