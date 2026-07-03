import { describe, expect, it } from 'vitest';
import { balanceConfig } from '../src/config/balance';
import { leagueConfig } from '../src/config/league';
import { namePools } from '../src/config/names';
import { validateAllConfigs } from '../src/config';
import { advanceRound, createNewGame, isSeasonOver, seasonRounds, type GameConfig } from '../src/core/game';
import { computeStandings } from '../src/core/league/standings';
import { overallRating, POSITIONS } from '../src/core/model/types';

const config: GameConfig = { league: leagueConfig, balance: balanceConfig, names: namePools };

describe('config', () => {
    it('all shipped configs validate', () => {
        expect(() => validateAllConfigs()).not.toThrow();
    });
});

describe('createNewGame', () => {
    const state = createNewGame(config, 777, 'PRG');

    it('generates a full league', () => {
        expect(Object.keys(state.teams)).toHaveLength(12);
        expect(Object.keys(state.players)).toHaveLength(12 * leagueConfig.playersPerTeam);
        for (const team of Object.values(state.teams)) {
            expect(team.playerIds).toHaveLength(leagueConfig.playersPerTeam);
            // Starters cover all five positions with roster players.
            for (const position of POSITIONS) {
                const starterId = team.tactics.starters[position];
                expect(team.playerIds).toContain(starterId);
            }
        }
    });

    it('keeps attributes within bounds', () => {
        for (const player of Object.values(state.players)) {
            const overall = overallRating(player.attributes);
            expect(overall).toBeGreaterThanOrEqual(balanceConfig.playerGen.attributeMin);
            expect(overall).toBeLessThanOrEqual(balanceConfig.playerGen.attributeMax);
            expect(player.age).toBeGreaterThanOrEqual(balanceConfig.playerGen.ageMin);
            expect(player.age).toBeLessThanOrEqual(balanceConfig.playerGen.ageMax);
        }
    });

    it('is deterministic per seed', () => {
        const again = createNewGame(config, 777, 'PRG');
        expect(again).toEqual(state);
        const different = createNewGame(config, 778, 'PRG');
        expect(different.players).not.toEqual(state.players);
    });

    it('rejects unknown teams', () => {
        expect(() => createNewGame(config, 1, 'NOPE')).toThrow();
    });
});

describe('full season', () => {
    it('plays out deterministically with consistent standings', () => {
        const runSeason = () => {
            const state = createNewGame(config, 2024, 'BRN');
            while (!isSeasonOver(state, config)) {
                advanceRound(state, config);
            }
            return state;
        };
        const state = runSeason();
        const rounds = seasonRounds(state, config);
        expect(rounds).toBe(22);
        expect(state.fixtures.every((f) => f.result !== null)).toBe(true);

        const standings = computeStandings(Object.keys(state.teams), state.fixtures);
        let totalWins = 0;
        let totalFor = 0;
        let totalAgainst = 0;
        for (const row of standings) {
            expect(row.played).toBe(22);
            expect(row.wins + row.losses).toBe(22);
            totalWins += row.wins;
            totalFor += row.pointsFor;
            totalAgainst += row.pointsAgainst;
        }
        expect(totalWins).toBe(state.fixtures.length);
        expect(totalFor).toBe(totalAgainst);

        // Determinism across the whole season.
        expect(runSeason()).toEqual(state);
    });

    it('refuses to advance past the season end', () => {
        const state = createNewGame(config, 3, 'PRG');
        while (!isSeasonOver(state, config)) {
            advanceRound(state, config);
        }
        expect(() => advanceRound(state, config)).toThrow();
    });
});
