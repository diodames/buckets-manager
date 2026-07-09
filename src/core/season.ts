import { payBclPrize } from './bcl/prizes';
import { assignNblBclQualifiers, simBclQualifyingSeries, startBclSeason } from './bcl/index';
import { payFecPrize } from './fec/prizes';
import { startFecSeason } from './fec/index';
import { generateBclClubs, generateFecClubs } from './league/generate';
import { createSchedule } from './league/schedule';
import { computeNblStandings } from './league/standings';
import { fixtureSeed, isCampaignOver, toSimInput, type GameConfig } from './game';
import { simulateMatch } from './sim/matchEngine';
import { evaluateBoardObjective, createBoardObjective } from './board';
import { evaluateBreakthroughOffers, removePlayerAbroad } from './breakthrough';
import type { GameState, OffseasonReviewSummary, OffseasonSummary, Player, PlayerId } from './model/types';
import { sortMovements, stageMovement, type StagedMovement } from './offseasonMovements';
import {
    generateAmbitionSponsorOffers,
    payNblLeaguePrize,
    payNblPlayoffPrize,
    rolloverSponsors,
    settleSponsorSeasonEnd,
    userNblPlayoffFinish,
} from './economy';
import {
    graduateUnsignedYouthProspects,
    releaseExpiredPlayer,
    replenishFreeAgents,
    runAiContractRenewals,
    scheduleFixedYouthProspects,
} from './market';
import { evaluateUserContractWalkaways } from './contracts';
import { evaluateCareerRetirements } from './retirement';
import { initializeSeasonMarket } from './seasonMarket';
import { computeSeasonAwards } from './awards';
import type { Rng } from './rng';

export function canStartNextSeason(state: GameState, config: GameConfig): boolean {
    return isCampaignOver(state, config);
}

