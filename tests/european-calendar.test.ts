import { describe, expect, it } from 'vitest';
import { ensurePlayoffs, isEuropeanCalendarComplete, createNewGame } from '../src/core/game';
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
});
