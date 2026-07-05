import type { BalanceConfig } from '../config/balance';
import type { EconomyConfig } from '../config/economy';
import type { LeagueConfig } from '../config/league';
import type { MomentsConfig } from '../config/moments';
import type { NamePools } from '../config/names';
import type { PressConfig } from '../config/press';
import type { TrainingConfig } from '../config/training';
import type { MarketConfig } from '../config/market';
import { realArenaCapacity, roundEconomyTick, type RoundEconomyResult } from './economy';
import { generateFreeAgents, generateLeague } from './league/generate';
import { baseSalary, marketTick, runYouthIntake } from './market';
import { createSchedule, totalRounds } from './league/schedule';
import type { Fixture, GameState, MatchSummary, Player, PlayerId, Position, Tactics, TeamId } from './model/types';
import { overallRating, POSITIONS } from './model/types';
import { createRng, hashString } from './rng';
import { MatchEngine, simulateMatch, type MatchOutcome, type TeamSimInput } from './sim/matchEngine';
import { weeklyTrainingTick } from './training';

export const SAVE_FORMAT_VERSION = 4;

export interface GameConfig {
    league: LeagueConfig;
    balance: BalanceConfig;
    names: NamePools;
    moments: MomentsConfig;
    economy: EconomyConfig;
    training: TrainingConfig;
    press: PressConfig;
    market: MarketConfig;
}

export function createNewGame(config: GameConfig, seed: number, userTeamId: TeamId): GameState {
    if (!config.league.teams.some((t) => t.id === userTeamId)) {
        throw new Error(`createNewGame: unknown team '${userTeamId}'`);
    }
    const rng = createRng(seed);
    const { teams, players } = generateLeague(rng.fork('league'), config.league, config.balance, config.names);
    // Contracts for every rostered player (M1); free agents start unsigned.
    const contractRng = rng.fork('contracts');
    for (const player of Object.values(players)) {
        player.contract = {
            salary: baseSalary(overallRating(player.attributes), config.economy),
            yearsLeft: contractRng.int(1, 3),
        };
    }
    for (const agent of generateFreeAgents(rng.fork('freeAgents'), 12, config.names, config.balance)) {
        players[agent.id] = agent;
    }
    const teamIds = config.league.teams.map((t) => t.id);
    const state: GameState = {
        version: SAVE_FORMAT_VERSION,
        masterSeed: seed,
        userTeamId,
        seasonYear: config.league.startingSeasonYear,
        currentRound: 1,
        teams,
        players,
        fixtures: createSchedule(teamIds, config.league.roundRobinLegs),
        club: {
            budget: config.economy.startingBudget,
            fanSupport: config.economy.fanSupport.start,
            facilities: { arena: 1, training: 1, academy: 1 },
            sponsors: [],
            sponsorOffers: [],
            ledger: [],
            trainingFocus: 'balanced',
        },
        market: {
            listings: [],
            incomingOffers: [],
            negotiations: [],
            negotiationLocks: {},
            youthProspects: [],
            youthIntakeDone: false,
        },
    };
    // The academy is populated from day one so promising talents can be
    // invited to the first team at any time; the main intake wave still
    // arrives mid-season.
    runYouthIntake(state, config.market, config.economy, config.names, rng.fork('youth:initial'), {
        count: 2,
        markDone: false,
    });
    return state;
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
            (f) => f.result === null && (f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId),
        ) ?? null
    );
}

/** Deterministic per-fixture seed derived from the master seed. */
export function fixtureSeed(state: GameState, fixtureId: string): number {
    return (state.masterSeed ^ hashString(`fixture:${fixtureId}`)) >>> 0;
}

