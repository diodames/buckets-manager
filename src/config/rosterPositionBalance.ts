import type { RealPlayerDef } from './league';
import type { Position } from '../core/model/types';
import { POSITIONS } from '../core/model/types';

const MIN_PER_POSITION = 2;
const MAX_PER_POSITION = 3;

const POSITION_INDEX: Record<Position, number> = {
    PG: 0,
    SG: 1,
    SF: 2,
    PF: 3,
    C: 4,
};

function countByPosition(roster: readonly RealPlayerDef[]): Record<Position, number> {
    const counts = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    for (const player of roster) {
        counts[player.position] += 1;
    }
    return counts;
}

function adjacency(a: Position, b: Position): number {
    return Math.abs(POSITION_INDEX[a] - POSITION_INDEX[b]);
}

/**
 * Reassign listed positions so a 12-man opening roster has 2–3 players at each
 * slot. Prefer adjacent moves and moving lower-rated / lower-minute depth first.
 */
export function balanceRosterPositions(roster: readonly RealPlayerDef[]): RealPlayerDef[] {
    if (roster.length < MIN_PER_POSITION * POSITIONS.length) {
        // Too short to satisfy 2-per-position; still trim piles and fill what we can.
    }
    const out = roster.map((p) => ({ ...p }));
    const maxSteps = out.length * POSITIONS.length * 2;

    for (let step = 0; step < maxSteps; step++) {
        const counts = countByPosition(out);
        const short = POSITIONS.filter((pos) => counts[pos] < MIN_PER_POSITION);
        const surplus = POSITIONS.filter((pos) => counts[pos] > MAX_PER_POSITION);
        const softSurplus = POSITIONS.filter((pos) => counts[pos] > MIN_PER_POSITION);

        if (short.length === 0 && surplus.length === 0) {
            break;
        }

        // Prefer fixing hard overflow first; otherwise pull from any soft surplus into short slots.
        const donors = surplus.length > 0 ? surplus : softSurplus;
        if (short.length === 0 || donors.length === 0) {
            break;
        }

        let best: { fromIdx: number; to: Position; score: number } | null = null;
        for (const need of short) {
            for (let i = 0; i < out.length; i++) {
                const player = out[i]!;
                if (!donors.includes(player.position)) {
                    continue;
                }
                // Keep donor position at least MIN after the move when possible.
                if (counts[player.position] <= MIN_PER_POSITION) {
                    continue;
                }
                // Don't push the target past MAX unless we're only fixing a short (then allow up to MAX).
                if (counts[need] >= MAX_PER_POSITION) {
                    continue;
                }
                const adj = adjacency(player.position, need);
                const ovr = player.targetOverall ?? 50;
                const mpg = player.mpg ?? 0;
                // Lower score = better: adjacent, then weaker/lower-minute players.
                const score = adj * 1000 + ovr * 10 + mpg;
                if (!best || score < best.score) {
                    best = { fromIdx: i, to: need, score };
                }
            }
        }

        if (!best) {
            // Fallback: allow depleting a soft-surplus down to MIN, same adjacent preference.
            for (const need of short) {
                for (let i = 0; i < out.length; i++) {
                    const player = out[i]!;
                    if (counts[player.position] <= MIN_PER_POSITION) {
                        continue;
                    }
                    if (counts[need] >= MAX_PER_POSITION) {
                        continue;
                    }
                    const adj = adjacency(player.position, need);
                    const ovr = player.targetOverall ?? 50;
                    const mpg = player.mpg ?? 0;
                    const score = adj * 1000 + ovr * 10 + mpg + 5000;
                    if (!best || score < best.score) {
                        best = { fromIdx: i, to: need, score };
                    }
                }
            }
        }

        if (!best) {
            break;
        }
        out[best.fromIdx] = { ...out[best.fromIdx]!, position: best.to };
    }

    return out;
}

/** Positions currently below the opening-roster minimum (used for youth fills). */
export function underfilledPositions(roster: readonly { position: Position }[]): Position[] {
    const counts = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    for (const player of roster) {
        counts[player.position] += 1;
    }
    return POSITIONS.filter((pos) => counts[pos] < MIN_PER_POSITION);
}
