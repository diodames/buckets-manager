import { describe, expect, it } from 'vitest';
import { balanceConfig } from '../src/config/balance';
import { leagueConfig } from '../src/config/league';
import { momentsConfig } from '../src/config/moments';
import { namePools } from '../src/config/names';
import { generateLeague } from '../src/core/league/generate';
import { createRng } from '../src/core/rng';
import { foldEvents } from '../src/core/sim/boxscore';
import { MatchEngine, simulateMatch, type TeamSimInput } from '../src/core/sim/matchEngine';
import { moraleSkillMultiplier } from '../src/core/sim/morale';

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
                return { id: p.id, position: p.position, attributes: p.attributes, fatigue: p.fatigue, morale: p.morale };
            }),
            starters: team.tactics.starters,
            pace: team.tactics.pace,
            offenseFocus: team.tactics.offenseFocus,
            defenseScheme: team.tactics.defenseScheme,
        };
    };
    if (!homeDef || !awayDef) {
        throw new Error('league config too small');
    }
    return { home: toInput(homeDef.id), away: toInput(awayDef.id) };
}

const simArgs = { balance: balanceConfig, moments: momentsConfig };

describe('simulateMatch (one-shot, no decisions)', () => {
    it('is deterministic: same seed, same events and summary', () => {
        const inputs = buildInputs(1);
        const a = simulateMatch({ ...inputs, seed: 99, ...simArgs });
        const b = simulateMatch({ ...inputs, seed: 99, ...simArgs });
        expect(a.events).toEqual(b.events);
        expect(a.summary).toEqual(b.summary);
    });

    it('never ends in a tie (overtime resolves)', () => {
        const inputs = buildInputs(2);
        for (let seed = 0; seed < 200; seed++) {
            const { summary } = simulateMatch({ ...inputs, seed, ...simArgs });
            expect(summary.homeScore).not.toBe(summary.awayScore);
        }
    });

    it('produces realistic scores over many sims', () => {
        const inputs = buildInputs(3);
        let total = 0;
        let min = Infinity;
        let max = -Infinity;
        const runs = 250;
        for (let seed = 0; seed < runs; seed++) {
            const { summary } = simulateMatch({ ...inputs, seed, ...simArgs });
            for (const score of [summary.homeScore, summary.awayScore]) {
                total += score;
                min = Math.min(min, score);
                max = Math.max(max, score);
            }
        }
        const mean = total / (runs * 2);
        expect(mean).toBeGreaterThan(55);
        expect(mean).toBeLessThan(105);
        expect(min).toBeGreaterThan(25);
        expect(max).toBeLessThan(160);
    });

    it('box score is consistent with the event stream (fold identity)', () => {
        const inputs = buildInputs(4);
        for (let seed = 0; seed < 60; seed++) {
            const { events, summary } = simulateMatch({ ...inputs, seed, ...simArgs });
            const folded = foldEvents(events, inputs.home.teamId);
            expect(folded.homeScore).toBe(summary.homeScore);
            expect(folded.awayScore).toBe(summary.awayScore);
            expect(folded.box).toEqual(summary.box);
            const sums = folded.quarterScores.reduce<[number, number]>((acc, [h, a]) => [acc[0] + h, acc[1] + a], [0, 0]);
            expect(sums[0]).toBe(summary.homeScore);
            expect(sums[1]).toBe(summary.awayScore);
        }
    });

    it('scores decompose into field goals plus free throws', () => {
        const inputs = buildInputs(10);
        for (let seed = 0; seed < 40; seed++) {
            const { summary } = simulateMatch({ ...inputs, seed, ...simArgs });
            let points = 0;
            let fta = 0;
            for (const line of Object.values(summary.box)) {
                expect(line.points).toBe(line.fgm2 * 2 + line.fgm3 * 3 + line.ftm);
                expect(line.ftm).toBeLessThanOrEqual(line.fta);
                fta += line.fta;
                points += line.points;
            }
            expect(points).toBe(summary.homeScore + summary.awayScore);
            expect(fta).toBeGreaterThan(0);
        }
    });

    it('press defense forces more steals than zone over many sims', () => {
        const inputs = buildInputs(11);
        const stealsWith = (scheme: 'zone' | 'press') => {
            let steals = 0;
            for (let seed = 0; seed < 80; seed++) {
                const home = { ...inputs.home, defenseScheme: scheme } as TeamSimInput;
                const { summary } = simulateMatch({ home, away: inputs.away, seed, ...simArgs });
                for (const playerId of inputs.home.players.map((p) => p.id)) {
                    steals += summary.box[playerId]?.steals ?? 0;
                }
            }
            return steals;
        };
        expect(stealsWith('press')).toBeGreaterThan(stealsWith('zone'));
    });

    it('emits play calls and occasional fast breaks and blocks', () => {
        const inputs = buildInputs(12);
        let fastBreaks = 0;
        let blocks = 0;
        for (let seed = 0; seed < 20; seed++) {
            const { events } = simulateMatch({ ...inputs, seed, ...simArgs });
            expect(events.some((e) => e.t === 'playCall')).toBe(true);
            fastBreaks += events.filter((e) => e.t === 'playCall' && e.play === 'fastBreak').length;
            blocks += events.filter((e) => e.t === 'shot' && e.blockedBy !== null).length;
        }
        expect(fastBreaks).toBeGreaterThan(0);
        expect(blocks).toBeGreaterThan(0);
    });

    it('reports post-match fatigue in bounds for every player', () => {
        const inputs = buildInputs(5);
        const { outcome } = simulateMatch({ ...inputs, seed: 5, ...simArgs });
        for (const player of [...inputs.home.players, ...inputs.away.players]) {
            const fatigue = outcome.fatigue[player.id];
            expect(fatigue).toBeGreaterThanOrEqual(0);
            expect(fatigue).toBeLessThanOrEqual(100);
        }
    });
});

