import type { BclConfig } from '../config/bcl';
import type { FecConfig } from '../config/fec';
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
    allPendingFixturesForWeek, activeBclSeries, allPendingBclGroupFixtures, checkBclPhaseAdvancement,
    completeBclKnockoutRound, completeBclQualifyingRound, hasPendingBclKnockout,
    needsBclKnockoutAdvancement, nextBclQualifyingFixture,
    nextBclSeriesFixture, pendingBclFixtures, recordBclQualifyingGame, recordBclSeriesGame,
    repairBclKnockout, userBclQualifyingSeries, userBclSeries,
} from './bcl/index';
import {
    activeFecSeries, allPendingFecGroupFixtures, checkFecPhaseAdvancement, completeFecKnockoutRound, needsFecKnockoutAdvancement,
    nextFecSeriesFixture, pendingFecFixtures, recordFecSeriesGame, repairFecKnockout, userFecSeries,
} from './fec/index';
import { payrollWeeksForSeason } from './cashflow';
import { homeCourtAdvantage, realArenaCapacity, roundEconomyTick, aiRoundEconomyTick, createNblFinances, europeanEconomyTicks, startingBudgetForTeam, tickFacilityProjects, type RoundEconomyResult } from './economy';
import { initAiFacilities, tickAiFacilities } from './aiFacilities';
import { initializeBoardObjective, emptyCareerMilestones } from './board';
import { tickBudgetCrisis } from './budgetCrisis';
import { generateLeague } from './league/generate';
import { baseSalary, marketTick, releaseFixedYouthProspects, runYouthIntake, scheduleFixedYouthProspects } from './market';
import { initializeSeasonMarket } from './seasonMarket';
import {
    activeSeries, maybeAdvanceStage, nextSeriesFixture, recordSeriesGame, repairPlayoffThirdPlace,
    startPlayoffs, userActiveSeries,
} from './playoffs';
import { createSchedule, totalRounds } from './league/schedule';
import type { Fixture, GameState, MatchSummary, Player, PlayerId, Position, Tactics, TeamId } from './model/types';
import { overallRating, POSITIONS } from './model/types';
import { createRng, hashString } from './rng';
import { MatchEngine, simulateMatch, type MatchOutcome, type TeamSimInput } from './sim/matchEngine';
import { weeklyTrainingTick } from './training';
import { initTeamPersonalities } from './personality';
import { refreshTeamStarters } from './roster';
import { difficultyModifiers } from './difficulty';
import type { Attributes, Difficulty } from './model/types';

export const SAVE_FORMAT_VERSION = 31;

export interface GameConfig {
    league: LeagueConfig;
    bcl: BclConfig;
    fec: FecConfig;
    balance: BalanceConfig;
    names: NamePools;
    moments: MomentsConfig;
    economy: EconomyConfig;
    training: TrainingConfig;
    press: PressConfig;
    market: MarketConfig;
    externalOffers: ExternalOffersConfig;
}

export function createNewGame(config: GameConfig, seed: number, userTeamId: TeamId, difficulty: Difficulty = 'hard'): GameState {
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
            yearsLeft: contractRng.int(config.market.contracts.yearsMin, config.market.contracts.yearsMax),
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
            watchlist: [],
            pendingPressHooks: [],
        },
        playoffs: null,
        competitions: {},
        lastSeasonStandings: {},
        nblPrizePaid: false,
        lastOffseason: null,
        bclQualified: false,
        bclDirectQualified: false,
        lastBclQualifierIds: [],
        bclQualifyingEntrantId: null,
        fecQualified: false,
        lastFecQualifierIds: [],
        lastSeasonAwards: null,
        careerHistory: [],
        boardObjective: null,
        careerMilestones: emptyCareerMilestones(),
        contextualHintsSeen: [],
        difficulty,
        tutorialStep: null,
        nblFinances: createNblFinances(config.league, config.economy, userTeamId),
    };
    initTeamPersonalities(state, userTeamId);
    initAiFacilities(state, config.league);
    initializeBoardObjective(state, config.league);
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

/** True when BCL/FEC competitions are finished or were never started this season. */
export function isEuropeanCalendarComplete(state: GameState, _config: GameConfig): boolean {
    const bcl = state.competitions.bcl;
    const fec = state.competitions.fec;
    if (!bcl && !fec) {
        return true;
    }
    if (bcl && bcl.phase !== 'complete') {
        return false;
    }
    if (fec && fec.phase !== 'complete') {
        return false;
    }
    return true;
}

