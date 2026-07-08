import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { createNewGame } from '../../core/game';
import { realArenaCapacity, startingBudgetForTeam, generateAmbitionSponsorOffers } from '../../core/economy';
import { generateLeague, type GeneratedLeague } from '../../core/league/generate';
import type { Player } from '../../core/model/types';
import { overallRating, POSITIONS } from '../../core/model/types';
import { createRng } from '../../core/rng';
import { t, teamArenaName, teamCityName, teamDisplayName } from '../../i18n';
import { drawChrome } from '../chrome';
import { formatMoney, shortPlayerName } from '../format';
import { ROLE } from '../theme';
import { padLeft, padRight } from '../text';
import { DataTable } from '../widgets/DataTable';
import { DashboardScreen } from './DashboardScreen';
import { SponsorChoiceScreen } from './SponsorChoiceScreen';

const TEAM_TABLE_COL = 2;
const TEAM_TABLE_ROW = 4;
// Legacy crest sprites were 16x16 in a two-column band immediately left of the table.
const LEGACY_CREST_COLS = 2;
// Table columns total 30 cells (4+1+18+1+6); leave a visible gap before the detail panel.
const TEAM_TABLE_WIDTH = 30;
const DETAIL_GAP = 6;
const DETAIL_FRAME_COL = TEAM_TABLE_COL + TEAM_TABLE_WIDTH + DETAIL_GAP;
const DETAIL_COL = DETAIL_FRAME_COL + 1;
const DETAIL_ROW = 4;
const DETAIL_WIDTH = 38;
const NAME_WIDTH = 18;
const POS_WIDTH = 3;
const OVR_WIDTH = 3;

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

    private teamPlayers(teamId: string): Player[] {
        const team = this.preview.teams[teamId];
        if (!team) {
            return [];
        }
        const posOrder = Object.fromEntries(POSITIONS.map((pos, index) => [pos, index]));
        return team.playerIds
            .map((id) => this.preview.players[id])
            .filter((p): p is Player => p !== undefined)
            .sort((a, b) => {
                const posDiff = (posOrder[a.position] ?? 99) - (posOrder[b.position] ?? 99);
                if (posDiff !== 0) {
                    return posDiff;
                }
                return overallRating(b.attributes) - overallRating(a.attributes);
            });
    }

    private arenaSeats(teamId: string): number {
        const real = realArenaCapacity(this.ctx.config.league, teamId);
        if (real) {
            return real;
        }
        return this.ctx.config.economy.facilities.arenaCapacityByLevel[0] ?? 1500;
    }

    /** Overpaint the old logo band so crest pixels cannot bleed into ID cells. */
    private wipeLegacyCrestBand(): void {
        const grid = this.ctx.grid;
        const tableRow = this.table.layoutRow;
        const scroll = this.table.scrollOffset;
        const visible = this.table.layoutVisibleRows;
        const rowCount = this.ctx.config.league.teams.length;
        const wipePx = grid.cellW * (TEAM_TABLE_COL + LEGACY_CREST_COLS);

        grid.fillCells(0, tableRow, TEAM_TABLE_COL + LEGACY_CREST_COLS, 1, ROLE.panel);

        const end = Math.min(rowCount, scroll + visible);
        for (let i = scroll; i < end; i++) {
            const screenRow = tableRow + 1 + (i - scroll);
            const isSelected = i === this.table.selected;
            const color = isSelected ? ROLE.highlight : ROLE.bg;
            const origin = grid.px(0, screenRow);
            grid.fillPixels(origin.x, origin.y, wipePx, grid.cellH, color);
        }
    }

    private renderDetail(selected: number): void {
        const grid = this.ctx.grid;
        const teamDef = this.ctx.config.league.teams[selected];
        if (!teamDef) {
            return;
        }

        grid.put(
            DETAIL_COL,
            DETAIL_ROW,
            ROLE.header,
            `${teamDisplayName(teamDef)} - ${teamCityName(teamDef)}`,
        );
        grid.put(
            DETAIL_COL,
            DETAIL_ROW + 1,
            ROLE.text,
            t('teamSelect.arena', { name: teamArenaName(teamDef), n: this.arenaSeats(teamDef.id) }),
        );
        grid.put(
            DETAIL_COL,
            DETAIL_ROW + 2,
            ROLE.accent,
            t('teamSelect.budget', { amount: formatMoney(startingBudgetForTeam(teamDef, this.ctx.config.economy)) }),
        );
        grid.put(DETAIL_COL, DETAIL_ROW + 3, ROLE.textDim, '-'.repeat(DETAIL_WIDTH - 2));
        grid.put(DETAIL_COL, DETAIL_ROW + 4, ROLE.header, t('teamSelect.roster'));
        grid.put(
            DETAIL_COL,
            DETAIL_ROW + 5,
            ROLE.textDim,
            `${padRight(t('col.name'), NAME_WIDTH)} ${padRight(t('col.pos'), POS_WIDTH)} ${padLeft(t('col.ovr'), OVR_WIDTH)}`,
        );

        const players = this.teamPlayers(teamDef.id);
        for (let i = 0; i < players.length; i++) {
            const player = players[i] as Player;
            const line = `${padRight(shortPlayerName(player), NAME_WIDTH)} ${padRight(player.position, POS_WIDTH)} ${padLeft(String(overallRating(player.attributes)), OVR_WIDTH)}`;
            grid.put(DETAIL_COL, DETAIL_ROW + 6 + i, ROLE.text, line);
        }
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
        grid.fillCells(0, 2, TEAM_TABLE_COL + LEGACY_CREST_COLS, 1, ROLE.bg);
        grid.put(TEAM_TABLE_COL, 2, ROLE.textDim, t('teamSelect.hint'));
        this.table.render(grid);
        this.wipeLegacyCrestBand();
        this.renderDetail(this.table.selected);
    }
}
