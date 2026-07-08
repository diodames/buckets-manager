import { leagueConfig } from '../../config/league';
import type { Fixture, GameState, StandingsRow, TeamId } from '../model/types';

/** Fixtures that count toward the NBL table (excludes BCL and playoffs). */
export function nblFixtures(fixtures: readonly Fixture[]): Fixture[] {
    return fixtures.filter((f) => !f.competitionId || f.competitionId === 'nbl');
}

/** Configured NBL clubs present in the save. */
export function nblTeamIds(state: GameState): TeamId[] {
    return leagueConfig.teams.map((t) => t.id).filter((id) => state.teams[id]);
}

/** NBL regular-season standings only. */
export function computeNblStandings(state: GameState): StandingsRow[] {
    return computeStandings(nblTeamIds(state), nblFixtures(state.fixtures));
}

/**
 * Standings derived from played fixtures. Sort: wins desc, then point
 * difference desc, then points scored desc, then id for stability.
 */
export function computeStandings(teamIds: readonly TeamId[], fixtures: readonly Fixture[]): StandingsRow[] {
    const rows = new Map<TeamId, StandingsRow>();
    for (const id of teamIds) {
        rows.set(id, { teamId: id, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 });
    }
    for (const fixture of fixtures) {
        const result = fixture.result;
        if (!result) {
            continue;
        }
        const home = rows.get(fixture.homeTeamId);
        const away = rows.get(fixture.awayTeamId);
        if (!home || !away) {
            throw new Error(`computeStandings: fixture ${fixture.id} references unknown team`);
        }
        home.played++;
        away.played++;
        home.pointsFor += result.homeScore;
        home.pointsAgainst += result.awayScore;
        away.pointsFor += result.awayScore;
        away.pointsAgainst += result.homeScore;
        if (result.homeScore > result.awayScore) {
            home.wins++;
            away.losses++;
        } else {
            away.wins++;
            home.losses++;
        }
    }
    return [...rows.values()].sort((a, b) => {
        if (b.wins !== a.wins) {
            return b.wins - a.wins;
        }
        const diffA = a.pointsFor - a.pointsAgainst;
        const diffB = b.pointsFor - b.pointsAgainst;
        if (diffB !== diffA) {
            return diffB - diffA;
        }
        if (b.pointsFor !== a.pointsFor) {
            return b.pointsFor - a.pointsFor;
        }
        return a.teamId < b.teamId ? -1 : 1;
    });
}