/** Roster snapshot for the sim: healthy players only, injured starters replaced. */
export function toSimInput(state: GameState, teamId: TeamId): TeamSimInput {
    const team = state.teams[teamId];
    if (!team) {
        throw new Error(`toSimInput: unknown team '${teamId}'`);
    }
    const available = team.playerIds
        .map((id) => state.players[id])
        .filter((p): p is Player => p !== undefined && p.injury === null);
    if (available.length < 5) {
        // Emergency: field injured players rather than forfeiting.
        const everyone = team.playerIds.map((id) => state.players[id]).filter((p): p is Player => p !== undefined);
        return buildInput(team.id, everyone, team.tactics);
    }
    return buildInput(team.id, available, team.tactics);
}

function buildInput(teamId: TeamId, players: Player[], tactics: Tactics): TeamSimInput {
    const { starters, pace, offenseFocus, defenseScheme } = tactics;
    const ids = new Set(players.map((p) => p.id));
    const effectiveStarters = {} as Record<Position, PlayerId>;
    const taken = new Set<PlayerId>();
    for (const position of POSITIONS) {
        let starterId: PlayerId | null = ids.has(starters[position]) ? starters[position] : null;
        if (starterId === null || taken.has(starterId)) {
            const replacement = players
                .filter((p) => !taken.has(p.id))
                .sort(
                    (a, b) =>
                        (b.position === position ? 1000 : 0) + overallRating(b.attributes) -
                        ((a.position === position ? 1000 : 0) + overallRating(a.attributes)),
                )[0];
            starterId = replacement?.id ?? null;
        }
        if (!starterId) {
            throw new Error(`buildInput: team ${teamId} cannot field five players`);
        }
        taken.add(starterId);
        effectiveStarters[position] = starterId;
    }
    return {
        teamId,
        players: players.map((p) => ({ id: p.id, position: p.position, attributes: p.attributes, fatigue: p.fatigue })),
        starters: effectiveStarters,
        pace,
        offenseFocus,
        defenseScheme,
    };
}

/** Builds the interactive engine for the user's fixture of the current round. */
export function prepareUserMatch(state: GameState, config: GameConfig): { fixture: Fixture; engine: MatchEngine } {
    const fixture = fixturesOfRound(state, state.currentRound).find(
        (f) => f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId,
    );
    if (!fixture || fixture.result) {
        throw new Error('prepareUserMatch: no pending user fixture this round');
    }
    const engine = new MatchEngine({
        home: toSimInput(state, fixture.homeTeamId),
        away: toSimInput(state, fixture.awayTeamId),
        seed: fixtureSeed(state, fixture.id),
        balance: config.balance,
        moments: config.moments,
        storyTeamId: state.userTeamId,
    });
    return { fixture, engine };
}

function applyOutcomeToPlayers(state: GameState, outcome: MatchOutcome): void {
    for (const [playerId, fatigue] of Object.entries(outcome.fatigue)) {
        const player = state.players[playerId];
        if (player) {
            player.fatigue = Math.max(player.fatigue, fatigue);
        }
    }
    for (const [playerId, roundsOut] of Object.entries(outcome.injuries)) {
        const player = state.players[playerId];
        if (player) {
            player.injury = { roundsOut };
        }
    }
    for (const [teamId, delta] of Object.entries(outcome.moraleDeltas.team)) {
        const team = state.teams[teamId];
        for (const playerId of team?.playerIds ?? []) {
            const player = state.players[playerId];
            if (player) {
                player.morale = Math.max(0, Math.min(100, player.morale + delta));
            }
        }
    }
    for (const [playerId, delta] of Object.entries(outcome.moraleDeltas.players)) {
        const player = state.players[playerId];
        if (player) {
            player.morale = Math.max(0, Math.min(100, player.morale + delta));
        }
    }
    // Winning lifts morale slightly, losing dents it (applied by caller via summary).
}

export interface RoundResult {
    round: number;
    results: Array<{ fixture: Fixture; summary: MatchSummary }>;
    economy: RoundEconomyResult | null;
    // First user player injured this round (feeds the press conference).
    userInjuredId: PlayerId | null;
    // New academy prospects arrived this round.
    youthIntake: boolean;
}

