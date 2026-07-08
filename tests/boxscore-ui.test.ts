import { describe, expect, it } from 'vitest';
import { createEmptyBoxLine } from '../src/core/model/types';
import type { GameState, PlayerId } from '../src/core/model/types';
import { boxScoreEntries, formatShooting } from '../src/ui/boxscore';

describe('formatShooting', () => {
    it('formats made-attempt pairs', () => {
        expect(formatShooting(4, 7)).toBe('4-7');
        expect(formatShooting(0, 0)).toBe('0-0');
    });
});

describe('boxScoreEntries', () => {
    const box = {
        p1: { ...createEmptyBoxLine(), points: 12, rebounds: 5 },
        p2: { ...createEmptyBoxLine(), assists: 3 },
        p3: createEmptyBoxLine(),
    } as Record<PlayerId, ReturnType<typeof createEmptyBoxLine>>;

    const state = {
        teams: {
            HOME: { playerIds: ['p1', 'p2', 'p3'] },
        },
    } as unknown as GameState;

    it('includes only players who logged stats', () => {
        const entries = boxScoreEntries(state, 'HOME', box);
        expect(entries.map((e) => e.playerId)).toEqual(['p1', 'p2']);
    });

    it('sorts by points descending', () => {
        const highScorer = { ...createEmptyBoxLine(), points: 20, assists: 3 };
        const entries = boxScoreEntries(state, 'HOME', { ...box, p2: highScorer });
        expect(entries.map((e) => e.playerId)).toEqual(['p2', 'p1']);
    });
});
