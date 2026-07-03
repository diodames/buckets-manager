import { describe, expect, it } from 'vitest';
import { balanceConfig } from '../src/config/balance';
import { leagueConfig } from '../src/config/league';
import { namePools } from '../src/config/names';
import { advanceRound, createNewGame, SAVE_FORMAT_VERSION, type GameConfig } from '../src/core/game';
import { deserializeSave, SaveError, serializeSave } from '../src/core/save/save';
import { MemoryStorageAdapter } from '../src/services/storage';

const config: GameConfig = { league: leagueConfig, balance: balanceConfig, names: namePools };

describe('save round-trip', () => {
    it('preserves the full game state through serialize/deserialize', () => {
        const state = createNewGame(config, 555, 'OVA');
        advanceRound(state, config);
        advanceRound(state, config);

        const raw = serializeSave(state, 'Slot 1', '2026-07-04T10:00:00.000Z');
        const loaded = deserializeSave(raw);
        expect(loaded.formatVersion).toBe(SAVE_FORMAT_VERSION);
        expect(loaded.name).toBe('Slot 1');
        expect(loaded.state).toEqual(state);
    });

    it('stays well under the localStorage quota', () => {
        const state = createNewGame(config, 555, 'OVA');
        while (state.currentRound <= 22) {
            advanceRound(state, config);
        }
        const raw = serializeSave(state, 'Full season', '2026-07-04T10:00:00.000Z');
        // Budget from the plan: a full-season save must stay under 1 MB.
        expect(raw.length).toBeLessThan(1024 * 1024);
    });

    it('rejects corrupt saves with a typed error', () => {
        expect(() => deserializeSave('not json')).toThrowError(SaveError);
        expect(() => deserializeSave('{}')).toThrowError(SaveError);
        try {
            deserializeSave('{"formatVersion": "x"}');
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(SaveError);
            expect((error as SaveError).kind).toBe('corrupt');
        }
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
