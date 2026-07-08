import type { BoxLine, GameState, MatchSummary, PlayerId, TeamId } from '../core/model/types';
import { t } from '../i18n';
import { shortPlayerName } from './format';
import type { TableColumn, TableRow } from './widgets/DataTable';
import { ROLE } from './theme';

export function formatShooting(made: number, att: number): string {
    return `${made}-${att}`;
}

export function buildBoxColumns(): TableColumn[] {
    return [
        { header: t('col.name'), width: 14 },
        { header: t('col.pts'), width: 3, align: 'right' },
        { header: t('col.reb'), width: 3, align: 'right' },
        { header: t('col.ast'), width: 3, align: 'right' },
        { header: t('col.stl'), width: 2, align: 'right' },
        { header: t('col.blk'), width: 2, align: 'right' },
        { header: t('col.to'), width: 2, align: 'right' },
        { header: t('col.fg'), width: 5, align: 'right' },
        { header: t('col.threePt'), width: 5, align: 'right' },
        { header: t('col.ft'), width: 4, align: 'right' },
    ];
}

export interface BoxScoreEntry {
    playerId: PlayerId;
    line: BoxLine;
}

/** Players on a team who logged box-score stats, sorted by points descending. */
export function boxScoreEntries(state: GameState, teamId: TeamId, box: MatchSummary['box']): BoxScoreEntry[] {
    const team = state.teams[teamId];
    if (!team) {
        return [];
    }
    const entries: BoxScoreEntry[] = [];
    for (const playerId of team.playerIds) {
        const line = box[playerId];
        if (!line) {
            continue;
        }
        const played =
            line.points > 0 ||
            line.fga2 > 0 ||
            line.fga3 > 0 ||
            line.fta > 0 ||
            line.rebounds > 0 ||
            line.assists > 0 ||
            line.steals > 0 ||
            line.blocks > 0 ||
            line.turnovers > 0;
        if (played) {
            entries.push({ playerId, line });
        }
    }
    return entries.sort((a, b) => b.line.points - a.line.points || a.playerId.localeCompare(b.playerId));
}

export function boxScoreRows(
    state: GameState,
    teamId: TeamId,
    box: MatchSummary['box'],
    highlightPlayerIds?: ReadonlySet<PlayerId>,
): TableRow[] {
    return boxScoreEntries(state, teamId, box).map(({ playerId, line }) => {
        const player = state.players[playerId];
        const name = player ? shortPlayerName(player) : playerId;
        const row: TableRow = {
            cells: [
                name.slice(0, 14),
                String(line.points),
                String(line.rebounds),
                String(line.assists),
                String(line.steals),
                String(line.blocks),
                String(line.turnovers),
                formatShooting(line.fgm2, line.fga2),
                formatShooting(line.fgm3, line.fga3),
                formatShooting(line.ftm, line.fta),
            ],
        };
        if (highlightPlayerIds?.has(playerId)) {
            row.color = ROLE.accent;
        }
        return row;
    });
}

export function quarterScoreLine(summary: MatchSummary): string {
    return summary.quarterScores.map(([h, a]) => `${h}:${a}`).join('  ');
}