export type CampaignPhase = 'regular' | 'europe' | 'playoffs' | 'offseason';

export function campaignPhase(state: GameState, config: GameConfig): CampaignPhase {
    if (isCampaignOver(state, config)) {
        return 'offseason';
    }
    if (isSeasonOver(state, config) && isEuropeanCalendarComplete(state, config) && state.playoffs) {
        return 'playoffs';
    }
    if (isSeasonOver(state, config) && !isEuropeanCalendarComplete(state, config)) {
        return 'europe';
    }
    return 'regular';
}

function hasPendingEuropeanSimulation(state: GameState, config: GameConfig): boolean {
    if (isEuropeanCalendarComplete(state, config)) {
        return false;
    }
    const bcl = state.competitions.bcl;
    if (bcl?.fixtures.some((f) => f.result === null)) {
        return true;
    }
    if (hasPendingBclKnockout(state, config.bcl)) {
        return true;
    }
    const fec = state.competitions.fec;
    if (fec?.fixtures.some((f) => f.result === null)) {
        return true;
    }
    if (fec?.playoffs && fec.phase !== 'complete' && activeFecSeries(state, config.fec).length > 0) {
        return true;
    }
    return false;
}

export function fixturesOfRound(state: GameState, round: number): Fixture[] {
    return state.fixtures.filter((f) => f.round === round && (!f.competitionId || f.competitionId === 'nbl'));
}

export function fixturesOfWeek(state: GameState, week: number): Fixture[] {
    return allPendingFixturesForWeek(state, week);
}

/** True during the NBL postseason bracket (after Europe, before campaign end). */
function inNblPlayoffs(state: GameState, config: GameConfig): boolean {
    return isSeasonOver(state, config)
        && isEuropeanCalendarComplete(state, config)
        && state.playoffs !== null
        && !isCampaignOver(state, config);
}

