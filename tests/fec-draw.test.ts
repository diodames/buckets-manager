import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/core/game';
import { assignNblBclQualifiers } from '../src/core/bcl/index';
import { activeFecSeries, repairFecKnockout, startFecSeason } from '../src/core/fec/index';
import { startPlayoffs } from '../src/core/playoffs';
import { createRng } from '../src/core/rng';
import { testConfig as config } from './helpers';

describe('fec draw', () => {
    it('places the Czech 4th-place team in the regular-season field', () => {
        const state = createNewGame(config, 9001, 'PCE');
        state.currentRound = 23;
        startPlayoffs(state, config.league);
        state.playoffs!.championTeamId = 'NYM';
        state.playoffs!.thirdPlaceTeamId = 'BRN';
        state.playoffs!.thirdPlaceSeries = {
            id: 'PO3RD-0',
            stage: 3,
            slot: 0,
            homeTeamId: 'BRN',
            awayTeamId: 'PCE',
            homeWins: 0,
            awayWins: 2,
            games: [],
        };
        assignNblBclQualifiers(state, 2, config.league);
        const comp = startFecSeason(state, config.fec, createRng(44));
        expect(comp!.qualifiedTeamIds).toContain('PCE');
        expect(comp!.groups).toHaveLength(10);
        expect(comp!.groups.every((g) => g.teamIds.length === 4)).toBe(true);
    });

    it('repairs stuck FEC knockouts when all QF series are decided', () => {
        const state = createNewGame(config, 9002, 'PCE');
        state.competitions.fec = {
            id: 'fec',
            phase: 'quarterFinals',
            fixtures: [],
            groups: [],
            playoffs: {
                stage: 0,
                seeds: {},
                series: [
                    { id: 'FEC-QF-0', stage: 0, slot: 0, homeTeamId: 'FEC-SBB', awayTeamId: 'FEC-PBC', homeWins: 2, awayWins: 0, games: [] },
                    { id: 'FEC-QF-1', stage: 0, slot: 1, homeTeamId: 'FEC-SZOM', awayTeamId: 'FEC-UCAM', homeWins: 2, awayWins: 1, games: [] },
                    { id: 'FEC-QF-2', stage: 0, slot: 2, homeTeamId: 'FEC-REG', awayTeamId: 'FEC-BOSN', homeWins: 0, awayWins: 2, games: [] },
                    { id: 'FEC-QF-3', stage: 0, slot: 3, homeTeamId: 'FEC-PTKM', awayTeamId: 'FEC-PERI', homeWins: 2, awayWins: 0, games: [] },
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
        expect(activeFecSeries(state, config.fec)).toHaveLength(0);
        repairFecKnockout(state, config.fec);
        expect(state.competitions.fec!.phase).toBe('semiFinals');
        expect(state.competitions.fec!.playoffs!.stage).toBe(1);
    });

    it('advances FEC semis to finals without a third-place game', () => {
        const state = createNewGame(config, 9003, 'PCE');
        state.competitions.fec = {
            id: 'fec',
            phase: 'semiFinals',
            fixtures: [],
            groups: [],
            playoffs: {
                stage: 1,
                seeds: { 'FEC-SBB': 1, 'FEC-SZOM': 2, 'FEC-BOSN': 3, 'FEC-PTKM': 4 },
                series: [
                    { id: 'FEC-SF-0', stage: 1, slot: 0, homeTeamId: 'FEC-SBB', awayTeamId: 'FEC-SZOM', homeWins: 2, awayWins: 0, games: [] },
                    { id: 'FEC-SF-1', stage: 1, slot: 1, homeTeamId: 'FEC-BOSN', awayTeamId: 'FEC-PTKM', homeWins: 1, awayWins: 2, games: [] },
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
        repairFecKnockout(state, config.fec);
        const playoffs = state.competitions.fec!.playoffs!;
        expect(playoffs.stage).toBe(2);
        expect(playoffs.series.filter((s) => s.stage === 2)).toHaveLength(1);
        expect(playoffs.thirdPlaceSeries).toBeNull();
        expect(playoffs.thirdPlaceTeamId).toBeNull();
        expect(state.competitions.fec!.phase).toBe('finals');
    });
});
