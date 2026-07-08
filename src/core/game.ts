import type { BclConfig } from '../config/bcl';
import type { BalanceConfig } from '../config/balance';
import type { EconomyConfig } from '../config/economy';
import type { LeagueConfig } from '../config/league';
import type { MomentsConfig } from '../config/moments';
import type { NamePools } from '../config/names';
import type { PressConfig } from '../config/press';
import type { TrainingConfig } from '../config/training';
import type { ExternalOffersConfig } from '../config/externalOffers';
import type { MarketConfig } from '../config/market';
import {
    allPendingFixturesForWeek, checkBclPhaseAdvancement,
    completeBclKnockoutRound, nextBclSeriesFixture, pendingBclFixtures, recordBclSeriesGame,
    userBclSeries,
} from './bcl/index';
import { payrollWeeksForSeason } from './cashflow';
import { homeCourtAdvantage, realArenaCapacity, roundEconomyTick, startingBudgetForTeam, tickFacilityProjects, type RoundEconomyResult } from './economy';
import { generateLeague } from './league/generate';
import { baseSalary, marketTick, releaseFixedYouthProspects, runYouthIntake, scheduleFixedYouthProspects } from './market';
import { initializeSeasonMarket } from './seasonMarket';
import {
    activeSeries, maybeAdvanceStage, nextSeriesFixture, recordSeriesGame, startPlayoffs, userActiveSeries,
} from './playoffs';
import { createSchedule, totalRounds } from './league/schedule';
import type { Fixture, GameState, MatchSummary, Player, PlayerId, Position, Tactics, TeamId } from './model/types';
import { overallRating, POSITIONS } from './model/types';
import { createRng, hashString } from './rng';
import { MatchEngine, simulateMatch, type MatchOutcome, type TeamSimInput } from './sim/matchEngine';
import { weeklyTrainingTick } from './training';

export const SAVE_FORMAT_VERSION = 23;

export interface GameConfig {
    league: LeagueConfig;
    bcl: BclConfig;
    balance: BalanceConfig;
    names: NamePools;
    moments: MomentsConfig;
    economy: EconomyConfig;
    training: TrainingConfig;
    press: PressConfig;
    market: MarketConfig;
    externalOffers: ExternalOffersConfig;
}