export function nextUserFixture(state: GameState, config?: GameConfig): Fixture | null {
    const week = state.calendarWeek;
    if (config && inNblPlayoffs(state, config)) {
        const series = userActiveSeries(state, config.league);
        if (series) {
            return nextSeriesFixture(series);
        }
    }
    // BCL qualifying or knockout series for user.
    if (config) {
        const bclQuali = userBclQualifyingSeries(state, config.bcl);
        if (bclQuali) {
            const qualiFix = nextBclQualifyingFixture(state, config.bcl);
            if (qualiFix) {
                return qualiFix;
            }
        }
        const bclSeries = userBclSeries(state, config.bcl);
        if (bclSeries) {
            const bclFix = nextBclSeriesFixture(state, config.bcl);
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
        const fecSeries = userFecSeries(state, config.fec);
        if (fecSeries) {
            const fecFix = nextFecSeriesFixture(state, config.fec);
            if (fecFix) {
                return fecFix;
            }
        }
        const fecPending = pendingFecFixtures(state, week).find(
            (f) => f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId,
        );
        if (fecPending && state.fecQualified) {
            return fecPending;
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

/** Pending user fixtures in BCL/FEC/NBL priority order (same as nextUserFixture, but all upcoming). */
export function upcomingUserFixtures(state: GameState, config: GameConfig, limit = 3): Fixture[] {
    const week = state.calendarWeek;
    const fixtures: Fixture[] = [];
    const seen = new Set<string>();

    const add = (fixture: Fixture | null | undefined): void => {
        if (!fixture || seen.has(fixture.id) || fixtures.length >= limit) {
            return;
        }
        seen.add(fixture.id);
        fixtures.push(fixture);
    };

    const bclQuali = userBclQualifyingSeries(state, config.bcl);
    if (bclQuali) {
        add(nextBclQualifyingFixture(state, config.bcl));
    }
    const bclSeries = userBclSeries(state, config.bcl);
    if (bclSeries) {
        add(nextBclSeriesFixture(state, config.bcl));
    }
    if (state.bclQualified) {
        for (const fixture of pendingBclFixtures(state, week)) {
            if (fixture.homeTeamId === state.userTeamId || fixture.awayTeamId === state.userTeamId) {
                add(fixture);
            }
        }
    }

    const fecSeries = userFecSeries(state, config.fec);
    if (fecSeries) {
        add(nextFecSeriesFixture(state, config.fec));
    }
    if (state.fecQualified) {
        for (const fixture of pendingFecFixtures(state, week)) {
            if (fixture.homeTeamId === state.userTeamId || fixture.awayTeamId === state.userTeamId) {
                add(fixture);
            }
        }
    }

    for (const fixture of state.fixtures) {
        if (
            fixture.result === null &&
            (fixture.week ?? fixture.round) >= week &&
            (fixture.homeTeamId === state.userTeamId || fixture.awayTeamId === state.userTeamId)
        ) {
            add(fixture);
        }
    }

    if (fixtures.length === 0 && state.playoffs) {
        const series = userActiveSeries(state, config.league);
        add(series ? nextSeriesFixture(series) : null);
    }

    return fixtures;
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

function scaleAttributes(attrs: Attributes, mult: number): Attributes {
    const out = { ...attrs };
    for (const key of Object.keys(out) as Array<keyof Attributes>) {
        out[key] = Math.max(1, Math.min(99, Math.round(out[key] * mult)));
    }
    return out;
}

/** Difficulty injury multiplier for the user's players in match sim. */
export function userInjuryMultiplier(state: GameState): number {
    return difficultyModifiers(state.difficulty ?? 'hard').userInjuryMult;
}

/** Apply difficulty scaling to non-user teams entering the match sim. */
export function applyDifficultyToSimInput(state: GameState, input: TeamSimInput): TeamSimInput {
    if (input.teamId === state.userTeamId) {
        return input;
    }
    const mult = difficultyModifiers(state.difficulty ?? 'hard').aiSkillMult;
    if (mult === 1) {
        return input;
    }
    return {
        ...input,
        players: input.players.map((p) => ({
            ...p,
            attributes: scaleAttributes(p.attributes, mult),
        })),
    };
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
        const padded = [...everyone];
        while (padded.length < POSITIONS.length && everyone.length > 0) {
            padded.push(everyone[padded.length % everyone.length]!);
        }
        return applyDifficultyToSimInput(state, buildInput(team.id, padded, team.tactics));
    }
    return applyDifficultyToSimInput(state, buildInput(team.id, available, team.tactics));
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
            starterId = players.find((p) => !taken.has(p.id))?.id ?? players[0]?.id ?? null;
        }
        if (!starterId) {
            throw new Error(`buildInput: team ${teamId} cannot field five players`);
        }
        taken.add(starterId);
        effectiveStarters[position] = starterId;
    }
    return {
        teamId,
        players: players.map((p) => ({ id: p.id, position: p.position, attributes: p.attributes, fatigue: p.fatigue, morale: p.morale })),
        starters: effectiveStarters,
        pace,
        offenseFocus,
        defenseScheme,
    };
}

/** Builds the interactive engine for the user's next game (league, BCL, or playoff). */
export function prepareUserMatch(state: GameState, config: GameConfig): { fixture: Fixture; engine: MatchEngine } {
    let fixture: Fixture | undefined;
    const bclQuali = userBclQualifyingSeries(state, config.bcl);
    if (bclQuali) {
        fixture = nextBclQualifyingFixture(state, config.bcl) ?? undefined;
    }
    const bclSeries = userBclSeries(state, config.bcl);
    if (!fixture && bclSeries) {
        fixture = nextBclSeriesFixture(state, config.bcl) ?? undefined;
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
        const fecSeries = userFecSeries(state, config.fec);
        if (fecSeries) {
            fixture = nextFecSeriesFixture(state, config.fec) ?? undefined;
        }
    }
    if (!fixture) {
        const fecPending = pendingFecFixtures(state, state.calendarWeek).find(
            (f) => f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId,
        );
        if (fecPending && state.fecQualified) {
            fixture = fecPending;
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
        userTeamId: state.userTeamId,
        userInjuryMult: userInjuryMultiplier(state),
        homeAdvantage: resolveHomeAdvantage(state, fixture, config),
    });
    return { fixture, engine };
}

function applyLiveMatchMoraleBonus(state: GameState): void {
    const team = state.teams[state.userTeamId];
    for (const playerId of team?.playerIds ?? []) {
        const player = state.players[playerId];
        if (player) {
            player.morale = Math.min(100, player.morale + 2);
        }
    }
}

function applyInstantSimFatiguePenalty(state: GameState): void {
    const team = state.teams[state.userTeamId];
    for (const playerId of team?.playerIds ?? []) {
        const player = state.players[playerId];
        if (player) {
            player.fatigue = Math.min(100, player.fatigue + 3);
        }
    }
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
    isFec: boolean;
}

/** Tick AI NBL club budgets for each team that played this round (user excluded). */
function tickNblFinancesForRound(
    state: GameState,
    config: GameConfig,
    results: RoundResult['results'],
): void {
    const nblTeamIds = new Set(config.league.teams.map((t) => t.id));
    const payrollWeeks = payrollWeeksForSeason(state, config.league);
    const ticked = new Set<TeamId>();

    for (const entry of results) {
        const fixture = entry.fixture;
        if (fixture.competitionId && fixture.competitionId !== 'nbl') {
            continue;
        }
        if (!fixture.result) {
            continue;
        }
        const summary = fixture.result;
        for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
            if (teamId === state.userTeamId || ticked.has(teamId) || !nblTeamIds.has(teamId)) {
                continue;
            }
            if (!state.nblFinances[teamId]) {
                continue;
            }
            ticked.add(teamId);
            const isHome = fixture.homeTeamId === teamId;
            const teamScore = isHome ? summary.homeScore : summary.awayScore;
            const oppScore = isHome ? summary.awayScore : summary.homeScore;
            aiRoundEconomyTick(
                state,
                teamId,
                {
                    playedHome: isHome,
                    opponentTeamId: isHome ? fixture.awayTeamId : fixture.homeTeamId,
                    won: teamScore > oppScore,
                    margin: Math.abs(teamScore - oppScore),
                    realArenaCapacity: realArenaCapacity(config.league, teamId),
                    totalRounds: payrollWeeks,
                },
                config.economy,
                config.league,
            );
        }
    }
}

/** Weekly bookkeeping shared by regular-season and playoff rounds. */
function finishRoundCommon(
    state: GameState,
    config: GameConfig,
    round: number,
    results: RoundResult['results'],
): { economy: RoundEconomyResult | null; youthIntake: boolean } {
    tickFacilityProjects(state);
    const payrollWeeks = payrollWeeksForSeason(state, config.league);
    const userResults = results.filter(
        (r) => r.fixture.homeTeamId === state.userTeamId || r.fixture.awayTeamId === state.userTeamId,
    );
    const nblResult = userResults.find((r) => !r.fixture.competitionId || r.fixture.competitionId === 'nbl');
    const economyInput: {
        playedHome: boolean;
        opponentTeamId?: TeamId;
        won: boolean;
        margin: number;
        realArenaCapacity: number | null;
        totalRounds: number;
    } = {
        realArenaCapacity: realArenaCapacity(config.league, state.userTeamId),
        totalRounds: payrollWeeks,
        won: false,
        margin: 0,
        playedHome: false,
    };
    if (nblResult?.fixture.result) {
        const isHome = nblResult.fixture.homeTeamId === state.userTeamId;
        const summary = nblResult.fixture.result;
        const userScore = isHome ? summary.homeScore : summary.awayScore;
        const oppScore = isHome ? summary.awayScore : summary.homeScore;
        economyInput.playedHome = isHome;
        economyInput.opponentTeamId = isHome ? nblResult.fixture.awayTeamId : nblResult.fixture.homeTeamId;
        economyInput.won = userScore > oppScore;
        economyInput.margin = Math.abs(userScore - oppScore);
        const drift = userScore > oppScore ? 1.5 : -1;
        const team = state.teams[state.userTeamId];
        for (const playerId of team?.playerIds ?? []) {
            const player = state.players[playerId];
            if (player) {
                player.morale = Math.max(0, Math.min(100, player.morale + drift));
            }
        }
    } else if (userResults.length > 0) {
        const euro = userResults[0]!;
        if (euro.fixture.result) {
            const isHome = euro.fixture.homeTeamId === state.userTeamId;
            const summary = euro.fixture.result;
            const userScore = isHome ? summary.homeScore : summary.awayScore;
            const oppScore = isHome ? summary.awayScore : summary.homeScore;
            economyInput.won = userScore > oppScore;
            economyInput.margin = Math.abs(userScore - oppScore);
        }
    }

    const economy = roundEconomyTick(
        state,
        economyInput,
        config.economy,
        config.league,
        createRng(state.masterSeed).fork(`economy:${round}`),
    );

    for (const entry of userResults) {
        if (entry.fixture.competitionId === 'bcl' || entry.fixture.competitionId === 'fec') {
            europeanEconomyTicks(state, entry.fixture, config.economy, config.bcl, config.fec, round);
        }
    }

    tickNblFinancesForRound(state, config, results);

    weeklyTrainingTick(state, { training: config.training, economy: config.economy, league: config.league }, createRng(state.masterSeed).fork(`training:${round}`));

    tickAiFacilities(state, config.economy, config.league);
    tickBudgetCrisis(state, config.economy, config.league);

    // Transfer market activity and the once-a-season youth intake (M11).
    marketTick(state, config.market, config.economy, createRng(state.masterSeed).fork(`market:${round}`), config.externalOffers);
    for (const teamId of Object.keys(state.teams)) {
        if (teamId !== state.userTeamId) {
            refreshTeamStarters(state, teamId);
        }
    }
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

/** After NBL ends, sim any BCL group fixtures whose calendar week was skipped. */
function simOrphanedBclGroupFixtures(
    state: GameState,
    config: GameConfig,
    results: RoundResult['results'],
    userMatch: { fixture: Fixture; outcome: MatchOutcome } | null,
): boolean {
    if (!isSeasonOver(state, config)) {
        return false;
    }
    const orphaned = allPendingBclGroupFixtures(state);
    if (orphaned.length === 0) {
        return false;
    }
    let hadBcl = false;
    for (const fixture of orphaned) {
        const isUser = fixture.homeTeamId === state.userTeamId || fixture.awayTeamId === state.userTeamId;
        if (isUser && userMatch && userMatch.fixture.id === fixture.id) {
            hadBcl = true;
            continue;
        }
        simFixture(state, config, fixture, results);
        hadBcl = true;
    }
    const rng = createRng(state.masterSeed).fork(`bcl-orphan:${state.calendarWeek}`);
    checkBclPhaseAdvancement(state, config.bcl, config.league, rng);
    return hadBcl;
}

function simWeekFecFixtures(
    state: GameState,
    config: GameConfig,
    week: number,
    results: RoundResult['results'],
    userMatch: { fixture: Fixture; outcome: MatchOutcome } | null,
): boolean {
    const fecFixtures = pendingFecFixtures(state, week);
    if (fecFixtures.length === 0) {
        return false;
    }
    let hadFec = false;
    for (const fixture of fecFixtures) {
        const isUser = fixture.homeTeamId === state.userTeamId || fixture.awayTeamId === state.userTeamId;
        if (isUser && userMatch && userMatch.fixture.id === fixture.id) {
            hadFec = true;
            continue;
        }
        simFixture(state, config, fixture, results);
        hadFec = true;
    }
    const rng = createRng(state.masterSeed).fork(`fec-advance:${week}`);
    checkFecPhaseAdvancement(state, config.fec, rng);
    return hadFec;
}

/** After NBL ends, sim any FEC group fixtures whose calendar week was skipped. */
function simOrphanedFecGroupFixtures(
    state: GameState,
    config: GameConfig,
    results: RoundResult['results'],
    userMatch: { fixture: Fixture; outcome: MatchOutcome } | null,
): boolean {
    if (!isSeasonOver(state, config)) {
        return false;
    }
    const orphaned = allPendingFecGroupFixtures(state);
    if (orphaned.length === 0) {
        return false;
    }
    let hadFec = false;
    for (const fixture of orphaned) {
        const isUser = fixture.homeTeamId === state.userTeamId || fixture.awayTeamId === state.userTeamId;
        if (isUser && userMatch && userMatch.fixture.id === fixture.id) {
            hadFec = true;
            continue;
        }
        simFixture(state, config, fixture, results);
        hadFec = true;
    }
    const rng = createRng(state.masterSeed).fork(`fec-orphan:${state.calendarWeek}`);
    checkFecPhaseAdvancement(state, config.fec, rng);
    return hadFec;
}

/** Advance BCL/FEC phases when all fixtures are played but phase was not updated. */
function nudgeEuropeanPhaseAdvancement(state: GameState, config: GameConfig): void {
    repairBclKnockout(state, config.bcl);
    repairFecKnockout(state, config.fec);
    for (let i = 0; i < 5; i++) {
        if (isEuropeanCalendarComplete(state, config) || hasPendingEuropeanSimulation(state, config)) {
            break;
        }
        const rng = createRng(state.masterSeed).fork(`europe-advance:${state.calendarWeek}:${i}`);
        checkBclPhaseAdvancement(state, config.bcl, config.league, rng);
        checkFecPhaseAdvancement(state, config.fec, rng);
        repairBclKnockout(state, config.bcl);
        repairFecKnockout(state, config.fec);
    }
}

function bookUserMatch(
    state: GameState,
    userMatch: { fixture: Fixture; outcome: MatchOutcome; playedLive?: boolean },
    results: RoundResult['results'],
): PlayerId | null {
    userMatch.fixture.result = userMatch.outcome.summary;
    applyOutcomeToPlayers(state, userMatch.outcome);
    if (userMatch.playedLive) {
        applyLiveMatchMoraleBonus(state);
    }
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
        userTeamId: state.userTeamId,
        userInjuryMult: userInjuryMultiplier(state),
        homeAdvantage: resolveHomeAdvantage(state, fixture, config),
    });
    fixture.result = summary;
    applyOutcomeToPlayers(state, outcome);
    results.push({ fixture, summary });
}

