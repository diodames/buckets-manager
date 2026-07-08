import { describe, expect, it } from 'vitest';
import { leagueConfig } from '../src/config/league';
import { generateBclClubs } from '../src/core/league/generate';
import { computeNblStandings, computeStandings } from '../src/core/league/standings';
import { createNewGame } from '../src/core/game';
import { startBclSeason } from '../src/core/bcl/index';
import { createRng } from '../src/core/rng';
import { isNblTeam } from '../src/core/teams';
import { testConfig as config } from './helpers';

describe('standings separation', () => {
    it('NBL standings include only NBL clubs after BCL teams are added', () => {
        const state = createNewGame(config, 9001, 'NYM');
        generateBclClubs(state, config.bcl, config.balance, config.names, state.seasonYear, createRng(42));
        startBclSeason(state, config.bcl, config.league, createRng(43));

        const standings = computeNblStandings(state);
        expect(standings).toHaveLength(leagueConfig.teams.length);
        for (const row of standings) {
            expect(isNblTeam(row.teamId)).toBe(true);
        }
        const bclOnly = Object.keys(state.teams).filter((id) => !isNblTeam(id));
        expect(bclOnly.length).toBeGreaterThan(0);
        for (const id of bclOnly) {
            expect(standings.some((r) => r.teamId === id)).toBe(false);
        }
    });

    it('BCL fixtures never affect the NBL table', () => {
        const state = createNewGame(config, 9002, 'NYM');
        const before = computeNblStandings(state);
        generateBclClubs(state, config.bcl, config.balance, config.names, state.seasonYear, createRng(44));
        startBclSeason(state, config.bcl, config.league, createRng(45));

        const bcl = state.competitions.bcl;
        expect(bcl).toBeTruthy();
        for (const fixture of bcl!.fixtures) {
            fixture.result = {
                homeScore: 80,
                awayScore: 70,
                quarterScores: [[20, 18], [20, 17], [20, 18], [20, 17]],
                box: {},
                seed: 1,
            };
        }

        const after = computeNblStandings(state);
        expect(after).toEqual(before);
        expect(computeStandings(Object.keys(state.teams), state.fixtures)).not.toEqual(before);
    });
});
