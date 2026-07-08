import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/core/game';
import { assignNblBclQualifiers } from '../src/core/bcl/index';
import { startFecSeason } from '../src/core/fec/index';
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
});
