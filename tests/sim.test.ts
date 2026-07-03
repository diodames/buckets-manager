import { describe, expect, it } from 'vitest';
import { balanceConfig } from '../src/config/balance';
import { leagueConfig } from '../src/config/league';
import { namePools } from '../src/config/names';
import { generateLeague } from '../src/core/league/generate';
import { createRng } from '../src/core/rng';
import { foldEvents } from '../src/core/sim/boxscore';
import { simulateMatch, type TeamSimInput } from '../src/core/sim/simulateMatch';

function buildInputs(seed: number): { home: TeamSimInput; away: TeamSimInput } {
    const league = generateLeague(createRng(seed).fork('league'), leagueConfig, balanceConfig, namePools);
    const [homeDef, awayDef] = leagueConfig.teams;
    const toInput = (teamId: string): TeamSimInput => {
        const team = league.teams[teamId];
        if (!team) {
            throw new Error(`missing team ${teamId}`);
        }
        return {
            teamId,
            players: team.playerIds.map((id) => {
                const p = league.players[id];
                if (!p) {
                    throw new Error(`missing player ${id}`);
                }
                return { id: p.id, position: p.position, attributes: p.attributes };
            }),
            starters: team.tactics.starters,
            pace: team.tactics.pace,
            offenseFocus: team.tactics.offenseFocus,
        };
    };
    if (!homeDef || !awayDef) {
        throw new Error('league config too small');
    }
    return { home: toInput(homeDef.id), away: toInput(awayDef.id) };
}

describe('simulateMatch', () => {
    it('is deterministic: same seed, same events and summary', () => {
        const inputs = buildInputs(1);
        const a = simulateMatch({ ...inputs, seed: 99, balance: balanceConfig });
        const b = simulateMatch({ ...inputs, seed: 99, balance: balanceConfig });
        expect(a.events).toEqual(b.events);
        expect(a.summary).toEqual(b.summary);
    });

    it('never ends in a tie (overtime resolves)', () => {
        const inputs = buildInputs(2);
        for (let seed = 0; seed < 300; seed++) {
            const { summary } = simulateMatch({ ...inputs, seed, balance: balanceConfig });
            expect(summary.homeScore).not.toBe(summary.awayScore);
        }
    });

    it('produces realistic scores over many sims', () => {
        const inputs = buildInputs(3);
        let total = 0;
        let min = Infinity;
        let max = -Infinity;
        const runs = 300;
        for (let seed = 0; seed < runs; seed++) {
            const { summary } = simulateMatch({ ...inputs, seed, balance: balanceConfig });
            for (const score of [summary.homeScore, summary.awayScore]) {
                total += score;
                min = Math.min(min, score);
                max = Math.max(max, score);
            }
        }
        const mean = total / (runs * 2);
        // Basketball plausibility band for a 40-minute game without free throws yet.
        expect(mean).toBeGreaterThan(55);
        expect(mean).toBeLessThan(105);
        expect(min).toBeGreaterThan(25);
        expect(max).toBeLessThan(160);
    });

    it('box score is consistent with the event stream (fold identity)', () => {
        const inputs = buildInputs(4);
        for (let seed = 0; seed < 100; seed++) {
            const { events, summary } = simulateMatch({ ...inputs, seed, balance: balanceConfig });
            const folded = foldEvents(events, inputs.home.teamId);
            expect(folded.homeScore).toBe(summary.homeScore);
            expect(folded.awayScore).toBe(summary.awayScore);
            expect(folded.box).toEqual(summary.box);
            // Quarter scores sum to the final score.
            const sums = folded.quarterScores.reduce<[number, number]>(
                (acc, [h, a]) => [acc[0] + h, acc[1] + a],
                [0, 0],
            );
            expect(sums[0]).toBe(summary.homeScore);
            expect(sums[1]).toBe(summary.awayScore);
        }
    });

    it('emits monotonically ordered clocks within periods', () => {
        const inputs = buildInputs(5);
        const { events } = simulateMatch({ ...inputs, seed: 5, balance: balanceConfig });
        let period = 1;
        let lastSeconds = Infinity;
        for (const event of events) {
            if (event.clock.period > period) {
                period = event.clock.period;
                lastSeconds = Infinity;
            }
            expect(event.clock.period).toBe(period);
            expect(event.clock.secondsLeft).toBeLessThanOrEqual(lastSeconds);
            lastSeconds = event.clock.secondsLeft;
        }
        const last = events[events.length - 1];
        expect(last?.t).toBe('gameEnd');
    });

    it('home advantage produces more home wins over many sims', () => {
        // Mirror matchup: identical rosters on both sides isolates venue effect.
        const inputs = buildInputs(6);
        const mirrored = { home: { ...inputs.away, teamId: 'HOME' }, away: { ...inputs.away, teamId: 'AWAY' } };
        let homeWins = 0;
        const runs = 400;
        for (let seed = 0; seed < runs; seed++) {
            const { summary } = simulateMatch({ ...mirrored, seed, balance: balanceConfig });
            if (summary.homeScore > summary.awayScore) {
                homeWins++;
            }
        }
        expect(homeWins / runs).toBeGreaterThan(0.5);
    });
});
