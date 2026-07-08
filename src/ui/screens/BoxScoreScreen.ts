import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import type { Fixture, GameState, MatchSummary, PlayerId } from '../../core/model/types';
import { t } from '../../i18n';
import { buildBoxColumns, boxScoreRows, quarterScoreLine } from '../boxscore';
import { drawChrome } from '../chrome';
import { shortPlayerName, teamDef } from '../format';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';

export interface BoxScoreScreenOptions {
    injuryNote?: string | null;
}

/** Full post-match box score for home and away teams. */
export class BoxScoreScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly fixture: Fixture;
    private readonly summary: MatchSummary;
    private readonly onContinue: () => void;
    private readonly injuryNote: string | null;
    private readonly table: DataTable;
    private viewingHome: boolean;

    constructor(
        ctx: AppContext,
        fixture: Fixture,
        summary: MatchSummary,
        onContinue: () => void,
        options?: BoxScoreScreenOptions,
    ) {
        this.ctx = ctx;
        this.fixture = fixture;
        this.summary = summary;
        this.onContinue = onContinue;
        this.injuryNote = options?.injuryNote ?? null;
        const session = ctx.session;
        const userTeamId = session?.state.userTeamId ?? fixture.homeTeamId;
        this.viewingHome = fixture.homeTeamId === userTeamId;
        this.table = new DataTable({ col: 2, row: 8, visibleRows: 12 }, false);
        this.refreshTable();
    }

    private get state() {
        const session = this.ctx.session;
        if (!session) {
            throw new Error('BoxScoreScreen: no session');
        }
        return session.state;
    }

    private activeTeamId(): string {
        return this.viewingHome ? this.fixture.homeTeamId : this.fixture.awayTeamId;
    }

    private refreshTable(): void {
        const teamId = this.activeTeamId();
        const highlight = new Set<PlayerId>(this.state.teams[this.state.userTeamId]?.playerIds ?? []);
        this.table.setData(buildBoxColumns(), boxScoreRows(this.state, teamId, this.summary.box, highlight));
    }

    update(input: UiInputFrame): void {
        if (input.confirm || input.cancel) {
            this.ctx.screens.pop();
            this.onContinue();
            return;
        }
        if (input.left) {
            this.viewingHome = true;
            this.refreshTable();
        }
        if (input.right) {
            this.viewingHome = false;
            this.refreshTable();
        }
        this.table.update(input, this.ctx.grid);
    }

    render(): void {
        const grid = this.ctx.grid;
        const home = teamDef(this.fixture.homeTeamId);
        const away = teamDef(this.fixture.awayTeamId);
        drawChrome(this.ctx, t('boxscore.title'), [t('hint.pages'), t('report.continue'), t('hint.back')]);

        grid.put(2, 2, ROLE.header, t('report.final'));
        grid.put(2, 3, ROLE.textBright,
            `${home.shortName} ${this.summary.homeScore} : ${this.summary.awayScore} ${away.shortName}`);
        grid.put(2, 4, ROLE.textDim, quarterScoreLine(this.summary));

        const tabLabel = this.viewingHome
            ? `<< ${t('boxscore.home')}: ${home.abbr} >>`
            : `<< ${t('boxscore.away')}: ${away.abbr} >>`;
        grid.put(2, 6, ROLE.accent, tabLabel);

        if (this.injuryNote) {
            grid.put(2, 7, ROLE.danger, this.injuryNote);
        }

        this.table.render(grid);
        grid.put(2, grid.rows - 2, ROLE.textDim, t('report.continue'));
    }
}

/** Build injury note text from injured player id and rounds out. */
export function injuryNoteFrom(
    state: GameState,
    injuredId: string | null | undefined,
    rounds: number | undefined,
): string | null {
    if (!injuredId || !rounds) {
        return null;
    }
    const player = state.players[injuredId];
    if (!player) {
        return null;
    }
    return t('report.injury', { player: shortPlayerName(player), rounds });
}