/**
 * Completes the current round: books the user match outcome (from the live
 * engine or instant sim), sims all AI fixtures, then runs the weekly economy
 * and training ticks and advances the round counter.
 */
export function completeRound(
    state: GameState,
    config: GameConfig,
    userMatch: { fixture: Fixture; outcome: MatchOutcome } | null,
): RoundResult {
    if (isSeasonOver(state, config)) {
        throw new Error('completeRound: season is over');
    }
    const round = state.currentRound;
    const results: RoundResult['results'] = [];
    let userInjuredId: PlayerId | null = null;

    if (userMatch) {
        userMatch.fixture.result = userMatch.outcome.summary;
        applyOutcomeToPlayers(state, userMatch.outcome);
        const userTeam = state.teams[state.userTeamId];
        userInjuredId =
            Object.keys(userMatch.outcome.injuries).find((id) => userTeam?.playerIds.includes(id)) ?? null;
        results.push({ fixture: userMatch.fixture, summary: userMatch.outcome.summary });
    }

    for (const fixture of fixturesOfRound(state, round)) {
        if (fixture.result) {
            continue;
        }
        const { summary, outcome } = simulateMatch({
            home: toSimInput(state, fixture.homeTeamId),
            away: toSimInput(state, fixture.awayTeamId),
            seed: fixtureSeed(state, fixture.id),
            balance: config.balance,
            moments: config.moments,
        });
        fixture.result = summary;
        applyOutcomeToPlayers(state, outcome);
        results.push({ fixture, summary });
    }

    // Economy tick from the user's perspective.
    let economy: RoundEconomyResult | null = null;
    const userFixture = results.find(
        (r) => r.fixture.homeTeamId === state.userTeamId || r.fixture.awayTeamId === state.userTeamId,
    );
    if (userFixture?.fixture.result) {
        const isHome = userFixture.fixture.homeTeamId === state.userTeamId;
        const summary = userFixture.fixture.result;
        const userScore = isHome ? summary.homeScore : summary.awayScore;
        const oppScore = isHome ? summary.awayScore : summary.homeScore;
        economy = roundEconomyTick(
            state,
            {
                playedHome: isHome,
                won: userScore > oppScore,
                margin: Math.abs(userScore - oppScore),
                realArenaCapacity: realArenaCapacity(config.league, state.userTeamId),
                totalRounds: seasonRounds(state, config),
            },
            config.economy,
            createRng(state.masterSeed).fork(`economy:${round}`),
        );
        // Result morale drift for the user team.
        const drift = userScore > oppScore ? 1.5 : -1;
        const team = state.teams[state.userTeamId];
        for (const playerId of team?.playerIds ?? []) {
            const player = state.players[playerId];
            if (player) {
                player.morale = Math.max(0, Math.min(100, player.morale + drift));
            }
        }
    }

    weeklyTrainingTick(state, { training: config.training, economy: config.economy }, createRng(state.masterSeed).fork(`training:${round}`));

    // Transfer market activity and the once-a-season youth intake (M11).
    marketTick(state, config.market, config.economy, createRng(state.masterSeed).fork(`market:${round}`));
    let youthIntake = false;
    if (!state.market.youthIntakeDone && round >= config.market.youth.intakeRound) {
        runYouthIntake(state, config.market, config.economy, config.names, createRng(state.masterSeed).fork(`youth:${round}`));
        youthIntake = true;
    }

    state.currentRound++;
    return { round, results, economy, userInjuredId, youthIntake };
}

/** Convenience: instant-sim the user match and complete the round in one call. */
export function advanceRoundInstant(state: GameState, config: GameConfig): RoundResult {
    const pending = fixturesOfRound(state, state.currentRound).some(
        (f) => !f.result && (f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId),
    );
    if (!pending) {
        return completeRound(state, config, null);
    }
    const { fixture, engine } = prepareUserMatch(state, config);
    const outcome = engine.finish();
    return completeRound(state, config, { fixture, outcome });
}
