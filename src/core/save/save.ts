import { SAVE_FORMAT_VERSION } from '../game';
import type { GameState } from '../model/types';

export interface SaveFile {
    formatVersion: number;
    name: string;
    savedAtIso: string;
    state: GameState;
}

export class SaveError extends Error {
    readonly kind: 'corrupt' | 'tooNew';

    constructor(kind: 'corrupt' | 'tooNew', message: string) {
        super(message);
        this.kind = kind;
    }
}

// Migration chain: index N upgrades a version-N save to version N+1. Empty
// until the first format change lands (M3).
const migrations: Record<number, (old: unknown) => unknown> = {};

export function serializeSave(state: GameState, name: string, savedAtIso: string): string {
    const file: SaveFile = { formatVersion: SAVE_FORMAT_VERSION, name, savedAtIso, state };
    return JSON.stringify(file);
}

export function deserializeSave(raw: string): SaveFile {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new SaveError('corrupt', 'Save data is not valid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || !('formatVersion' in parsed)) {
        throw new SaveError('corrupt', 'Save data has no formatVersion');
    }
    let file = parsed as { formatVersion: number };
    if (typeof file.formatVersion !== 'number') {
        throw new SaveError('corrupt', 'formatVersion is not a number');
    }
    if (file.formatVersion > SAVE_FORMAT_VERSION) {
        throw new SaveError('tooNew', `Save version ${file.formatVersion} is newer than supported ${SAVE_FORMAT_VERSION}`);
    }
    while (file.formatVersion < SAVE_FORMAT_VERSION) {
        const migrate = migrations[file.formatVersion];
        if (!migrate) {
            throw new SaveError('corrupt', `No migration from save version ${file.formatVersion}`);
        }
        file = migrate(file) as { formatVersion: number };
    }
    const complete = file as SaveFile;
    if (typeof complete.state !== 'object' || complete.state === null) {
        throw new SaveError('corrupt', 'Save has no game state');
    }
    return complete;
}