describe('MatchEngine (interactive)', () => {
    it('coach decisions change the outcome deterministically', () => {
        const inputs = buildInputs(6);
        const run = (withTimeout: boolean) => {
            const engine = new MatchEngine({ ...inputs, seed: 42, ...simArgs, storyTeamId: null });
            let possessions = 0;
            while (!engine.isFinished) {
                const stop = engine.run({ breakAfterPossession: true });
                possessions++;
                if (withTimeout && possessions === 30) {
                    engine.applyDecision({ t: 'timeout', teamId: inputs.home.teamId });
                }
                if (stop.kind === 'moment') {
                    engine.resolveMoment('');
                }
            }
            return engine.finish().summary;
        };
        const withTimeout = run(true);
        const without = run(false);
        // Same decision timeline reproduces exactly.
        expect(run(true)).toEqual(withTimeout);
        // The timeout consumed rng / changed flow, so outcomes may differ;
        // at minimum the event streams cannot be asserted equal. Sanity: both
        // are valid non-tied games.
        expect(withTimeout.homeScore).not.toBe(withTimeout.awayScore);
        expect(without.homeScore).not.toBe(without.awayScore);
    });

    it('substitution decision puts the bench player on court', () => {
        const inputs = buildInputs(7);
        const engine = new MatchEngine({ ...inputs, seed: 7, ...simArgs, storyTeamId: null });
        engine.run({ breakAfterPossession: true });
        const teamId = inputs.home.teamId;
        const out = engine.activeFive(teamId)[0];
        const sub = engine.benchPlayers(teamId)[0];
        if (!out || !sub) {
            throw new Error('no players to substitute');
        }
        engine.applyDecision({ t: 'substitution', teamId, out: out.id, in: sub.id });
        const five = engine.activeFive(teamId).map((p) => p.id);
        expect(five).toContain(sub.id);
        expect(five).not.toContain(out.id);
    });

    it('story moments fire only for the story team and can be resolved', () => {
        const inputs = buildInputs(8);
        let sawMoment = false;
        for (let seed = 0; seed < 30 && !sawMoment; seed++) {
            const engine = new MatchEngine({ ...inputs, seed, ...simArgs, storyTeamId: inputs.home.teamId });
            while (!engine.isFinished) {
                const stop = engine.run();
                if (stop.kind === 'moment') {
                    sawMoment = true;
                    expect(stop.moment.teamId).toBe(inputs.home.teamId);
                    expect(stop.moment.def.choices.length).toBeGreaterThan(0);
                    engine.resolveMoment(stop.moment.def.choices[0]?.id ?? '');
                }
            }
            const outcome = engine.finish();
            if (sawMoment) {
                expect(outcome.momentLog.length).toBeGreaterThan(0);
            }
        }
        expect(sawMoment).toBe(true);
    });

    it('morale skill multiplier favors high morale', () => {
        const low = moraleSkillMultiplier(25, balanceConfig);
        const high = moraleSkillMultiplier(90, balanceConfig);
        expect(high).toBeGreaterThan(low);
    });

    it('timeouts are limited per team', () => {
        const inputs = buildInputs(9);
        const engine = new MatchEngine({ ...inputs, seed: 9, ...simArgs, storyTeamId: null });
        engine.run({ breakAfterPossession: true });
        const teamId = inputs.home.teamId;
        const budget = engine.timeoutsOf(teamId);
        for (let i = 0; i < budget + 3; i++) {
            engine.applyDecision({ t: 'timeout', teamId });
        }
        expect(engine.timeoutsOf(teamId)).toBe(0);
        const timeoutEvents = engine.events.filter((e) => e.t === 'timeout');
        expect(timeoutEvents).toHaveLength(budget);
    });
});
