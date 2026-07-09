import { describe, expect, it } from 'vitest';
import {
    activeBclSeries,
    bclKnockoutLeague,
    drawBclQuarterFinals,
    isBclR16Complete,
    isBclRegularSeasonComplete,
    maybeStartBclKnockout,
    pendingBclFixtures,
    repairBclKnockout,
    resolveGroupFixtures,
    startBclSeason,
    userBclSeries,
} from '../src/core/bcl/index';
import { completeRound, createNewGame, ensurePlayoffs, isEuropeanCalendarComplete } from '../src/core/game';
import { computeStandings } from '../src/core/league/standings';
import { generateBclClubs } from '../src/core/league/generate';
import { winsNeeded } from '../src/core/playoffs';
import { deserializeSave, serializeSave } from '../src/core/save/save';
import { createRng } from '../src/core/rng';
import type { BclGroup, CompetitionState, GameState } from '../src/core/model/types';
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

    it('uses Bo3 QF and Bo1 Final Four knockout format', () => {
        expect(config.bcl.knockoutWinsNeeded).toEqual([2, 1, 1]);
        const league = bclKnockoutLeague(config.bcl);
        expect(winsNeeded(0, league)).toBe(2);
        expect(winsNeeded(1, league)).toBe(1);
        expect(winsNeeded(2, league)).toBe(1);
        expect(league.playoffs.thirdPlaceWinsNeeded).toBe(1);
    });

    it('does not return pending group fixtures during knockouts', () => {
        const state = createNewGame(config, 9106, 'NYM');
        state.competitions.bcl = {
            id: 'bcl',
            phase: 'quarterFinals',
            fixtures: [{ id: 'orphan', homeTeamId: 'NYM', awayTeamId: 'BCL-RYT', result: null, round: 1, week: 20, competitionId: 'bcl' }],
            groups: [],
            playoffs: {
                stage: 0,
                seeds: {},
                series: [{
                    id: 'BCL-QF-0', stage: 0, slot: 0,
                    homeTeamId: 'NYM', awayTeamId: 'BCL-RYT',
                    homeWins: 0, awayWins: 0, games: [],
                }],
                championTeamId: null,
                thirdPlaceSeries: null,
                thirdPlaceTeamId: null,
            },
            qualifyingSeries: null,
            qualifyingEntrantId: null,
            qualifyingOpponentId: null,
            qualifiedTeamIds: [],
            championTeamId: null,
            prizePaid: false,
            weeklyPrizePaidTotal: 0,
            userFinish: null,
        };
        expect(pendingBclFixtures(state, 20)).toEqual([]);
    });

    it('pairs QF teams from different R16 groups', () => {
        const groups: BclGroup[] = [
            { id: 'BCL-R16-A', teamIds: ['T1', 'T2', 'T3', 'T4'], fixtures: [] },
            { id: 'BCL-R16-B', teamIds: ['T5', 'T6', 'T7', 'T8'], fixtures: [] },
            { id: 'BCL-R16-C', teamIds: ['T9', 'T10', 'T11', 'T12'], fixtures: [] },
            { id: 'BCL-R16-D', teamIds: ['T13', 'T14', 'T15', 'T16'], fixtures: [] },
        ];
        const comp: CompetitionState = {
            id: 'bcl',
            phase: 'roundOf16',
            fixtures: [],
            groups,
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
        for (const group of groups) {
            for (let i = 0; i < group.teamIds.length; i++) {
                for (let j = i + 1; j < group.teamIds.length; j++) {
                    const home = group.teamIds[i]!;
                    const away = group.teamIds[j]!;
                    const fixture = {
                        id: `${group.id}-${home}-${away}`,
                        round: 1,
                        week: 14,
                        homeTeamId: home,
                        awayTeamId: away,
                        result: home < away
                            ? { homeScore: 90, awayScore: 70, quarterScores: [[22, 18], [22, 18], [23, 17], [23, 17]], box: {}, seed: 1 }
                            : { homeScore: 70, awayScore: 90, quarterScores: [[18, 22], [18, 22], [17, 23], [17, 23]], box: {}, seed: 1 },
                        competitionId: 'bcl' as const,
                    };
                    group.fixtures.push(fixture);
                    comp.fixtures.push(fixture);
                }
            }
        }
        const { series } = drawBclQuarterFinals(groups, comp, config.bcl, createRng(77));
        expect(series).toHaveLength(4);
        const groupOf = (teamId: string) => groups.find((g) => g.teamIds.includes(teamId))!.id;
        for (const s of series) {
            expect(groupOf(s.homeTeamId)).not.toBe(groupOf(s.awayTeamId));
        }
    });

    it('advances stuck knockouts when all QF series are decided', () => {
        const state = createNewGame(config, 9107, 'NYM');
        state.currentRound = 30;
        state.competitions.bcl = {
            id: 'bcl',
            phase: 'quarterFinals',
            fixtures: [],
            groups: [],
            playoffs: {
                stage: 0,
                seeds: { NYM: 1, 'BCL-RYT': 2, 'BCL-AEK': 3, 'BCL-UNI': 4, 'BCL-LLTF': 5, 'BCL-ALB': 6, 'BCL-NYM': 7, 'BCL-WUE': 8 },
                series: [
                    { id: 'BCL-QF-0', stage: 0, slot: 0, homeTeamId: 'NYM', awayTeamId: 'BCL-WUE', homeWins: 2, awayWins: 0, games: [] },
                    { id: 'BCL-QF-1', stage: 0, slot: 1, homeTeamId: 'BCL-LLTF', awayTeamId: 'BCL-ALB', homeWins: 2, awayWins: 1, games: [] },
                    { id: 'BCL-QF-2', stage: 0, slot: 2, homeTeamId: 'BCL-RYT', awayTeamId: 'BCL-NYM', homeWins: 0, awayWins: 2, games: [] },
                    { id: 'BCL-QF-3', stage: 0, slot: 3, homeTeamId: 'BCL-AEK', awayTeamId: 'BCL-UNI', homeWins: 1, awayWins: 2, games: [] },
                ],
                championTeamId: null,
                thirdPlaceSeries: null,
                thirdPlaceTeamId: null,
            },
            qualifyingSeries: null,
            qualifyingEntrantId: null,
            qualifyingOpponentId: null,
            qualifiedTeamIds: [],
            championTeamId: null,
            prizePaid: false,
            weeklyPrizePaidTotal: 0,
            userFinish: null,
        };
        expect(activeBclSeries(state, config.bcl)).toHaveLength(0);
        completeRound(state, config, null);
        expect(state.competitions.bcl!.phase).toBe('finalFour');
        expect(state.competitions.bcl!.playoffs!.stage).toBe(1);
        expect(state.competitions.bcl!.playoffs!.series.filter((s) => s.stage === 1)).toHaveLength(2);
    });

    it('repairs champion on save load when phase was stuck', () => {
        const state = createNewGame(config, 9108, 'NYM');
        state.currentRound = 30;
        state.competitions.bcl = {
            id: 'bcl',
            phase: 'quarterFinals',
            fixtures: [],
            groups: [],
            playoffs: {
                stage: 2,
                seeds: {},
                series: [],
                championTeamId: 'BCL-UNI',
                thirdPlaceSeries: null,
                thirdPlaceTeamId: null,
            },
            qualifyingSeries: null,
            qualifyingEntrantId: null,
            qualifyingOpponentId: null,
            qualifiedTeamIds: [],
            championTeamId: null,
            prizePaid: false,
            weeklyPrizePaidTotal: 0,
            userFinish: null,
        };
        const loaded = deserializeSave(serializeSave(state, 'test', new Date().toISOString())).state;
        expect(loaded.competitions.bcl!.phase).toBe('complete');
        expect(loaded.competitions.bcl!.championTeamId).toBe('BCL-UNI');
    });

    it('transitions to NBL playoffs after BCL completes', () => {
        const state = createNewGame(config, 9109, 'NYM');
        state.currentRound = 30;
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
            championTeamId: 'BCL-UNI',
            prizePaid: false,
            weeklyPrizePaidTotal: 0,
            userFinish: null,
        };
        expect(isEuropeanCalendarComplete(state, config)).toBe(true);
        ensurePlayoffs(state, config);
        expect(state.playoffs).not.toBeNull();
    });
});
