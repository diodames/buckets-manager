import { describe, expect, it } from 'vitest';
import { economyConfig } from '../src/config/economy';
import { advanceRoundInstant, createNewGame, SAVE_FORMAT_VERSION } from '../src/core/game';
import { baseSalary } from '../src/core/market';
import { overallRating } from '../src/core/model/types';
import { deserializeSave, SaveError, serializeSave } from '../src/core/save/save';
import { MemoryStorageAdapter } from '../src/services/storage';
import { testConfig as config } from './helpers';

describe('save round-trip', () => {
    it('preserves the full game state through serialize/deserialize', () => {
        const state = createNewGame(config, 555, 'OPA');
        advanceRoundInstant(state, config);
        advanceRoundInstant(state, config);

        const raw = serializeSave(state, 'Slot 1', '2026-07-04T10:00:00.000Z');
        const loaded = deserializeSave(raw);
        expect(loaded.formatVersion).toBe(SAVE_FORMAT_VERSION);
        expect(loaded.state).toEqual(state);
    });

    it('stays well under the localStorage quota after a full season', () => {
        const state = createNewGame(config, 555, 'OPA');
        while (state.currentRound <= 22) {
            advanceRoundInstant(state, config);
        }
        const raw = serializeSave(state, 'Full season', '2026-07-04T10:00:00.000Z');
        expect(raw.length).toBeLessThan(1024 * 1024);
    });

    it('migrates v2 saves: adds defenseScheme and extended box lines', () => {
        const v2 = {
            formatVersion: 2,
            name: 'v2',
            savedAtIso: '2026-07-04T00:00:00.000Z',
            state: {
                version: 2,
                teams: { NYM: { tactics: { pace: 'normal', offenseFocus: 'balanced' } } },
                fixtures: [{ result: { box: { 'NYM-P1': { points: 10, fgm2: 5, fga2: 8 } } } }],
            },
        };
        const migrated = deserializeSave(JSON.stringify(v2));
        expect(migrated.formatVersion).toBe(SAVE_FORMAT_VERSION);
        const team = (migrated.state.teams as Record<string, { tactics: { defenseScheme?: string } }>).NYM;
        expect(team?.tactics.defenseScheme).toBe('man');
        const line = migrated.state.fixtures[0]?.result?.box['NYM-P1'];
        expect(line?.ftm).toBe(0);
        expect(line?.fta).toBe(0);
        expect(line?.blocks).toBe(0);
        // v3 -> v4 chain: market state appears.
        expect(migrated.state.market).toBeDefined();
        expect(migrated.state.market.youthIntakeDone).toBe(false);
    });

    it('rejects v1 saves (pre-NBL fictional league) with a typed error', () => {
        const v1 = { formatVersion: 1, name: 'old', savedAtIso: '2026-07-04T00:00:00.000Z', state: { version: 1 } };
        try {
            deserializeSave(JSON.stringify(v1));
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(SaveError);
            expect((error as SaveError).kind).toBe('corrupt');
        }
    });

    it('rejects corrupt saves with a typed error', () => {
        expect(() => deserializeSave('not json')).toThrowError(SaveError);
        expect(() => deserializeSave('{}')).toThrowError(SaveError);
    });

    it('rejects saves from a newer format version', () => {
        const raw = JSON.stringify({ formatVersion: SAVE_FORMAT_VERSION + 1, state: {} });
        try {
            deserializeSave(raw);
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(SaveError);
            expect((error as SaveError).kind).toBe('tooNew');
        }
    });

    it('migrates v27 saves: resyncs contracts to the real-NBL salary scale', () => {
        const state = createNewGame(config, 557, 'DEC');
        const player = Object.values(state.players).find((p) => p.teamId === 'DEC' && p.contract);
        expect(player).toBeDefined();
        player!.contract!.salary = 600_000;
        const expected = baseSalary(overallRating(player!.attributes), economyConfig);

        const v27 = {
            formatVersion: 27,
            name: 'v27',
            savedAtIso: '2026-07-04T00:00:00.000Z',
            state: { ...state, version: 27 },
        };
        const migrated = deserializeSave(JSON.stringify(v27));
        expect(migrated.formatVersion).toBe(SAVE_FORMAT_VERSION);
        expect(migrated.state.players[player!.id]?.contract?.salary).toBe(expected);
    });
});

describe('MemoryStorageAdapter', () => {
    it('supports get/set/remove/list', () => {
        const storage = new MemoryStorageAdapter();
        storage.set('bbm.save.1', 'a');
        storage.set('bbm.save.2', 'b');
        storage.set('other', 'c');
        expect(storage.get('bbm.save.1')).toBe('a');
        expect(storage.list('bbm.save.')).toHaveLength(2);
        storage.remove('bbm.save.1');
        expect(storage.get('bbm.save.1')).toBeNull();
    });
});
