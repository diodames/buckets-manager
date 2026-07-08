import type { GameConfig } from './game';
import type { Fixture, GameState, Player, PlayerId } from './model/types';
import { overallRating } from './model/types';
import { resolveTeamDef } from './teams';
import { teamDisplayName } from '../i18n';

export interface MatchBriefingThreat {
    playerId: PlayerId;
    name: string;
    overall: number;
    pointsPerGame: number;
}

export interface MatchBriefing {
    opponentId: string;
    opponentName: string;
    pace: string;
    offenseFocus: string;
    defenseScheme: string;
    threats: MatchBriefingThreat[];
    injuredCount: number;
    tiredCount: number;
}

function opponentTeamId(state: GameState, fixture: Fixture): string {
    return fixture.homeTeamId === state.userTeamId ? fixture.awayTeamId : fixture.homeTeamId;
}

function recentOpponentFixtures(state: GameState, opponentId: string, limit = 5): Fixture[] {
    return state.fixtures
        .filter(
            (f) =>
                f.result &&
                (f.homeTeamId === opponentId || f.awayTeamId === opponentId) &&
                (!f.competitionId || f.competitionId === 'nbl'),
        )
        .slice(-limit);
}

function threatStats(_state: GameState, playerId: PlayerId, recent: Fixture[]): number {
    let games = 0;
    let pts = 0;
    for (const fixture of recent) {
        const line = fixture.result?.box[playerId];
        if (line) {
            games++;
            pts += line.points;
        }
    }
    return games > 0 ? pts / games : 0;
}

export function buildMatchBriefing(state: GameState, fixture: Fixture, _config: GameConfig): MatchBriefing {
    const opponentId = opponentTeamId(state, fixture);
    const team = state.teams[opponentId];
    const tactics = team?.tactics;
    const recent = recentOpponentFixtures(state, opponentId);
    const players = (team?.playerIds ?? [])
        .map((id) => state.players[id])
        .filter((p): p is Player => p !== undefined);

    const threats = players
        .map((player) => ({
            playerId: player.id,
            name: `${player.firstName} ${player.lastName}`,
            overall: overallRating(player.attributes),
            pointsPerGame: threatStats(state, player.id, recent),
        }))
        .sort((a, b) => b.overall - a.overall || b.pointsPerGame - a.pointsPerGame)
        .slice(0, 3);

    return {
        opponentId,
        opponentName: teamDisplayName(resolveTeamDef(opponentId)),
        pace: tactics?.pace ?? 'normal',
        offenseFocus: tactics?.offenseFocus ?? 'balanced',
        defenseScheme: tactics?.defenseScheme ?? 'man',
        threats,
        injuredCount: players.filter((p) => p.injury !== null).length,
        tiredCount: players.filter((p) => p.fatigue >= 55).length,
    };
}
