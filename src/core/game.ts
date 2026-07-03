import type { BalanceConfig } from '../config/balance';
import type { LeagueConfig } from '../config/league';
import type { NamePools } from '../config/names';
import { generateLeague } from './league/generate';
import { createSchedule, totalRounds } from './league/schedule';
import type { Fixture, GameState, MatchSummary, TeamId } from './model/types';
import { createRng, hashString } from './rng';
import { simulateMatch, type TeamSimInput } from './sim/simulateMatch';

export const SAVE_FORMAT_VERSION = 1;

export interface GameConfig {
    league: LeagueConfig;
    balance: BalanceConfig;
    names: NamePools;
}

export function createNewGame(config: GameConfig, seed: number, userTeamId: TeamId): GameState {
    if (!config.league.teams.some((t) => t.id === userTeamId)) {
        throw new Error(`createNewGame: unknown team '${userTeamId}'`);
    }
    const rng = createRng(seed);
    const { teams, players } = generateLeague(rng.fork('league'), config.league, config.balance, config.names);
    const teamIds = config.league.teams.map((t) => t.id);
    return {
        version: SAVE_FORMAT_VERSION,
        masterSeed: seed,
        userTeamId,
        seasonYear: config.league.startingSeasonYear,
        currentRound: 1,
        teams,
        players,
        fixtures: createSchedule(teamIds, config.league.roundRobinLegs),
    };
}

export function seasonRounds(state: GameState, config: GameConfig): number {
    return totalRounds(Object.keys(state.teams).length, config.league.roundRobinLegs);
}

export function isSeasonOver(state: GameState, config: GameConfig): boolean {
    return state.currentRound > seasonRounds(state, config);
}

export function fixturesOfRound(state: GameState, round: number): Fixture[] {
    return state.fixtures.filter((f) => f.round === round);
}

export function nextUserFixture(state: GameState): Fixture | null {
    return (
        state.fixtures.find(
            (f) =>
                f.result === null &&
                (f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId),
        ) ?? null
    );
}

function toSimInput(state: GameState, teamId: TeamId): TeamSimInput {
    const team = state.teams[teamId];
    if (!team) {
        throw new Error(`toSimInput: unknown team '${teamId}'`);
    }
    return {
        teamId,
        players: team.playerIds.map((id) => {
            const player = state.players[id];
            if (!player) {
                throw new Error(`toSimInput: player '${id}' missing from state`);
            }
            return { id: player.id, position: player.position, attributes: player.attributes };
        }),
        starters: team.tactics.starters,
        pace: team.tactics.pace,
        offenseFocus: team.tactics.offenseFocus,
    };
}

/** Deterministic per-fixture seed derived from the master seed. */
export function fixtureSeed(state: GameState, fixtureId: string): number {
    return (state.masterSeed ^ hashString(`fixture:${fixtureId}`)) >>> 0;
}

export interface RoundResult {
    round: number;
    results: Array<{ fixture: Fixture; summary: MatchSummary }>;
}

/**
 * Simulates every fixture of the current round in place and advances the
 * round counter. Throws when the season is already over.
 */
export function advanceRound(state: GameState, config: GameConfig): RoundResult {
    if (isSeasonOver(state, config)) {
        throw new Error('advanceRound: season is over');
    }
    const round = state.currentRound;
    const results: RoundResult['results'] = [];
    for (const fixture of fixturesOfRound(state, round)) {
        if (fixture.result) {
            continue;
        }
        const { summary } = simulateMatch({
            home: toSimInput(state, fixture.homeTeamId),
            away: toSimInput(state, fixture.awayTeamId),
            seed: fixtureSeed(state, fixture.id),
            balance: config.balance,
        });
        fixture.result = summary;
        results.push({ fixture, summary });
    }
    state.currentRound++;
    return { round, results };
}