/** User roster players whose contracts expire at the upcoming offseason rollover. */
export function userExpiringContractPlayers(state: GameState): Player[] {
    const team = state.teams[state.userTeamId];
    if (!team) {
        return [];
    }
    return team.playerIds
        .map((id) => state.players[id])
        .filter((player): player is Player => player !== undefined && player.contract !== null && player.contract.yearsLeft <= 1)
        .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

/** End-of-season review: standings, prizes, and sponsor settlement before contract rollover. */
export function prepareOffseasonReview(state: GameState, config: GameConfig, _rng: Rng): OffseasonReviewSummary {
    if (!canStartNextSeason(state, config)) {
        throw new Error('prepareOffseasonReview: campaign is not over');
    }

    const nblStandings = computeNblStandings(state);
    for (let i = 0; i < nblStandings.length; i++) {
        const row = nblStandings[i];
        if (row) {
            state.lastSeasonStandings[row.teamId] = i + 1;
        }
    }

    assignNblBclQualifiers(state, config.bcl.czechQualifiers, config.league);

    const sponsorSeasonEnd = settleSponsorSeasonEnd(state, config.economy);
    const nblLeague = payNblLeaguePrize(state, config.economy);
    const nblPrize = payNblPlayoffPrize(state, config.economy);
    const nblFinish = userNblPlayoffFinish(state);
    const bclPrize = payBclPrize(state, config.bcl, config.economy);
    const bclFinish = (state.competitions.bcl?.userFinish ?? null) as import('./model/types').BclUserFinish | null;
    const fecPrize = payFecPrize(state, config.fec, config.economy);
    const fecFinish = state.competitions.fec?.userFinish ?? null;

    const totalIncome = nblPrize + nblLeague.amount + bclPrize + fecPrize + sponsorSeasonEnd.bonusPaid;

    state.lastSeasonAwards = computeSeasonAwards(state);

    return {
        nblFinish,
        nblPrize,
        nblLeagueRank: nblLeague.rank,
        nblLeaguePrize: nblLeague.amount,
        bclQualified: state.bclQualified,
        bclFinish,
        bclPrize,
        fecQualified: state.fecQualified,
        fecFinish: fecFinish as import('./model/types').FecUserFinish | null,
        fecPrize,
        sponsorBonus: sponsorSeasonEnd.bonusPaid,
        sponsorTargetMet: sponsorSeasonEnd.targetMet,
        sponsorPromisedRank: sponsorSeasonEnd.promisedMaxRank,
        sponsorActualRank: sponsorSeasonEnd.actualRank,
        totalIncome,
    };
}

/** Roster rollover, market reset, and new season setup after the review step. */
export function completeOffseasonRollover(state: GameState, config: GameConfig, rng: Rng): OffseasonSummary {
    if (!canStartNextSeason(state, config)) {
        throw new Error('completeOffseasonRollover: campaign is not over');
    }

    const nblFinish = userNblPlayoffFinish(state);
    const bclFinishBeforeReset = (state.competitions.bcl?.userFinish ?? null) as import('./model/types').BclUserFinish | null;
    const fecFinishBeforeReset = (state.competitions.fec?.userFinish ?? null) as import('./model/types').FecUserFinish | null;

    evaluateBoardObjective(state, config.league, config.economy);

    const scoringAward = state.lastSeasonAwards?.awards.find((a) => a.kind === 'scoring');
    state.careerHistory.push({
        seasonYear: state.seasonYear,
        nblFinish,
        nblLeagueRank: state.lastSeasonStandings[state.userTeamId] ?? null,
        awards: state.lastSeasonAwards,
        topScorerName: scoringAward?.playerName ?? null,
    });

    const breakthroughOffers = evaluateBreakthroughOffers(state, config, rng.fork('breakthrough'));
    const aiRenewals = runAiContractRenewals(state, config.market, config.economy, rng.fork('ai-renew'));
    const userWalkaways = evaluateUserContractWalkaways(
        state,
        config.market,
        config.externalOffers,
        (s, p) => removePlayerAbroad(s, p, config.market, config.externalOffers),
        rng.fork('user-walkaway'),
    );
    const retirements = evaluateCareerRetirements(
        state,
        config.market,
        config.externalOffers,
        rng.fork('retirements'),
    );

    const nonRenewalIds = new Set<PlayerId>(aiRenewals.nonRenewalPlayerIds);
    const faStaged: StagedMovement[] = [];

    let contractsExpired = 0;
    for (const player of Object.values(state.players)) {
        if (!player.contract || player.teamId === null) {
            continue;
        }
        player.contract.yearsLeft--;
        if (player.contract.yearsLeft <= 0) {
            const reason = nonRenewalIds.has(player.id) ? 'nonRenewal' : 'expired';
            faStaged.push(stageMovement(state, player, 'freeAgent', reason));
            releaseExpiredPlayer(state, player);
            contractsExpired++;
        }
    }

    for (const player of Object.values(state.players)) {
        player.age++;
    }

    const youthGraduation = graduateUnsignedYouthProspects(state, config.market.youth.maxUnsignedSeasons);
    const youthGraduated = youthGraduation.count;
    const sponsorExpired = rolloverSponsors(state);

    state.market.listings = [];
    state.market.incomingOffers = [];
    state.market.negotiations = [];
    state.market.negotiationLocks = {};
    state.market.youthIntakeDone = false;
    state.market.youthArrivalsThisSeason = 0;
    state.market.pendingFixedYouthArrivals = [];
    state.market.unsolicitedBidUsed = false;
    state.market.watchlist = [];
    state.market.pendingPressHooks = [];

    scheduleFixedYouthProspects(
        state,
        state.userTeamId,
        rng.fork('youth:fixed-schedule'),
        config.market.youth.fixedAcademyDeadlineRound,
        config.market,
    );

    initializeSeasonMarket(state, config, rng.fork('season-market'));
    const newFreeAgents = replenishFreeAgents(
        state,
        config.market.offseason.faPoolTarget,
        config.names,
        config.balance,
        rng.fork('fa-replenish'),
    );

    const nblTeamIds = config.league.teams.map((t) => t.id);
    state.fixtures = createSchedule(nblTeamIds, config.league.roundRobinLegs);
    for (const f of state.fixtures) {
        f.competitionId = 'nbl';
        f.week = f.round;
    }

    state.playoffs = null;
    state.nblPrizePaid = false;
    state.currentRound = 1;
    state.calendarWeek = 1;
    state.seasonYear++;

    generateAmbitionSponsorOffers(state, config.economy, rng.fork('sponsors'));
    state.boardObjective = createBoardObjective(state, config.league);
    state.club.transferEmbargo = false;
    generateBclClubs(state, config.bcl, config.balance, config.names, state.seasonYear, rng.fork('bcl-gen'));
    startBclSeason(state, config.bcl, config.league, rng.fork('bcl-start'));
    if (state.competitions.bcl?.phase === 'qualifying'
        && state.bclQualifyingEntrantId
        && state.bclQualifyingEntrantId !== state.userTeamId) {
        simBclQualifyingSeries(state, config.bcl, config.league, rng.fork('bcl-quali-sim'), (fixture) => {
            const { summary, outcome } = simulateMatch({
                home: toSimInput(state, fixture.homeTeamId),
                away: toSimInput(state, fixture.awayTeamId),
                seed: fixtureSeed(state, fixture.id),
                balance: config.balance,
                moments: config.moments,
            });
            fixture.result = summary;
            for (const [playerId, roundsOut] of Object.entries(outcome.injuries)) {
                const player = state.players[playerId];
                if (player) {
                    player.injury = { roundsOut };
                }
            }
        });
    }
    generateFecClubs(state, config.fec, config.balance, config.names, state.seasonYear, rng.fork('fec-gen'));
    startFecSeason(state, config.fec, rng.fork('fec-start'));

    const allStaged: StagedMovement[] = [
        ...retirements.staged,
        ...aiRenewals.abroadStaged,
        ...userWalkaways.abroadStaged,
        ...faStaged,
        ...youthGraduation.staged,
    ];
    const playerMovements = sortMovements(allStaged);
    const summary: OffseasonSummary = {
        nblFinish,
        nblPrize: 0,
        nblLeagueRank: state.lastSeasonStandings[state.userTeamId] ?? null,
        nblLeaguePrize: 0,
        bclQualified: state.bclQualified,
        bclFinish: bclFinishBeforeReset,
        bclPrize: 0,
        fecQualified: state.fecQualified,
        fecFinish: fecFinishBeforeReset as import('./model/types').FecUserFinish | null,
        fecPrize: 0,
        contractsExpired,
        newFreeAgents,
        youthGraduated,
        sponsorExpired,
        sponsorBonus: 0,
        sponsorTargetMet: true,
        sponsorPromisedRank: null,
        sponsorActualRank: null,
        breakthroughOffers: breakthroughOffers.length,
        playersRetired: retirements.playersRetired,
        userRetirements: retirements.userRetirements,
        playerMovements,
    };
    state.lastOffseason = summary;
    return summary;
}

/** Full offseason rollover into the next season year. */
export function startNextSeason(state: GameState, config: GameConfig, rng: Rng): OffseasonSummary {
    const review = prepareOffseasonReview(state, config, rng.fork('review'));
    const summary = completeOffseasonRollover(state, config, rng.fork('rollover'));
    const merged: OffseasonSummary = {
        ...summary,
        nblPrize: review.nblPrize,
        nblLeagueRank: review.nblLeagueRank,
        nblLeaguePrize: review.nblLeaguePrize,
        bclPrize: review.bclPrize,
        fecPrize: review.fecPrize,
        sponsorBonus: review.sponsorBonus,
        sponsorTargetMet: review.sponsorTargetMet,
        sponsorPromisedRank: review.sponsorPromisedRank,
        sponsorActualRank: review.sponsorActualRank,
    };
    state.lastOffseason = merged;
    return merged;
}
