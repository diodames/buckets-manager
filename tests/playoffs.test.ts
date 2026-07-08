import { describe, expect, it } from 'vitest';
import { leagueConfig } from '../src/config/league';
import { advanceRoundInstant, createNewGame, isCampaignOver, isSeasonOver } from '../src/core/game';
import { computeNblStandings } from '../src/core/league/standings';
import { seriesDecided, startPlayoffs, winsNeeded } from '../src/core/playoffs';
import { testConfig as config } from './helpers';

function playRegularSeason(seed: number, teamId: string) {
    const state = createNewGame(config, seed, teamId);
    while (!isSeasonOver(state, config)) {
        advanceRoundInstant(state, config);
    }
    return state;
}

describe('playoffs', () => {
    it('seeds the top 8 of the table into bracket pairings', () => {
        const state = playRegularSeason(50, 'NYM');
        const standings = computeNblStandings(state);
        const playoffs = startPlayoffs(state, leagueConfig);

        expect(playoffs.series).toHaveLength(4);
        const top8 = standings.slice(0, 8).map((r) => r.teamId);
        for (const series of playoffs.series) {
            expect(top8).toContain(series.homeTeamId);
            expect(top8).toContain(series.awayTeamId);
            // Higher seed holds home court.
            expect(playoffs.seeds[series.homeTeamId] ?? 99).toBeLessThan(playoffs.seeds[series.awayTeamId] ?? 0);
        }
        // Classic pairings: 1v8, 4v5, 2v7, 3v6 in bracket order.
        expect(playoffs.series[0]?.homeTeamId).toBe(top8[0]);
        expect(playoffs.series[0]?.awayTeamId).toBe(top8[7]);
        expect(playoffs.series[2]?.homeTeamId).toBe(top8[1]);
        expect(playoffs.series[2]?.awayTeamId).toBe(top8[6]);
    });

    it('plays series to the required wins and crowns a champion deterministically', () => {
        const run = () => {
            const state = playRegularSeason(51, 'NYM');
            let guard = 0;
            while (!isCampaignOver(state, config) && guard++ < 60) {
                advanceRoundInstant(state, config);
            }
            return state;
        };
        const state = run();
        const playoffs = state.playoffs;
        expect(playoffs?.championTeamId).toBeTruthy();
        expect(playoffs?.thirdPlaceTeamId).toBeTruthy();
        for (const series of playoffs?.series ?? []) {
            const needed = winsNeeded(series.stage, leagueConfig);
            expect(seriesDecided(series, leagueConfig)).toBe(true);
            expect(Math.max(series.homeWins, series.awayWins)).toBe(needed);
            expect(Math.min(series.homeWins, series.awayWins)).toBeLessThan(needed);
            expect(series.games.length).toBe(series.homeWins + series.awayWins);
        }
        // Stages: 4 QF + 2 SF + 1 F series.
        expect(playoffs?.series.filter((s) => s.stage === 0)).toHaveLength(4);
        expect(playoffs?.series.filter((s) => s.stage === 1)).toHaveLength(2);
        expect(playoffs?.series.filter((s) => s.stage === 2)).toHaveLength(1);
        // Determinism.
        expect(run().playoffs?.championTeamId).toBe(playoffs?.championTeamId);
    });

    it('playoff games never leak into the regular-season standings', () => {
        const state = playRegularSeason(52, 'BRN');
        const before = computeNblStandings(state);
        let guard = 0;
        while (!isCampaignOver(state, config) && guard++ < 60) {
            advanceRoundInstant(state, config);
        }
        const after = computeNblStandings(state);
        expect(after).toEqual(before);
        expect(state.fixtures).toHaveLength(132);
    });
});
