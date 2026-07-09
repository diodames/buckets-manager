import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { computeNblStandings, computeStandings } from '../../core/league/standings';
import type { GameState } from '../../core/model/types';
import { isNblTeam } from '../../core/teams';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import {
    europeanClubLine,
    foreignCapLine,
    playersForTeam,
    renderTeamDetailPanel,
    teamArenaSeats,
    teamBudget,
    type TeamDetailLayout,
} from '../teamDetail';

const DETAIL_COL = 4;
const DETAIL_ROW = 4;
const CREST_COL = 2;
const CREST_ROW = 4;

/** Read-only team profile (budget, roster, standings context). */
export class TeamDetailScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly teamId: string;
    private readonly standingsRow: { wins: number; losses: number; diff: number } | null;

    constructor(ctx: AppContext, teamId: string, standingsRow?: { wins: number; losses: number; diff: number } | null) {
        this.ctx = ctx;
        this.teamId = teamId;
        this.standingsRow = standingsRow ?? null;
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
        }
    }

    render(): void {
        const session = this.ctx.session;
        if (!session) {
            return;
        }
        const state = session.state;
        const players = playersForTeam(state, this.teamId);
        const budget = teamBudget(state, this.teamId, this.ctx.config);
        const record = this.standingsRow ?? this.findStandingsRecord(state);
        const recordLine = record
            ? t('teamDetail.record', { wins: record.wins, losses: record.losses, diff: record.diff })
            : null;

        const layout: TeamDetailLayout = {
            col: DETAIL_COL,
            row: DETAIL_ROW,
            crestCol: CREST_COL,
            crestRow: CREST_ROW,
        };

        drawChrome(this.ctx, t('teamDetail.title'), [t('hint.back')]);

        renderTeamDetailPanel(this.ctx.grid, layout, this.teamId, players, {
            budget,
            arenaSeats: teamArenaSeats(this.teamId, state, this.ctx.config),
            recordLine,
            foreignCapLine: isNblTeam(this.teamId) ? foreignCapLine(state, this.teamId) : null,
            tierLine: budget === null ? europeanClubLine(this.teamId) : null,
        });
    }

    private findStandingsRecord(state: GameState): { wins: number; losses: number; diff: number } | null {
        if (isNblTeam(this.teamId)) {
            const row = computeNblStandings(state).find((s) => s.teamId === this.teamId);
            if (!row) {
                return null;
            }
            return {
                wins: row.wins,
                losses: row.losses,
                diff: row.pointsFor - row.pointsAgainst,
            };
        }
        const bcl = state.competitions.bcl;
        if (bcl) {
            for (const group of [...(bcl.archivedGroups ?? []), ...bcl.groups]) {
                const row = computeStandings(group.teamIds, group.fixtures).find((s) => s.teamId === this.teamId);
                if (row) {
                    return {
                        wins: row.wins,
                        losses: row.losses,
                        diff: row.pointsFor - row.pointsAgainst,
                    };
                }
            }
        }
        const fec = state.competitions.fec;
        if (fec) {
            for (const group of fec.groups) {
                const row = computeStandings(group.teamIds, group.fixtures).find((s) => s.teamId === this.teamId);
                if (row) {
                    return {
                        wins: row.wins,
                        losses: row.losses,
                        diff: row.pointsFor - row.pointsAgainst,
                    };
                }
            }
        }
        return null;
    }
}
