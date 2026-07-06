import type { LeagueConfig } from '../config/league';
import { computeStandings } from './league/standings';
import type { Fixture, GameState, PlayoffSeries, PlayoffState, TeamId } from './model/types';

/**
 * Seeds the post-season bracket from the regular-season table. Bracket order
 * keeps re-seeding implicit: slots pair (1v8, 4v5, 2v7, 3v6), so consecutive
 * winners meet in the next stage.
 */
export function startPlayoffs(state: GameState, league: LeagueConfig): PlayoffState {
    const standings = computeStandings(Object.keys(state.teams), state.fixtures);
    const qualified = standings.slice(0, league.playoffs.teams).map((row) => row.teamId);
    const seeds: Record<TeamId, number> = {};
    qualified.forEach((teamId, index) => {
        seeds[teamId] = index + 1;
    });
    // Pairings by seed number, in bracket order.
    const pairs: Array<[number, number]> = [
        [1, 8],
        [4, 5],
        [2, 7],
        [3, 6],
    ].slice(0, league.playoffs.teams / 2) as Array<[number, number]>;
    const series: PlayoffSeries[] = pairs.map(([high, low], slot) => ({
        id: `PO0-${slot}`,
        stage: 0,
        slot,
        homeTeamId: qualified[high - 1] as TeamId,
        awayTeamId: qualified[low - 1] as TeamId,
        homeWins: 0,
        awayWins: 0,
        games: [],
    }));
    const playoffs: PlayoffState = { stage: 0, seeds, series, championTeamId: null };
    state.playoffs = playoffs;
    return playoffs;
}

export function winsNeeded(stage: number, league: LeagueConfig): number {
    return league.playoffs.winsNeeded[stage] ?? 3;
}

export function seriesDecided(series: PlayoffSeries, league: LeagueConfig): boolean {
    const needed = winsNeeded(series.stage, league);
    return series.homeWins >= needed || series.awayWins >= needed;
}

export function seriesWinner(series: PlayoffSeries, league: LeagueConfig): TeamId | null {
    const needed = winsNeeded(series.stage, league);
    if (series.homeWins >= needed) {
        return series.homeTeamId;
    }
    if (series.awayWins >= needed) {
        return series.awayTeamId;
    }
    return null;
}

/** Undecided series of the current stage (each plays one game per round). */
export function activeSeries(state: GameState, league: LeagueConfig): PlayoffSeries[] {
    const playoffs = state.playoffs;
    if (!playoffs || playoffs.championTeamId) {
        return [];
    }
    return playoffs.series.filter((s) => s.stage === playoffs.stage && !seriesDecided(s, league));
}

/** Builds the next game of a series: the higher seed hosts odd games. */
export function nextSeriesFixture(series: PlayoffSeries): Fixture {
    const gameNumber = series.games.length + 1;
    const highSeedHome = gameNumber % 2 === 1;
    return {
        id: `${series.id}-G${gameNumber}`,
        round: 0,
        homeTeamId: highSeedHome ? series.homeTeamId : series.awayTeamId,
        awayTeamId: highSeedHome ? series.awayTeamId : series.homeTeamId,
        result: null,
    };
}

/** Books a finished game into its series score. */
export function recordSeriesGame(series: PlayoffSeries, fixture: Fixture): void {
    series.games.push(fixture);
    const result = fixture.result;
    if (!result) {
        return;
    }
    const courtHomeWon = result.homeScore > result.awayScore;
    const winnerId = courtHomeWon ? fixture.homeTeamId : fixture.awayTeamId;
    if (winnerId === series.homeTeamId) {
        series.homeWins++;
    } else {
        series.awayWins++;
    }
}

/**
 * When every series of the current stage is decided, pairs consecutive
 * bracket winners into the next stage — or crowns the champion.
 */
export function maybeAdvanceStage(state: GameState, league: LeagueConfig): void {
    const playoffs = state.playoffs;
    if (!playoffs || playoffs.championTeamId) {
        return;
    }
    const stageSeries = playoffs.series.filter((s) => s.stage === playoffs.stage);
    if (stageSeries.length === 0 || !stageSeries.every((s) => seriesDecided(s, league))) {
        return;
    }
    const winners = stageSeries
        .sort((a, b) => a.slot - b.slot)
        .map((s) => seriesWinner(s, league) as TeamId);
    if (winners.length === 1) {
        playoffs.championTeamId = winners[0] as TeamId;
        return;
    }
    const nextStage = playoffs.stage + 1;
    for (let slot = 0; slot * 2 < winners.length; slot++) {
        const a = winners[slot * 2] as TeamId;
        const b = winners[slot * 2 + 1] as TeamId;
        // The better original seed keeps home court.
        const [home, away] = (playoffs.seeds[a] ?? 99) <= (playoffs.seeds[b] ?? 99) ? [a, b] : [b, a];
        playoffs.series.push({
            id: `PO${nextStage}-${slot}`,
            stage: nextStage,
            slot,
            homeTeamId: home,
            awayTeamId: away,
            homeWins: 0,
            awayWins: 0,
            games: [],
        });
    }
    playoffs.stage = nextStage;
}

/** The user's undecided series in the current stage, if any. */
export function userActiveSeries(state: GameState, league: LeagueConfig): PlayoffSeries | null {
    return (
        activeSeries(state, league).find(
            (s) => s.homeTeamId === state.userTeamId || s.awayTeamId === state.userTeamId,
        ) ?? null
    );
}