/** Starts the bracket once the regular season and European calendar are finished. */
export function ensurePlayoffs(state: GameState, config: GameConfig): void {
    if (isSeasonOver(state, config) && isEuropeanCalendarComplete(state, config) && !state.playoffs) {
        startPlayoffs(state, config.league);
    }
}

/** True once the playoff champion is crowned and 3rd place is decided. */
export function isCampaignOver(state: GameState, _config: GameConfig): boolean {
    const playoffs = state.playoffs;
    return isSeasonOver(state, _config)
        && playoffs?.championTeamId != null
        && playoffs?.thirdPlaceTeamId != null;
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
    if (state.playoffs) {
        repairPlayoffThirdPlace(state.playoffs, config.league);
    }

    const common = finishRoundCommon(state, config, round, results);
    state.currentRound++;
    return { round, results, ...common, userInjuredId, isPlayoff: true, isBcl: false, isFec: false };
}

/**
 * Completes the current round: books the user match outcome (from the live
 * engine or instant sim), sims all remaining games (league round or playoff
 * series), then runs the weekly economy and training ticks.
 */
export function completeRound(
    state: GameState,
    config: GameConfig,
    userMatch: { fixture: Fixture; outcome: MatchOutcome; playedLive?: boolean } | null,
): RoundResult {
    if (inNblPlayoffs(state, config)) {
        return completePlayoffRound(state, config, userMatch);
    }
    const round = state.currentRound;
    const week = state.calendarWeek;
    const results: RoundResult['results'] = [];
    let userInjuredId: PlayerId | null = null;
    let isBcl = false;
    let isFec = false;

    // BCL qualifying series games.
    const bclQuali = userBclQualifyingSeries(state, config.bcl);
    if (bclQuali && userMatch?.fixture.competitionId === 'bcl') {
        userInjuredId = bookUserMatch(state, userMatch, results);
        recordBclQualifyingGame(state, userMatch.fixture);
        const rng = createRng(state.masterSeed).fork(`bcl-quali-advance:${week}`);
        completeBclQualifyingRound(state, config.bcl, config.league, rng);
        isBcl = true;
    }
    // BCL knockout series games — sim all active series each round.
    const bclKnockoutSeries = activeBclSeries(state, config.bcl);
    let userBclKnockoutRecorded = false;
    if (bclKnockoutSeries.length > 0) {
        for (const series of bclKnockoutSeries) {
            const isUserSeries = series.homeTeamId === state.userTeamId || series.awayTeamId === state.userTeamId;
            if (isUserSeries && userMatch?.fixture.competitionId === 'bcl') {
                if (!userBclKnockoutRecorded) {
                    userInjuredId = bookUserMatch(state, userMatch, results);
                    recordBclSeriesGame(state, userMatch.fixture);
                    userBclKnockoutRecorded = true;
                }
            } else {
                const fixture = nextSeriesFixture(series);
                fixture.competitionId = 'bcl';
                simFixture(state, config, fixture, results);
                recordBclSeriesGame(state, fixture);
            }
        }
        isBcl = true;
    }
    if (needsBclKnockoutAdvancement(state, config.bcl)) {
        completeBclKnockoutRound(state, config.bcl);
        isBcl = true;
    }

    // FEC knockout series games — sim all active series each round.
    const fecKnockoutSeries = activeFecSeries(state, config.fec);
    let userFecKnockoutRecorded = false;
    if (fecKnockoutSeries.length > 0) {
        for (const series of fecKnockoutSeries) {
            const isUserSeries = series.homeTeamId === state.userTeamId || series.awayTeamId === state.userTeamId;
            if (isUserSeries && userMatch?.fixture.competitionId === 'fec') {
                if (!userFecKnockoutRecorded) {
                    userInjuredId = bookUserMatch(state, userMatch, results);
                    recordFecSeriesGame(state, userMatch.fixture);
                    userFecKnockoutRecorded = true;
                }
            } else {
                const fixture = nextSeriesFixture(series);
                fixture.competitionId = 'fec';
                simFixture(state, config, fixture, results);
                recordFecSeriesGame(state, fixture);
            }
        }
        isFec = true;
    }
    if (needsFecKnockoutAdvancement(state, config.fec)) {
        completeFecKnockoutRound(state, config.fec);
        isFec = true;
    }
    if (!isBcl && !isFec && userMatch) {
        userInjuredId = bookUserMatch(state, userMatch, results);
        if (userMatch.fixture.competitionId === 'bcl') {
            isBcl = true;
        }
        if (userMatch.fixture.competitionId === 'fec') {
            isFec = true;
        }
    }

    // BCL group/week fixtures.
    if (simWeekBclFixtures(state, config, week, results, userMatch)) {
        isBcl = true;
    }
    if (simOrphanedBclGroupFixtures(state, config, results, userMatch)) {
        isBcl = true;
    }

    // FEC group/week fixtures.
    if (simWeekFecFixtures(state, config, week, results, userMatch)) {
        isFec = true;
    }
    if (simOrphanedFecGroupFixtures(state, config, results, userMatch)) {
        isFec = true;
    }

    // NBL regular-season fixtures for this round (skip after regular season ends).
    if (!isSeasonOver(state, config)) {
        for (const fixture of fixturesOfRound(state, round)) {
            if (!fixture.result) {
                const isUser = fixture.homeTeamId === state.userTeamId || fixture.awayTeamId === state.userTeamId;
                if (isUser && userMatch && userMatch.fixture.id === fixture.id) {
                    continue;
                }
                simFixture(state, config, fixture, results);
            }
        }
    }

    const common = finishRoundCommon(state, config, round, results);
    if (isSeasonOver(state, config)
        && !isEuropeanCalendarComplete(state, config)
        && !hasPendingEuropeanSimulation(state, config)) {
        nudgeEuropeanPhaseAdvancement(state, config);
    }
    if (!isSeasonOver(state, config) || isBcl || isFec || hasPendingEuropeanSimulation(state, config)) {
        state.currentRound++;
    }
    return { round, results, ...common, userInjuredId, isPlayoff: false, isBcl, isFec };
}

