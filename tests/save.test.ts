import { describe, expect, it } from 'vitest';
import { advanceRoundInstant, createNewGame, SAVE_FORMAT_VERSION } from '../src/core/game';
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
