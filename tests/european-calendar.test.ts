import { describe, expect, it } from 'vitest';
import { checkBclPhaseAdvancement, isBclRegularSeasonComplete, startBclSeason } from '../src/core/bcl/index';
import { ensurePlayoffs, isEuropeanCalendarComplete, createNewGame } from '../src/core/game';
import { generateBclClubs } from '../src/core/league/generate';
import { createRng } from '../src/core/rng';
import { testConfig as config } from './helpers';

describe('european calendar', () => {
    it('does not seed NBL playoffs while BCL is still active', () => {
        const state = createNewGame(config, 9901, 'NYM');
        state.currentRound = 23;
        state.competitions.bcl = {
            id: 'bcl',
            phase: 'regularSeason',
            fixtures: [{ id: 'bcl-pending', homeTeamId: 'NYM', awayTeamId: 'BCL-RYT', result: null, round: 1, week: 24, competitionId: 'bcl' }],
            groups: [],
            playoffs: null,
            qualifyingSeries: null,
            qualifyingEntrantId: null,
            qualifyingOpponentId: null,
            qualifiedTeamIds: [],
            championTeamId: null,
            prizePaid: false,
            weeklyPrizePaidTotal: 0,
            userFinish: null,
        };
        expect(isEuropeanCalendarComplete(state, config)).toBe(false);
        ensurePlayoffs(state, config);
        expect(state.playoffs).toBeNull();
    });

    it('seeds NBL playoffs once European competitions are complete', () => {
        const state = createNewGame(config, 9902, 'NYM');
        state.currentRound = 23;
        state.competitions.bcl = {
            id: 'bcl',
            phase: 'complete',
            fixtures: [],
            groups: [],
            playoffs: null,
            qualifyingSeries: null,
            qualifyingEntrantId: null,
            qualifyingOpponentId: null,
            qualifiedTeamIds: [],
            championTeamId: 'BCL-RYT',
            prizePaid: false,
            weeklyPrizePaidTotal: 0,
            userFinish: 'groupStage',
        };
        ensurePlayoffs(state, config);
        expect(state.playoffs).not.toBeNull();
    });

    it('advances BCL phase when regular season fixtures are complete but phase is stuck', () => {
        const state = createNewGame(config, 9903, 'NYM');
        state.currentRound = 23;
        for (const f of state.fixtures) {
            f.result = {
                homeScore: 80,
                awayScore: 75,
                quarterScores: [[20, 18], [20, 19], [20, 19], [20, 19]],
                box: {},
                seed: 1,
            };
        }
        generateBclClubs(state, config.bcl, config.balance, config.names, state.seasonYear, createRng(42).fork('bcl-gen'));
        const comp = startBclSeason(state, config.bcl, config.league, createRng(42).fork('bcl-start'));
        expect(comp).not.toBeNull();
        for (const fixture of comp!.fixtures) {
            if (!fixture.result) {
                fixture.result = {
                    homeScore: 82,
                    awayScore: 78,
                    quarterScores: [[20, 19], [21, 20], [20, 19], [21, 20]],
                    box: {},
                    seed: 2,
                };
            }
        }
        expect(isBclRegularSeasonComplete(comp!)).toBe(true);
        expect(isEuropeanCalendarComplete(state, config)).toBe(false);

        checkBclPhaseAdvancement(state, config.bcl, config.league, createRng(99));

        expect(state.competitions.bcl?.phase).not.toBe('regularSeason');
    });
});