/** Convenience: instant-sim the user match and complete the round in one call. */
export function advanceRoundInstant(state: GameState, config: GameConfig): RoundResult {
    ensurePlayoffs(state, config);
    if (isCampaignOver(state, config)) {
        throw new Error('completeRound: the season including playoffs is over');
    }
    const bclQuali = userBclQualifyingSeries(state, config.bcl) !== null;
    const bclKnockout = userBclSeries(state, config.bcl) !== null;
    const fecKnockout = userFecSeries(state, config.fec) !== null;
    const userHasMatch = fixturesOfRound(state, state.currentRound).some(
        (f) => !f.result && (f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId),
    ) ||
        pendingBclFixtures(state, state.calendarWeek).some(
            (f) => f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId,
        ) ||
        pendingFecFixtures(state, state.calendarWeek).some(
            (f) => f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId,
        ) ||
        bclQuali ||
        bclKnockout ||
        fecKnockout;
    if (hasPendingEuropeanSimulation(state, config) && !userHasMatch) {
        return completeRound(state, config, null);
    }
    const inPlayoffs = inNblPlayoffs(state, config);
    const pending = inPlayoffs && !bclQuali && !bclKnockout && !fecKnockout
        ? userActiveSeries(state, config.league) !== null
        : userHasMatch ||
          hasPendingBclKnockout(state, config.bcl) ||
          hasPendingEuropeanSimulation(state, config);
    if (!pending) {
        return completeRound(state, config, null);
    }
    const userFixture = nextUserFixture(state, config);
    if (!userFixture || userFixture.result) {
        return completeRound(state, config, null);
    }
    try {
        const { fixture, engine } = prepareUserMatch(state, config);
        const outcome = engine.finish();
        applyInstantSimFatiguePenalty(state);
        return completeRound(state, config, { fixture, outcome });
    } catch {
        return completeRound(state, config, null);
    }
}
