import { describe, expect, it } from 'vitest';
import { externalOffersConfig } from '../src/config/externalOffers';
import { marketConfig } from '../src/config/market';
import { createNewGame } from '../src/core/game';
import type { Fixture, GameState, Player, PlayerId } from '../src/core/model/types';
import { createEmptyBoxLine, overallRating } from '../src/core/model/types';
import type { Rng } from '../src/core/rng';
import {
    careerRetireScore,
    evaluateCareerRetirements,
    retirePlayer,
} from '../src/core/retirement';
import { testConfig as config } from './helpers';

function mockRng(retire: boolean): Rng {
    const rng: Rng = {
        next: () => 0,
        int: (_min, max) => max,
        chance: () => retire,
        pick: (items) => items[0] as (typeof items)[number],
        weightedIndex: () => 0,
        shuffle: (items) => items,
        fork: () => rng,
    };
    return rng;
}

function addPlayedFixtures(
    state: GameState,
    playerId: PlayerId,
    teamId: string,
    games: number,
    teamGames: number,
): void {
    const opponent = Object.keys(state.teams).find((id) => id !== teamId) ?? 'AWAY';
    for (let i = 0; i < teamGames; i++) {
        const box: Record<PlayerId, ReturnType<typeof createEmptyBoxLine>> = {};
        if (i < games) {
            box[playerId] = { ...createEmptyBoxLine(), points: 4, rebounds: 2, assists: 1 };
        }
        const fixture: Fixture = {
            id: `ret-test-${playerId}-${i}`,
            round: i + 1,
            homeTeamId: teamId,
            awayTeamId: opponent,
            result: {
                homeScore: 80,
                awayScore: 70,
                quarterScores: [[20, 18], [20, 18], [20, 17], [20, 17]],
                box,
                seed: 1,
            },
            competitionId: 'nbl',
            week: i + 1,
        };
        state.fixtures.push(fixture);
    }
}

describe('careerRetireScore', () => {
    it('mandatory retirement score at age 38 for deep bench players', () => {
        const state = createNewGame(config, 12001, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'DEC')!;
        player.age = 38;
        const team = state.teams.DEC!;
        for (const pos of Object.keys(team.tactics.starters) as Array<keyof typeof team.tactics.starters>) {
            if (team.tactics.starters[pos] === player.id) {
                team.tactics.starters[pos] = team.playerIds.find((id) => id !== player.id)!;
            }
        }
        addPlayedFixtures(state, player.id, 'DEC', 2, 20);
        expect(careerRetireScore(state, player, marketConfig, externalOffersConfig)).toBeGreaterThanOrEqual(0.9);
    });

    it('protects productive starters with heavy minutes', () => {
        const state = createNewGame(config, 12002, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'NYM')!;
        player.age = 30;
        const team = state.teams.NYM!;
        team.tactics.starters.PG = player.id;
        addPlayedFixtures(state, player.id, 'NYM', 18, 20);
        expect(careerRetireScore(state, player, marketConfig, externalOffersConfig)).toBeLessThan(0.15);
    });

    it('raises score for blocked deep bench veterans', () => {
        const state = createNewGame(config, 12003, 'NYM');
        const team = state.teams.DEC!;
        const bench = team.playerIds
            .map((id) => state.players[id])
            .filter((p): p is Player => p !== undefined && !Object.values(team.tactics.starters).includes(p.id))
            .sort((a, b) => overallRating(a.attributes) - overallRating(b.attributes))[0]!;
        bench.age = 33;
        bench.position = 'PF';
        addPlayedFixtures(state, bench.id, 'DEC', 10, 50);
        for (const id of team.playerIds) {
            const p = state.players[id];
            if (!p || p.id === bench.id) {
                continue;
            }
            if (p.position === 'PF') {
                p.age = 24;
                p.attributes = { ...p.attributes };
                for (const key of Object.keys(p.attributes) as Array<keyof typeof p.attributes>) {
                    p.attributes[key] = Math.min(99, overallRating(bench.attributes) + 2);
                }
            }
        }
        expect(careerRetireScore(state, bench, marketConfig, externalOffersConfig)).toBeGreaterThan(0.2);
    });
});

describe('evaluateCareerRetirements', () => {
    it('retires 38-year-old bench players', () => {
        const state = createNewGame(config, 12010, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'PCE')!;
        const id = player.id;
        player.age = 38;
        const team = state.teams.PCE!;
        for (const pos of Object.keys(team.tactics.starters) as Array<keyof typeof team.tactics.starters>) {
            if (team.tactics.starters[pos] === id) {
                team.tactics.starters[pos] = team.playerIds.find((pid) => pid !== id)!;
            }
        }
        addPlayedFixtures(state, id, 'PCE', 1, 10);

        const result = evaluateCareerRetirements(state, marketConfig, externalOffersConfig, mockRng(true));
        expect(result.playersRetired).toBeGreaterThanOrEqual(1);
        expect(result.staged.some((s) => s.entry.kind === 'retired')).toBe(true);
        expect(state.players[id]).toBeUndefined();
    });

    it('flags user retirements in staged movements', () => {
        const state = createNewGame(config, 12012, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'NYM')!;
        const id = player.id;
        player.age = 38;
        const team = state.teams.NYM!;
        for (const pos of Object.keys(team.tactics.starters) as Array<keyof typeof team.tactics.starters>) {
            if (team.tactics.starters[pos] === id) {
                team.tactics.starters[pos] = team.playerIds.find((pid) => pid !== id)!;
            }
        }
        addPlayedFixtures(state, id, 'NYM', 1, 10);

        const result = evaluateCareerRetirements(state, marketConfig, externalOffersConfig, mockRng(true));
        expect(result.staged.some((s) => s.entry.isUserPlayer && s.entry.kind === 'retired')).toBe(true);
    });

    it('retires old free agents without signing hints', () => {
        const state = createNewGame(config, 12011, 'NYM');
        const fa = Object.values(state.players).find(
            (p) => p.teamId === null && !state.market.youthProspects.some((y) => y.player.id === p.id),
        )!;
        fa.age = 34;
        delete state.market.signingHints[fa.id];

        evaluateCareerRetirements(state, marketConfig, externalOffersConfig, mockRng(true));
        expect(state.players[fa.id]).toBeUndefined();
    });
});

describe('retirePlayer user effects', () => {
    it('lowers fan support and teammate morale when a user starter retires', () => {
        const state = createNewGame(config, 12020, 'NYM');
        const team = state.teams.NYM!;
        const starterId = team.tactics.starters.PG;
        const player = state.players[starterId]!;
        const fanBefore = state.club.fanSupport;
        const mate = state.players[team.playerIds.find((id) => id !== starterId)!]!;
        const moraleBefore = mate.morale;

        retirePlayer(state, player, marketConfig);

        expect(state.players[starterId]).toBeUndefined();
        expect(state.club.fanSupport).toBeLessThan(fanBefore);
        expect(mate.morale).toBeLessThan(moraleBefore);
    });
});
