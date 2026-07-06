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

// Migration chain: index N upgrades a version-N save to version N+1.
const migrations: Record<number, (old: unknown) => unknown> = {
    // v1 saves come from the pre-NBL fictional league; their team ids no
    // longer exist, so they cannot be migrated meaningfully.
    1: () => {
        throw new SaveError('corrupt', 'Save predates the real NBL league data and cannot be loaded');
    },
    // v2 -> v3: defensive schemes and extended box scores (ftm/fta/blocks).
    2: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const teams = (file.state.teams ?? {}) as Record<string, { tactics?: Record<string, unknown> }>;
        for (const team of Object.values(teams)) {
            if (team.tactics && !('defenseScheme' in team.tactics)) {
                team.tactics.defenseScheme = 'man';
            }
        }
        const fixtures = (file.state.fixtures ?? []) as Array<{ result?: { box?: Record<string, Record<string, number>> } | null }>;
        for (const fixture of fixtures) {
            for (const line of Object.values(fixture.result?.box ?? {})) {
                line.ftm ??= 0;
                line.fta ??= 0;
                line.blocks ??= 0;
            }
        }
        file.state.version = 3;
        return { ...file, formatVersion: 3 };
    },
    // v3 -> v4: player contracts and the transfer market state.
    3: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        const players = (file.state.players ?? {}) as Record<string, { attributes?: Record<string, number>; contract?: unknown }>;
        for (const player of Object.values(players)) {
            if (!('contract' in player) || player.contract === undefined) {
                const values = Object.values(player.attributes ?? {});
                const overall = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 50;
                // Mirrors economyConfig.salary defaults at the time of v4.
                player.contract = { salary: Math.max(300_000, Math.round(600_000 + (overall - 50) * 40_000)), yearsLeft: 1 };
            }
        }
        file.state.market = {
            listings: [],
            incomingOffers: [],
            negotiations: [],
            negotiationLocks: {},
            youthProspects: [],
            youthIntakeDone: false,
        };
        file.state.version = 4;
        return { ...file, formatVersion: 4 };
    },
    // v4 -> v5: post-season bracket state.
    4: (old) => {
        const file = old as { formatVersion: number; state: Record<string, unknown> };
        file.state.playoffs ??= null;
        file.state.version = 5;
        return { ...file, formatVersion: 5 };
    },
};

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
