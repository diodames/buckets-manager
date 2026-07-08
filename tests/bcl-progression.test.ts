import { describe, expect, it } from 'vitest';
import {
    isBclR16Complete,
    isBclRegularSeasonComplete,
    maybeStartBclKnockout,
    resolveGroupFixtures,
    startBclSeason,
    userBclSeries,
} from '../src/core/bcl/index';
import { completeRound, createNewGame } from '../src/core/game';
import { computeStandings } from '../src/core/league/standings';
import { generateBclClubs } from '../src/core/league/generate';
import { deserializeSave, serializeSave } from '../src/core/save/save';
import { createRng } from '../src/core/rng';
import type { CompetitionState, GameState } from '../src/core/model/types';
import { testConfig as config } from './helpers';

function startBclForTest(state: GameState): CompetitionState {
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
    return comp!;
}

function simBclWeeks(state: GameState, throughWeek: number): void {
    while (state.calendarWeek <= throughWeek) {
        completeRound(state, config, null);
    }
}

describe('BCL progression', () => {
    it('updates group standings after fixtures are simulated', () => {
        const state = createNewGame(config, 9101, 'NYM');
        startBclForTest(state);
        state.bclQualified = true;

        simBclWeeks(state, 11);
        const bcl = state.competitions.bcl!;
        const group = bcl.groups[0]!;
        const standings = computeStandings(group.teamIds, resolveGroupFixtures(bcl, group));
        const totalPlayed = standings.reduce((sum, row) => sum + row.played, 0);
        expect(totalPlayed).toBeGreaterThan(0);
        expect(bcl.phase).toBe('regularSeason');
    });

    it('keeps standings in sync after save/load round-trip', () => {
        const state = createNewGame(config, 9102, 'NYM');
        startBclForTest(state);
        simBclWeeks(state, 4);

        const loaded = deserializeSave(serializeSave(state, 'test', new Date().toISOString())).state;
        const bcl = loaded.competitions.bcl!;

        const group = bcl.groups[0]!;
        const before = computeStandings(group.teamIds, resolveGroupFixtures(bcl, group));
        const playedBefore = before.reduce((sum, row) => sum + row.played, 0);
        expect(playedBefore).toBeGreaterThan(0);

        completeRound(loaded, config, null);
        const after = computeStandings(group.teamIds, resolveGroupFixtures(bcl, group));
        const playedAfter = after.reduce((sum, row) => sum + row.played, 0);
        expect(playedAfter).toBeGreaterThanOrEqual(playedBefore);
    });

    it('does not advance from an empty regular-season fixture list', () => {
        const comp: CompetitionState = {
            id: 'bcl',
            phase: 'regularSeason',
            fixtures: [],
            groups: [{ id: 'BCL-G0', teamIds: ['NYM'], fixtures: [] }],
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
        expect(isBclRegularSeasonComplete(comp)).toBe(false);
    });

    it('does not start knockouts until R16 fixtures are played', () => {
        const state = createNewGame(config, 9103, 'NYM');
        startBclForTest(state);
        simBclWeeks(state, 12);
        expect(state.competitions.bcl!.phase).toBe('roundOf16');
        expect(isBclR16Complete(state.competitions.bcl!, config.bcl)).toBe(false);
        maybeStartBclKnockout(state, config.bcl, config.league, createRng(1));
        expect(state.competitions.bcl!.playoffs).toBeNull();
    });

    it('auto-simulates AI knockout series when the user is eliminated', () => {
        const state = createNewGame(config, 9104, 'NYM');
        startBclForTest(state);
        state.bclQualified = false;
        simBclWeeks(state, 24);

        const bcl = state.competitions.bcl!;
        if (!bcl.playoffs) {
            maybeStartBclKnockout(state, config.bcl, config.league, createRng(99));
        }

        let safety = 0;
        while (bcl.phase !== 'complete' && safety < 80) {
            completeRound(state, config, null);
            safety++;
        }
        expect(bcl.phase).toBe('complete');
        expect(bcl.championTeamId).not.toBeNull();
        expect(userBclSeries(state, config.bcl)).toBeNull();
    });

    it('archives regular-season groups when advancing to R16', () => {
        const state = createNewGame(config, 9105, 'NYM');
        startBclForTest(state);
        simBclWeeks(state, 12);
        const bcl = state.competitions.bcl!;
        expect(bcl.archivedGroups?.length).toBe(8);
        expect(bcl.groups.length).toBe(4);
    });
});
