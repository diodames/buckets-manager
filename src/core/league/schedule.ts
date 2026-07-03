import type { Fixture, TeamId } from '../model/types';

/**
 * Round-robin schedule via the circle method. With `legs = 2` every pair
 * meets twice with home/away swapped in the second leg (double round-robin).
 *
 * Team count must be even and >= 2; rounds per leg = teamCount - 1.
 */
export function createSchedule(teamIds: readonly TeamId[], legs: number): Fixture[] {
    if (teamIds.length < 2 || teamIds.length % 2 !== 0) {
        throw new Error(`createSchedule: team count must be even and >= 2, got ${teamIds.length}`);
    }
    if (!Number.isInteger(legs) || legs < 1) {
        throw new Error(`createSchedule: legs must be a positive integer, got ${legs}`);
    }
    const n = teamIds.length;
    const roundsPerLeg = n - 1;
    // The circle method: fix the first team, rotate the rest each round.
    const rotation: TeamId[] = [...teamIds];
    const fixtures: Fixture[] = [];

    for (let leg = 0; leg < legs; leg++) {
        const circle = [...rotation];
        for (let r = 0; r < roundsPerLeg; r++) {
            const round = leg * roundsPerLeg + r + 1;
            for (let i = 0; i < n / 2; i++) {
                const a = circle[i] as TeamId;
                const b = circle[n - 1 - i] as TeamId;
                // Alternate the fixed team's venue by round so home games
                // spread evenly; swap venues entirely on odd legs.
                let home = (r + i) % 2 === 0 ? a : b;
                let away = (r + i) % 2 === 0 ? b : a;
                if (leg % 2 === 1) {
                    [home, away] = [away, home];
                }
                fixtures.push({
                    id: `S${leg}R${round}-${home}-${away}`,
                    round,
                    homeTeamId: home,
                    awayTeamId: away,
                    result: null,
                });
            }
            // Rotate all but the first element.
            const last = circle.pop() as TeamId;
            circle.splice(1, 0, last);
        }
    }
    return fixtures;
}

/** Total number of rounds in a schedule produced by createSchedule. */
export function totalRounds(teamCount: number, legs: number): number {
    return (teamCount - 1) * legs;
}
