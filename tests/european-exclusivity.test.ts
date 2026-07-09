import { describe, expect, it } from 'vitest';
import { fecConfig } from '../src/config/fec';
import {
    assignNblEuropeanQualifiers,
    bclParticipantTeamIds,
    nblPlayoffBclQualifiers,
    nblPlayoffBclQualifyingEntrant,
    nblPlayoffFecQualifiers,
    startBclSeason,
} from '../src/core/bcl/index';
import { createNewGame } from '../src/core/game';
import { startFecSeason } from '../src/core/fec/index';
import { generateBclClubs } from '../src/core/league/generate';
import { startPlayoffs } from '../src/core/playoffs';
import { deserializeSave, serializeSave } from '../src/core/save/save';
import { createRng } from '../src/core/rng';
import { testConfig as config } from './helpers';

function finishPlayoffsWithCzechTop4(
    state: ReturnType<typeof createNewGame>,
    champion: string,
    finalist: string,
    third: string,
    fourth: string,
): void {
    state.currentRound = 23;
    startPlayoffs(state, config.league);
    const finalsStage = config.league.playoffs.winsNeeded.length - 1;
    state.playoffs!.series.push({
        id: 'PO2-0',
        stage: finalsStage,
        slot: 0,
        homeTeamId: champion,
        awayTeamId: finalist,
        homeWins: 3,
        awayWins: 1,
        games: [],
    });
    state.playoffs!.championTeamId = champion;
    state.playoffs!.thirdPlaceTeamId = third;
    state.playoffs!.thirdPlaceSeries = {
        id: 'PO3RD-0',
        stage: 3,
        slot: 0,
        homeTeamId: third,
        awayTeamId: fourth,
        homeWins: 2,
        awayWins: 0,
        games: [],
    };
}

describe('european exclusivity', () => {
    it('maps FEC-BRN (BK Decin) to NBL DEC, not Brno', () => {
        const decin = fecConfig.teams.find((t) => t.id === 'FEC-BRN');
        expect(decin?.nblTeamId).toBe('DEC');
        expect(decin?.nblTeamId).not.toBe('BRN');
    });

    it('never assigns the same Czech team to BCL and FEC slots', () => {
        const state = createNewGame(config, 9201, 'BRN');
        finishPlayoffsWithCzechTop4(state, 'DEC', 'NYM', 'BRN', 'PCE');

        expect(nblPlayoffBclQualifiers(state, 2, config.league)).toEqual(['DEC', 'NYM']);
        expect(nblPlayoffBclQualifyingEntrant(state)).toBe('BRN');
        expect(nblPlayoffFecQualifiers(state)).toEqual(['PCE']);

        assignNblEuropeanQualifiers(state, 2, config.league);
        const overlap = state.lastBclQualifierIds.filter((id) => state.lastFecQualifierIds.includes(id));
        expect(overlap).toEqual([]);
        expect(state.lastFecQualifierIds).not.toContain('BRN');
        expect(state.bclQualifyingEntrantId).toBe('BRN');
    });

    it('excludes BCL participants from the FEC field at season start', () => {
        const state = createNewGame(config, 9202, 'BRN');
        for (const f of state.fixtures) {
            f.result = {
                homeScore: 80,
                awayScore: 75,
                quarterScores: [[20, 18], [20, 19], [20, 19], [20, 19]],
                box: {},
                seed: 1,
            };
        }
        finishPlayoffsWithCzechTop4(state, 'DEC', 'NYM', 'BRN', 'PCE');
        assignNblEuropeanQualifiers(state, 2, config.league);

        generateBclClubs(state, config.bcl, config.balance, config.names, state.seasonYear, createRng(42).fork('bcl-gen'));
        startBclSeason(state, config.bcl, config.league, createRng(42).fork('bcl-start'));

        const blocked = bclParticipantTeamIds(state);
        expect(blocked.has('BRN')).toBe(true);

        startFecSeason(state, config.fec, createRng(42).fork('fec-start'));
        const fec = state.competitions.fec!;
        expect(fec.qualifiedTeamIds).not.toContain('BRN');
        expect(fec.qualifiedTeamIds).toContain('PCE');
    });

    it('repairs FEC overlap with BCL participants on save load', () => {
        const state = createNewGame(config, 9203, 'BRN');
        state.lastBclQualifierIds = ['DEC', 'BRN'];
        state.bclQualifyingEntrantId = null;
        state.bclQualified = true;
        state.competitions.bcl = {
            id: 'bcl',
            phase: 'regularSeason',
            fixtures: [],
            groups: [{ id: 'BCL-G0', teamIds: ['BRN', 'BCL-RYT'], fixtures: [] }],
            playoffs: null,
            qualifyingSeries: null,
            qualifyingEntrantId: null,
            qualifyingOpponentId: null,
            qualifiedTeamIds: ['BRN', 'BCL-RYT'],
            championTeamId: null,
            prizePaid: false,
            weeklyPrizePaidTotal: 0,
            userFinish: null,
        };
        state.competitions.fec = {
            id: 'fec',
            phase: 'regularSeason',
            fixtures: [
                { id: 'dup', homeTeamId: 'BRN', awayTeamId: 'FEC-SBB', result: null, round: 1, week: 2, competitionId: 'fec' },
            ],
            groups: [{ id: 'FEC-A', teamIds: ['BRN', 'FEC-SBB'], fixtures: [] }],
            playoffs: null,
            qualifyingSeries: null,
            qualifyingEntrantId: null,
            qualifyingOpponentId: null,
            qualifiedTeamIds: ['BRN', 'FEC-SBB'],
            championTeamId: null,
            prizePaid: false,
            weeklyPrizePaidTotal: 0,
            userFinish: null,
        };
        state.fecQualified = true;

        const loaded = deserializeSave(serializeSave(state, 'test', new Date().toISOString())).state;
        expect(loaded.competitions.fec!.qualifiedTeamIds).not.toContain('BRN');
        expect(loaded.fecQualified).toBe(false);
    });
});