export function createNewGame(config: GameConfig, seed: number, userTeamId: TeamId): GameState {
    const teamDef = config.league.teams.find((t) => t.id === userTeamId);
    if (!teamDef) {
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
    const teamIds = config.league.teams.map((t) => t.id);
    const fixtures = createSchedule(teamIds, config.league.roundRobinLegs);
    for (const f of fixtures) {
        f.competitionId = 'nbl';
        f.week = f.round;
    }
    const state: GameState = {
        version: SAVE_FORMAT_VERSION,
        masterSeed: seed,
        userTeamId,
        seasonYear: config.league.startingSeasonYear,
        currentRound: 1,
        calendarWeek: 1,
        teams,
        players,
        fixtures,
        club: {
            budget: startingBudgetForTeam(teamDef, config.economy),
            fanSupport: config.economy.fanSupport.start,
            ticketPrice: config.economy.tickets.defaultPrice,
            facilities: { arena: 1, training: 1, academy: 1 },
            facilityProjects: {},
            sponsors: [],
            sponsorOffers: [],
            sponsorRenewalDowngrade: false,
            ledger: [],
            trainingFocus: 'balanced',
        },
        market: {
            listings: [],
            incomingOffers: [],
            negotiations: [],
            negotiationLocks: {},
            youthProspects: [],
            youthArrivalsThisSeason: 0,
            youthIntakeDone: false,
            pendingFixedYouthArrivals: [],
            pendingFreeAgents: [],
            processedDepartureKeys: [],
            signingHints: {},
            externalOffers: [],
            unsolicitedBidUsed: false,
        },
        playoffs: null,
        competitions: {},
        lastSeasonStandings: {},
        nblPrizePaid: false,
        lastOffseason: null,
        bclQualified: false,
        lastBclQualifierIds: [],
    };
    // Real club academy talents arrive on random rounds through the early season;
    // the generic intake wave still arrives mid-season.
    scheduleFixedYouthProspects(
        state,
        userTeamId,
        rng.fork('youth:fixed-schedule'),
        config.market.youth.fixedAcademyDeadlineRound,
        config.market,
    );
    releaseFixedYouthProspects(state, config.market, config.economy, 1);
    runYouthIntake(state, config.market, config.economy, config.names, rng.fork('youth:initial'), {
        count: 2,
        markDone: false,
    });
    initializeSeasonMarket(state, config, rng.fork('season-market'));
    return state;
}

export function seasonRounds(state: GameState, config: GameConfig): number {
    return totalRounds(Object.keys(state.teams).length, config.league.roundRobinLegs);
}

export function isSeasonOver(state: GameState, config: GameConfig): boolean {
    return state.currentRound > seasonRounds(state, config);
}

export function fixturesOfRound(state: GameState, round: number): Fixture[] {
    return state.fixtures.filter((f) => f.round === round && (!f.competitionId || f.competitionId === 'nbl'));
}

export function fixturesOfWeek(state: GameState, week: number): Fixture[] {
    return allPendingFixturesForWeek(state, week);
}

export function nextUserFixture(state: GameState, config?: GameConfig): Fixture | null {
    const week = state.calendarWeek;
    // BCL knockout series for user.
    if (config) {
        const bclSeries = userBclSeries(state, config.league);
        if (bclSeries) {
            const bclFix = nextBclSeriesFixture(state, config.league);
            if (bclFix) {
                return bclFix;
            }
        }
        const bclPending = pendingBclFixtures(state, week).find(
            (f) => f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId,
        );
        if (bclPending && state.bclQualified) {
            return bclPending;
        }
    }
    const regular =
        state.fixtures.find(
            (f) =>
                f.result === null &&
                (f.week ?? f.round) >= week &&
                (f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId),
        ) ?? null;
    if (regular || !config || !state.playoffs) {
        return regular;
    }
    const series = userActiveSeries(state, config.league);
    return series ? nextSeriesFixture(series) : null;
}

/** Deterministic per-fixture seed derived from the master seed. */
export function fixtureSeed(state: GameState, fixtureId: string): number {
    return (state.masterSeed ^ hashString(`fixture:${fixtureId}`)) >>> 0;
}

function resolveHomeAdvantage(state: GameState, fixture: Fixture, config: GameConfig): number {
    return homeCourtAdvantage(
        state,
        fixture.homeTeamId,
        config.economy,
        config.league,
        config.balance.match.homeAdvantage,
    );
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

/** Builds the interactive engine for the user's next game (league, BCL, or playoff). */
export function prepareUserMatch(state: GameState, config: GameConfig): { fixture: Fixture; engine: MatchEngine } {
    let fixture: Fixture | undefined;
    const bclSeries = userBclSeries(state, config.league);
    if (bclSeries) {
        fixture = nextBclSeriesFixture(state, config.league) ?? undefined;
    }
    if (!fixture) {
        const bclPending = pendingBclFixtures(state, state.calendarWeek).find(
            (f) => f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId,
        );
        if (bclPending && state.bclQualified) {
            fixture = bclPending;
        }
    }
    if (!fixture) {
        if (isSeasonOver(state, config)) {
            ensurePlayoffs(state, config);
            const series = userActiveSeries(state, config.league);
            if (!series) {
                throw new Error('prepareUserMatch: no pending playoff game for the user');
            }
            fixture = nextSeriesFixture(series);
        } else {
            fixture = fixturesOfRound(state, state.currentRound).find(
                (f) => f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId,
            );
        }
    }
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
        homeAdvantage: resolveHomeAdvantage(state, fixture, config),
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
    // True when the results are post-season games.
    isPlayoff: boolean;
    isBcl: boolean;
}

/** Weekly bookkeeping shared by regular-season and playoff rounds. */
function finishRoundCommon(
    state: GameState,
    config: GameConfig,
    round: number,
    results: RoundResult['results'],
): { economy: RoundEconomyResult | null; youthIntake: boolean } {
    let economy: RoundEconomyResult | null = null;
    tickFacilityProjects(state);
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
                opponentTeamId: isHome ? userFixture.fixture.awayTeamId : userFixture.fixture.homeTeamId,
                won: userScore > oppScore,
                margin: Math.abs(userScore - oppScore),
                realArenaCapacity: realArenaCapacity(config.league, state.userTeamId),
                totalRounds: payrollWeeksForSeason(state, config.league),
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
    marketTick(state, config.market, config.economy, createRng(state.masterSeed).fork(`market:${round}`), config.externalOffers);
    releaseFixedYouthProspects(state, config.market, config.economy, round);
    let youthIntake = false;
    if (!state.market.youthIntakeDone && round >= config.market.youth.intakeRound) {
        runYouthIntake(state, config.market, config.economy, config.names, createRng(state.masterSeed).fork(`youth:${round}`));
        youthIntake = true;
    }

    state.calendarWeek++;
    return { economy, youthIntake };
}

function simWeekBclFixtures(
    state: GameState,
    config: GameConfig,
    week: number,
    results: RoundResult['results'],
    userMatch: { fixture: Fixture; outcome: MatchOutcome } | null,
): boolean {
    const bclFixtures = pendingBclFixtures(state, week);
    if (bclFixtures.length === 0) {
        return false;
    }
    let hadBcl = false;
    for (const fixture of bclFixtures) {
        const isUser = fixture.homeTeamId === state.userTeamId || fixture.awayTeamId === state.userTeamId;
        if (isUser && userMatch && userMatch.fixture.id === fixture.id) {
            hadBcl = true;
            continue;
        }
        simFixture(state, config, fixture, results);
        hadBcl = true;
    }
    const rng = createRng(state.masterSeed).fork(`bcl-advance:${week}`);
    checkBclPhaseAdvancement(state, config.bcl, config.league, rng);
    return hadBcl;
}

function bookUserMatch(
    state: GameState,
    userMatch: { fixture: Fixture; outcome: MatchOutcome },
    results: RoundResult['results'],
): PlayerId | null {
    userMatch.fixture.result = userMatch.outcome.summary;
    applyOutcomeToPlayers(state, userMatch.outcome);
    const userTeam = state.teams[state.userTeamId];
    results.push({ fixture: userMatch.fixture, summary: userMatch.outcome.summary });
    return Object.keys(userMatch.outcome.injuries).find((id) => userTeam?.playerIds.includes(id)) ?? null;
}

function simFixture(state: GameState, config: GameConfig, fixture: Fixture, results: RoundResult['results']): void {
    const { summary, outcome } = simulateMatch({
        home: toSimInput(state, fixture.homeTeamId),
        away: toSimInput(state, fixture.awayTeamId),
        seed: fixtureSeed(state, fixture.id),
        balance: config.balance,
        moments: config.moments,
        homeAdvantage: resolveHomeAdvantage(state, fixture, config),
    });
    fixture.result = summary;
    applyOutcomeToPlayers(state, outcome);
    results.push({ fixture, summary });
}

/** Starts the bracket lazily once the regular season has finished. */
export function ensurePlayoffs(state: GameState, config: GameConfig): void {
    if (isSeasonOver(state, config) && !state.playoffs) {
        startPlayoffs(state, config.league);
    }
}

/** True once the playoff champion is crowned — nothing left to play. */
export function isCampaignOver(state: GameState, config: GameConfig): boolean {
    return isSeasonOver(state, config) && state.playoffs?.championTeamId != null;
}

function completePlayoffRound(
    state: GameState,
    config: GameConfig,
    userMatch: { fixture: Fixture; outcome: MatchOutcome } | null,
): RoundResult {
    ensurePlayoffs(state, config);
    if (isCampaignOver(state, config)) {
        throw new Error('completeRound: the season including playoffs is over');
    }
    const round = state.currentRound;
    const results: RoundResult['results'] = [];
    let userInjuredId: PlayerId | null = null;

    for (const series of activeSeries(state, config.league)) {
        const isUserSeries = series.homeTeamId === state.userTeamId || series.awayTeamId === state.userTeamId;
        if (isUserSeries && userMatch) {
            userInjuredId = bookUserMatch(state, userMatch, results);
            recordSeriesGame(series, userMatch.fixture);
        } else {
            const fixture = nextSeriesFixture(series);
            simFixture(state, config, fixture, results);
            recordSeriesGame(series, fixture);
        }
    }
    maybeAdvanceStage(state, config.league);

    const common = finishRoundCommon(state, config, round, results);
    state.currentRound++;
    return { round, results, ...common, userInjuredId, isPlayoff: true, isBcl: false };
}

/**
 * Completes the current round: books the user match outcome (from the live
 * engine or instant sim), sims all remaining games (league round or playoff
 * series), then runs the weekly economy and training ticks.
 */
function hasPendingUserBcl(state: GameState, config: GameConfig): boolean {
    if (!state.bclQualified) {
        return false;
    }
    if (userBclSeries(state, config.league)) {
        return true;
    }
    return pendingBclFixtures(state, state.calendarWeek).some(
        (f) => f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId,
    );
}

export function completeRound(
    state: GameState,
    config: GameConfig,
    userMatch: { fixture: Fixture; outcome: MatchOutcome } | null,
): RoundResult {
    if (isSeasonOver(state, config) && userMatch?.fixture.competitionId !== 'bcl' && !hasPendingUserBcl(state, config)) {
        return completePlayoffRound(state, config, userMatch);
    }
    const round = state.currentRound;
    const week = state.calendarWeek;
    const results: RoundResult['results'] = [];
    let userInjuredId: PlayerId | null = null;
    let isBcl = false;

    // BCL knockout series games.
    const bclSeries = userBclSeries(state, config.league);
    if (bclSeries && userMatch?.fixture.competitionId === 'bcl') {
        userInjuredId = bookUserMatch(state, userMatch, results);
        recordBclSeriesGame(state, userMatch.fixture);
        completeBclKnockoutRound(state, config.league);
        isBcl = true;
    } else if (userMatch) {
        userInjuredId = bookUserMatch(state, userMatch, results);
        if (userMatch.fixture.competitionId === 'bcl') {
            isBcl = true;
        }
    }

    // BCL group/week fixtures.
    if (simWeekBclFixtures(state, config, week, results, userMatch)) {
        isBcl = true;
    }

    // NBL regular-season fixtures for this round.
    for (const fixture of fixturesOfRound(state, round)) {
        if (!fixture.result) {
            const isUser = fixture.homeTeamId === state.userTeamId || fixture.awayTeamId === state.userTeamId;
            if (isUser && userMatch && userMatch.fixture.id === fixture.id) {
                continue;
            }
            simFixture(state, config, fixture, results);
        }
    }

    const common = finishRoundCommon(state, config, round, results);
    state.currentRound++;
    return { round, results, ...common, userInjuredId, isPlayoff: false, isBcl };
}

/** Convenience: instant-sim the user match and complete the round in one call. */
export function advanceRoundInstant(state: GameState, config: GameConfig): RoundResult {
    ensurePlayoffs(state, config);
    const bclKnockout = userBclSeries(state, config.league) !== null;
    const pending = isSeasonOver(state, config) && !bclKnockout
        ? userActiveSeries(state, config.league) !== null
        : fixturesOfRound(state, state.currentRound).some(
              (f) => !f.result && (f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId),
          ) ||
          pendingBclFixtures(state, state.calendarWeek).some(
              (f) => f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId,
          ) ||
          bclKnockout;
    if (!pending) {
        return completeRound(state, config, null);
    }
    const { fixture, engine } = prepareUserMatch(state, config);
    const outcome = engine.finish();
    return completeRound(state, config, { fixture, outcome });
}
