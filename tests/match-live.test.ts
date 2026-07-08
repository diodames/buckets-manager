import { describe, expect, it } from 'vitest';
import { courtConfig } from '../src/config/court';
import { balanceConfig } from '../src/config/balance';
import { momentsConfig } from '../src/config/moments';
import { generateLeague } from '../src/core/league/generate';
import { leagueConfig } from '../src/config/league';
import { namePools } from '../src/config/names';
import { createRng } from '../src/core/rng';
import type { EngineStop } from '../src/core/sim/matchEngine';
import { MatchEngine, type TeamSimInput } from '../src/core/sim/matchEngine';

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
                return { id: p.id, position: p.position, attributes: p.attributes, fatigue: p.fatigue };
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

/** Mirrors MatchLiveScreen pump/queue draining so game-end handling stays covered by tests. */
function simulateLivePlayback(seed: number): { sawGameEndStop: boolean; finished: boolean } {
    const inputs = buildInputs(seed);
    const engine = new MatchEngine({ ...inputs, seed: 99, balance: balanceConfig, moments: momentsConfig, storyTeamId: inputs.home.teamId });
    let consumedEvents = 0;
    let pendingStop: EngineStop | null = null;
    const queue: Array<{ delayTicks: number }> = [];
    let waitTicks = 0;
    let sawGameEndStop = false;

    const pump = (): void => {
        if (pendingStop || engine.isFinished) {
            return;
        }
        const stop = engine.run({ breakAfterPossession: true });
        const fresh = engine.events.slice(consumedEvents + queue.length);
        for (const event of fresh) {
            const delayMs = courtConfig.eventDelaysMs[event.t as keyof typeof courtConfig.eventDelaysMs] ?? 600;
            queue.push({ delayTicks: Math.max(1, Math.round((delayMs * 60) / 1000)) });
        }
        if (stop.kind !== 'break') {
            pendingStop = stop;
        }
    };

    const handleStop = (stop: EngineStop): boolean => {
        if (stop.kind === 'gameEnd') {
            sawGameEndStop = true;
            return true;
        }
        if (stop.kind === 'moment') {
            engine.resolveMoment(stop.moment.def.choices[0]?.id ?? '');
        }
        return false;
    };

    let frames = 0;
    while (frames < 50_000) {
        frames++;
        if (waitTicks > 0) {
            waitTicks--;
            continue;
        }
        if (queue.length === 0) {
            if (pendingStop !== null) {
                const done = handleStop(pendingStop);
                pendingStop = null;
                if (done) {
                    break;
                }
                continue;
            }
            if (engine.isFinished) {
                break;
            }
            pump();
            continue;
        }
        const next = queue.shift();
        if (next) {
            consumedEvents++;
            waitTicks = next.delayTicks;
        }
    }

    return { sawGameEndStop, finished: engine.isFinished };
}

describe('MatchLiveScreen playback loop', () => {
    it('reaches a game-end stop before the engine finishes', () => {
        for (let seed = 0; seed < 20; seed++) {
            const result = simulateLivePlayback(seed);
            expect(result.sawGameEndStop).toBe(true);
            expect(result.finished).toBe(true);
        }
    });

    it('still finishes when the game-end stop is cleared early (instant-finish path)', () => {
        const inputs = buildInputs(3);
        const engine = new MatchEngine({ ...inputs, seed: 42, balance: balanceConfig, moments: momentsConfig, storyTeamId: null });
        while (!engine.isFinished) {
            const stop = engine.run({ breakAfterPossession: true });
            if (stop.kind === 'moment') {
                engine.resolveMoment(stop.moment.def.choices[0]?.id ?? '');
            }
        }
        const outcome = engine.finish();
        expect(outcome.summary.homeScore).not.toBe(outcome.summary.awayScore);
    });
});
