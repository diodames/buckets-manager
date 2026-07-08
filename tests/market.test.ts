import { describe, expect, it } from 'vitest';
import { leagueConfig } from '../src/config/league';
import { marketConfig } from '../src/config/market';
import { economyConfig } from '../src/config/economy';
import { youthAcademyProspects } from '../src/config/youthAcademy';
import { advanceRoundInstant, createNewGame } from '../src/core/game';
import {
    acceptTransferOffer, bidOnPlayer, canNegotiate, contractBuyout, contractDemand, executePurchase,
    isAcademyPlayer, listPlayer, marketTick, negotiateOffer, releasePlayer, renewalStatus, requiredSalary, returnYouthToAcademy, runYouthIntake,
    signYouth, teamNeeds, transferValue,
} from '../src/core/market';
import type { Player } from '../src/core/model/types';
import { overallRating } from '../src/core/model/types';
import { createRng } from '../src/core/rng';
import { canStartNextSeason, startNextSeason } from '../src/core/season';
import { namePools } from '../src/config/names';
import { testConfig as config } from './helpers';

function bestUserPlayer(state: ReturnType<typeof createNewGame>): Player {
    const team = state.teams[state.userTeamId];
    const players = (team?.playerIds ?? []).map((id) => state.players[id]).filter((p): p is Player => p !== undefined);
    return players.sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes))[0] as Player;
}

function advanceThroughRound12(state: ReturnType<typeof createNewGame>): void {
    while (state.currentRound <= 12) {
        advanceRoundInstant(state, config);
    }
}

function completeSeason(state: ReturnType<typeof createNewGame>): void {
    for (let i = 0; i < 200; i++) {
        if (canStartNextSeason(state, config)) {
            return;
        }
        advanceRoundInstant(state, config);
    }
}

describe('contracts (M1-M5)', () => {
    it('every rostered player starts with a contract; free agents exist unsigned', () => {
        const state = createNewGame(config, 900, 'NYM');
        for (const player of Object.values(state.players)) {
            if (player.teamId !== null) {
                expect(player.contract).not.toBeNull();
                expect(player.contract?.salary).toBeGreaterThanOrEqual(config.economy.salary.min);
            }
        }
        const freeAgents = Object.values(state.players).filter((p) => p.teamId === null);
        expect(freeAgents.length).toBeGreaterThanOrEqual(6);
        expect(freeAgents.some((p) => p.lastName === 'Williams')).toBe(true);
    });

    it('demand scales with morale (unhappy players want more)', () => {
        const state = createNewGame(config, 901, 'NYM');
        const player = bestUserPlayer(state);
        player.morale = 90;
        const happy = contractDemand(state, player, marketConfig, config.economy);
        player.morale = 20;
        const unhappy = contractDemand(state, player, marketConfig, config.economy);
        expect(unhappy).toBeGreaterThan(happy);
    });

    it('renewalStatus reports why renewals are blocked or allowed', () => {
        const state = createNewGame(config, 899, 'NYM');
        const player = bestUserPlayer(state);
        if (player.contract) {
            player.contract.yearsLeft = 1;
        }
        expect(renewalStatus(state, player, marketConfig)).toEqual({ canRenew: false, reason: 'tooEarly' });
        expect(canNegotiate(state, player, marketConfig)).toBe(false);

        state.currentRound = marketConfig.contracts.renewalsOpenFromRound;
        expect(renewalStatus(state, player, marketConfig)).toEqual({ canRenew: true });
        expect(canNegotiate(state, player, marketConfig)).toBe(true);

        state.market.negotiationLocks[player.id] = state.currentRound + 3;
        expect(renewalStatus(state, player, marketConfig)).toEqual({
            canRenew: false,
            reason: 'locked',
            lockedUntilRound: state.currentRound + 3,
        });
        expect(canNegotiate(state, player, marketConfig)).toBe(false);

        if (player.contract) {
            player.contract.yearsLeft = 2;
        }
        delete state.market.negotiationLocks[player.id];
        expect(renewalStatus(state, player, marketConfig)).toEqual({ canRenew: false, reason: 'notExpiring' });
    });

    it('a generous offer is accepted; a lowball gets rejected with a hint, then locks', () => {
        const state = createNewGame(config, 902, 'NYM');
        state.currentRound = marketConfig.contracts.renewalsOpenFromRound;
        const player = bestUserPlayer(state);
        if (player.contract) {
            player.contract.yearsLeft = 1;
        }
        expect(canNegotiate(state, player, marketConfig)).toBe(true);
        const demand = contractDemand(state, player, marketConfig, config.economy);

        // Generous: accept immediately.
        state.club.budget = 50_000_000;
        const generous = negotiateOffer(state, player.id, { salary: Math.round(demand * 1.3), years: 2 }, 'renew', marketConfig, config.economy);
        expect(generous.status).toBe('accepted');
        expect(player.contract?.yearsLeft).toBe(2);

        // Lowball a different player into a lock.
        const state2 = createNewGame(config, 903, 'NYM');
        state2.currentRound = marketConfig.contracts.renewalsOpenFromRound;
        const target = bestUserPlayer(state2);
        if (target.contract) {
            target.contract.yearsLeft = 1;
        }
        const low = { salary: config.economy.salary.min, years: 1 };
        const r1 = negotiateOffer(state2, target.id, low, 'renew', marketConfig, config.economy);
        expect(r1.status).toBe('rejected');
        expect(r1.hintSalary).not.toBeNull();
        negotiateOffer(state2, target.id, low, 'renew', marketConfig, config.economy);
        const r3 = negotiateOffer(state2, target.id, low, 'renew', marketConfig, config.economy);
        expect(r3.status).toBe('finalRejected');
        const r4 = negotiateOffer(state2, target.id, low, 'renew', marketConfig, config.economy);
        expect(r4.status).toBe('locked');
    });
});

describe('negotiation hints are truthful', () => {
    it('offering the hinted amount closes the deal', () => {
        for (const seed of [904, 905, 906]) {
            const state = createNewGame(config, seed, 'NYM');
            state.currentRound = marketConfig.contracts.renewalsOpenFromRound;
            const player = bestUserPlayer(state);
            if (player.contract) {
                player.contract.yearsLeft = 1;
            }
            state.club.budget = 50_000_000;
            const low = negotiateOffer(state, player.id, { salary: 300_000, years: 2 }, 'renew', marketConfig, config.economy);
            expect(low.status).toBe('rejected');
            expect(low.hintSalary).not.toBeNull();
            const follow = negotiateOffer(state, player.id, { salary: low.hintSalary ?? 0, years: 2 }, 'renew', marketConfig, config.economy);
            expect(follow.status).toBe('accepted');
        }
    });

    it('free-agent signing at the hinted amount succeeds', () => {
        const state = createNewGame(config, 907, 'NYM');
        const freeAgent = Object.values(state.players).find((p) => p.teamId === null);
        if (!freeAgent) {
            throw new Error('no free agents');
        }
        // Make roster room.
        const team = state.teams[state.userTeamId];
        if (team && team.playerIds.length >= marketConfig.roster.maxPlayers) {
            team.playerIds.pop();
        }
        state.club.budget = 50_000_000;
        const low = negotiateOffer(state, freeAgent.id, { salary: 100_000, years: 1 }, 'freeAgent', marketConfig, config.economy);
        expect(low.status).toBe('rejected');
        const follow = negotiateOffer(state, freeAgent.id, { salary: low.hintSalary ?? 0, years: 1 }, 'freeAgent', marketConfig, config.economy);
        expect(follow.status).toBe('accepted');
        expect(freeAgent.teamId).toBe(state.userTeamId);
    });
});

describe('transferTerms negotiation', () => {
    it('lowers demand when a full transfer fee is agreed', () => {
        const state = createNewGame(config, 920, 'NYM');
        const aiPlayer = Object.values(state.players).find((p) => p.teamId && p.teamId !== 'NYM' && p.contract);
        expect(aiPlayer).toBeDefined();
        if (!aiPlayer) {
            return;
        }
        const fee = transferValue(aiPlayer, marketConfig, config.economy);
        const withoutFee = requiredSalary(state, aiPlayer, 2, 'transferTerms', marketConfig, config.economy);
        const withFee = requiredSalary(state, aiPlayer, 2, 'transferTerms', marketConfig, config.economy, { agreedTransferFee: fee });
        expect(withFee).toBeLessThan(withoutFee);
    });

    it('accepts at the hinted salary when fee meets transfer value', () => {
        const state = createNewGame(config, 921, 'NYM');
        state.club.budget = 50_000_000;
        const aiPlayer = Object.values(state.players).find((p) => p.teamId && p.teamId !== 'NYM' && p.contract);
        expect(aiPlayer).toBeDefined();
        if (!aiPlayer) {
            return;
        }
        const fee = transferValue(aiPlayer, marketConfig, config.economy);
        const salary = requiredSalary(state, aiPlayer, 2, 'transferTerms', marketConfig, config.economy, { agreedTransferFee: fee });
        const result = negotiateOffer(
            state,
            aiPlayer.id,
            { salary, years: 2 },
            'transferTerms',
            marketConfig,
            config.economy,
            { agreedTransferFee: fee },
        );
        expect(result.status).toBe('accepted');
        expect(aiPlayer.contract?.salary).toBe(salary);
    });
});

describe('transfers (M6-M9)', () => {
    it('transfer value favors young high-potential players', () => {
        const state = createNewGame(config, 910, 'NYM');
        const young = Object.values(state.players).find((p) => p.age <= 21 && p.teamId !== null);
        expect(young).toBeDefined();
        if (!young) {
            return;
        }
        const oldTwin: Player = { ...young, age: 33, potential: overallRating(young.attributes) };
        expect(transferValue(young, marketConfig, config.economy)).toBeGreaterThan(
            transferValue(oldTwin, marketConfig, config.economy) * 2,
        );
    });

    it('listing a player attracts AI offers that can be accepted for cash', () => {
        const state = createNewGame(config, 911, 'NYM');
        const player = bestUserPlayer(state);
        expect(listPlayer(state, player.id, null, marketConfig)).toBe(true);
        const before = state.club.budget;
        for (let i = 0; i < 10 && state.market.incomingOffers.length === 0; i++) {
            advanceRoundInstant(state, config);
        }
        expect(state.market.incomingOffers.length).toBeGreaterThan(0);
        const offer = state.market.incomingOffers[0];
        if (!offer) {
            return;
        }
        expect(acceptTransferOffer(state, offer.id, config.economy)).toBe(true);
        expect(state.players[player.id]?.teamId).toBe(offer.fromTeamId);
        expect(state.club.budget).toBeGreaterThan(before);
        expect(state.teams[state.userTeamId]?.playerIds).not.toContain(player.id);
    });

    it('allows at most one unsolicited bid per season without listing', () => {
        const state = createNewGame(config, 915, 'NYM');
        let unsolicited = 0;
        for (let round = 1; round <= marketConfig.transfers.deadlineRound; round++) {
            state.currentRound = round;
            marketTick(state, marketConfig, config.economy, createRng(915 + round), config.externalOffers);
            unsolicited = state.market.incomingOffers.filter((o) => o.id.startsWith('uns-')).length;
            if (unsolicited > 0) {
                break;
            }
        }
        if (unsolicited === 0) {
            return;
        }
        expect(state.market.unsolicitedBidUsed).toBe(true);
        const before = state.market.incomingOffers.length;
        for (let round = state.currentRound + 1; round <= marketConfig.transfers.deadlineRound; round++) {
            state.currentRound = round;
            marketTick(state, marketConfig, config.economy, createRng(1000 + round), config.externalOffers);
        }
        expect(state.market.incomingOffers.filter((o) => o.id.startsWith('uns-')).length).toBeLessThanOrEqual(1);
        expect(state.market.incomingOffers.length).toBe(before);
    });

    it('bids respect the transfer window deadline', () => {
        const state = createNewGame(config, 912, 'NYM');
        state.currentRound = marketConfig.transfers.deadlineRound + 1;
        const target = Object.values(state.players).find((p) => p.teamId && p.teamId !== state.userTeamId) as Player;
        const result = bidOnPlayer(state, target.id, 10_000_000, marketConfig, config.economy);
        expect(result.status).toBe('marketClosed');
    });

    it('bids stay closed once the regular season ends and playoffs begin', () => {
        const state = createNewGame(config, 914, 'NYM');
        state.currentRound = 23;
        const target = Object.values(state.players).find((p) => p.teamId && p.teamId !== state.userTeamId) as Player;
        const result = bidOnPlayer(state, target.id, 10_000_000, marketConfig, config.economy);
        expect(result.status).toBe('marketClosed');
    });

    it('an agreed bid plus personal terms moves the player and books the fee', () => {
        const state = createNewGame(config, 913, 'NYM');
        state.club.budget = 50_000_000;
        // Cheap surplus target: weakest player of another club.
        const target = Object.values(state.players)
            .filter((p): p is Player => p.teamId !== null && p.teamId !== state.userTeamId)
            .sort((a, b) => overallRating(a.attributes) - overallRating(b.attributes))[0] as Player;
        const fee = transferValue(target, marketConfig, config.economy) * 2;
        const bid = bidOnPlayer(state, target.id, fee, marketConfig, config.economy);
        expect(['agreed', 'counter']).toContain(bid.status);
        const budgetBefore = state.club.budget;
        expect(executePurchase(state, target.id, fee, marketConfig, config.economy)).toBe(true);
        expect(target.teamId).toBe(state.userTeamId);
        expect(state.club.budget).toBe(budgetBefore - fee);
    });
});

describe('contract termination', () => {
    it('pays the buyout, books it, and drops the player to free agency', () => {
        const state = createNewGame(config, 940, 'NYM');
        const player = bestUserPlayer(state);
        const buyout = contractBuyout(player, marketConfig);
        expect(buyout).toBeGreaterThan(0);
        const budgetBefore = state.club.budget;
        const rosterBefore = state.teams[state.userTeamId]?.playerIds.length ?? 0;

        expect(releasePlayer(state, player.id, marketConfig, config.economy)).toBe('released');
        expect(player.teamId).toBeNull();
        expect(player.contract).toBeNull();
        expect(state.club.budget).toBe(budgetBefore - buyout);
        expect(state.club.ledger.at(-1)?.kind).toBe('buyout');
        expect(state.teams[state.userTeamId]?.playerIds).toHaveLength(rosterBefore - 1);
        const starters = Object.values(state.teams[state.userTeamId]?.tactics.starters ?? {});
        expect(starters).not.toContain(player.id);
    });

    it('refuses to release below the roster minimum or without budget', () => {
        const state = createNewGame(config, 941, 'NYM');
        const team = state.teams[state.userTeamId];
        if (!team) {
            throw new Error('no team');
        }
        // Drain budget: cannot afford any buyout.
        state.club.budget = 0;
        const target = bestUserPlayer(state);
        expect(releasePlayer(state, target.id, marketConfig, config.economy)).toBe('cantAfford');

        // Shrink roster to the minimum: releases refused regardless of money.
        state.club.budget = 100_000_000;
        while (team.playerIds.length > marketConfig.roster.minPlayers) {
            const id = team.playerIds[team.playerIds.length - 1] as string;
            expect(releasePlayer(state, id, marketConfig, config.economy)).toBe('released');
        }
        const last = team.playerIds[0] as string;
        expect(releasePlayer(state, last, marketConfig, config.economy)).toBe('rosterMin');
    });
});

describe('team needs (M14)', () => {
    it('reports need for uncovered positions and surplus for stacked ones', () => {
        const state = createNewGame(config, 920, 'NYM');
        const needs = teamNeeds(state, 'NYM', marketConfig);
        expect(needs).toHaveLength(5);
        for (const need of needs) {
            expect(need.depth).toBeGreaterThanOrEqual(0);
            expect(need.need).toBe(2 - need.depth);
            expect(need.surplus).toBe(need.depth - marketConfig.ai.surplusDepth);
        }
    });
});

describe('youth intake (M11-M13)', () => {
    it('arrives after the intake round during the season', () => {
        const state = createNewGame(config, 930, 'NYM');
        while (state.currentRound <= marketConfig.youth.intakeRound) {
            advanceRoundInstant(state, config);
        }
        expect(state.market.youthIntakeDone).toBe(true);
    });

    it('better academies produce more and better prospects', () => {
        const low = createNewGame(config, 931, 'NYM');
        const high = createNewGame(config, 931, 'NYM');
        high.club.facilities.academy = 5;
        low.market.youthProspects = [];
        high.market.youthProspects = [];
        low.market.youthArrivalsThisSeason = 0;
        high.market.youthArrivalsThisSeason = 0;
        const lowProspects = runYouthIntake(low, marketConfig, config.economy, namePools, createRng(7), { markDone: false });
        const highProspects = runYouthIntake(high, marketConfig, config.economy, namePools, createRng(7), { markDone: false });
        expect(highProspects.length).toBeGreaterThan(lowProspects.length);
        const avg = (ps: typeof lowProspects) => ps.reduce((s, p) => s + p.player.potential, 0) / ps.length;
        expect(avg(highProspects)).toBeGreaterThan(avg(lowProspects));
        // Star band shrinks with academy level.
        const lowBand = (lowProspects[0]?.starMax ?? 0) - (lowProspects[0]?.starMin ?? 0);
        const highBand = (highProspects[0]?.starMax ?? 0) - (highProspects[0]?.starMin ?? 0);
        expect(highBand).toBeLessThanOrEqual(lowBand);
    });

    it('caps new academy arrivals at three per season', () => {
        const state = createNewGame(config, 936, 'NYM');
        expect(state.market.youthArrivalsThisSeason).toBeLessThanOrEqual(marketConfig.youth.maxProspectsPerSeason);

        state.market.youthArrivalsThisSeason = marketConfig.youth.maxProspectsPerSeason;
        const blocked = runYouthIntake(state, marketConfig, config.economy, namePools, createRng(12), { markDone: false });
        expect(blocked).toHaveLength(0);

        state.market.youthArrivalsThisSeason = 0;
        state.club.facilities.academy = 5;
        const prospects = runYouthIntake(state, marketConfig, config.economy, namePools, createRng(13), { markDone: false });
        expect(prospects).toHaveLength(3);
        expect(state.market.youthArrivalsThisSeason).toBe(3);
    });

    it('a signed talent can be sent back to the juniors and invited again', () => {
        const state = createNewGame(config, 933, 'NYM');
        const prospect = state.market.youthProspects[0];
        if (!prospect) {
            throw new Error('no seeded prospects');
        }
        expect(signYouth(state, prospect.player.id, marketConfig, economyConfig)).toBe('signed');
        expect(isAcademyPlayer(prospect.player)).toBe(true);

        expect(returnYouthToAcademy(state, prospect.player.id, marketConfig, economyConfig)).toBe(true);
        expect(prospect.player.teamId).toBeNull();
        expect(prospect.player.contract).toBeNull();
        expect(state.teams[state.userTeamId]?.playerIds).not.toContain(prospect.player.id);
        expect(state.market.youthProspects.some((p) => p.player.id === prospect.player.id)).toBe(true);
        // Starters never reference the departed player.
        const starters = Object.values(state.teams[state.userTeamId]?.tactics.starters ?? {});
        expect(starters).not.toContain(prospect.player.id);
        // And he can be signed again.
        expect(signYouth(state, prospect.player.id, marketConfig, economyConfig)).toBe('signed');
    });

    it('regular players cannot be sent to the juniors', () => {
        const state = createNewGame(config, 934, 'NYM');
        const veteran = bestUserPlayer(state);
        expect(returnYouthToAcademy(state, veteran.id, marketConfig, economyConfig)).toBe(false);
        expect(veteran.teamId).toBe(state.userTeamId);
    });

    it('signing a prospect adds him to the roster on a youth deal', () => {
        const state = createNewGame(config, 932, 'NYM');
        const prospects = runYouthIntake(state, marketConfig, config.economy, namePools, createRng(9));
        const prospect = prospects[0];
        if (!prospect) {
            throw new Error('no prospects generated');
        }
        // Make room (NYM roster may be at 13 of 14).
        expect(signYouth(state, prospect.player.id, marketConfig, economyConfig)).toBe('signed');
        expect(prospect.player.teamId).toBe(state.userTeamId);
        expect(prospect.player.contract?.salary).toBe(marketConfig.youth.salary);
        expect(state.teams[state.userTeamId]?.playerIds).toContain(prospect.player.id);
    });

    it('schedules one fixed academy talent per season', () => {
        const byTeam = new Map<string, string[]>();
        for (const def of youthAcademyProspects) {
            const ids = byTeam.get(def.teamId) ?? [];
            ids.push(def.id);
            byTeam.set(def.teamId, ids);
        }

        for (const team of leagueConfig.teams) {
            const state = createNewGame(config, 940 + team.id.charCodeAt(0), team.id);
            const expectedIds = byTeam.get(team.id) ?? [];
            expect(expectedIds.length).toBeGreaterThan(0);
            expect(state.market.pendingFixedYouthArrivals).toHaveLength(1);
            expect(state.market.pendingFixedYouthArrivals[0]?.playerId).toBe(expectedIds[0]);
            const arrival = state.market.pendingFixedYouthArrivals[0];
            expect(arrival?.arriveRound).toBeGreaterThanOrEqual(1);
            expect(arrival?.arriveRound).toBeLessThanOrEqual(12);
            const visibleFixed = state.market.youthProspects.filter((p) => expectedIds.includes(p.player.id));
            expect(visibleFixed.length).toBeLessThanOrEqual(1);
            const foreignIds = youthAcademyProspects.filter((p) => p.teamId !== team.id).map((p) => p.id);
            for (const id of foreignIds) {
                expect(state.market.youthProspects.some((p) => p.player.id === id)).toBe(false);
            }
        }
    });

    it('releases only the first fixed academy talent in season 1', () => {
        const state = createNewGame(config, 935, 'DEC');
        advanceThroughRound12(state);
        expect(state.market.pendingFixedYouthArrivals).toHaveLength(0);
        expect(state.market.youthProspects.some((p) => p.player.id === 'YTH-DEC-HOUSKA')).toBe(true);
        expect(state.market.youthProspects.some((p) => p.player.id === 'YTH-DEC-SERTIC')).toBe(false);
    });

    it('paces the second fixed academy talent into season 2', () => {
        const state = createNewGame(config, 935, 'DEC');
        advanceThroughRound12(state);
        completeSeason(state);
        startNextSeason(state, config, createRng(950));
        expect(state.market.pendingFixedYouthArrivals.some((a) => a.playerId === 'YTH-DEC-SERTIC')).toBe(true);
        advanceThroughRound12(state);
        expect(state.market.youthProspects.some((p) => p.player.id === 'YTH-DEC-SERTIC')).toBe(true);
    });

    it('seeds Marek Houška in Děčín youth academy with NBA upside', () => {
        const state = createNewGame(config, 935, 'DEC');
        advanceThroughRound12(state);
        const houska = state.market.youthProspects.find((p) => p.player.id === 'YTH-DEC-HOUSKA');
        expect(houska).toBeDefined();
        expect(houska?.player.firstName).toBe('Marek');
        expect(houska?.player.lastName).toBe('Houška');
        expect(houska?.player.position).toBe('PG');
        expect(houska?.player.age).toBe(16);
        expect(houska?.player.heightCm).toBe(194);
        expect(houska?.player.potential).toBe(92);
        expect(houska?.starMin).toBe(4);
        expect(houska?.starMax).toBe(5);
        expect(overallRating(houska!.player.attributes)).toBe(54);
    });

    it('seeds Lukáš Smazák in Písek with elite guard upside', () => {
        const state = createNewGame(config, 937, 'PIS');
        advanceThroughRound12(state);
        const smazak = state.market.youthProspects.find((p) => p.player.id === 'YTH-PIS-SMAZAK');
        expect(smazak).toBeDefined();
        expect(smazak?.player.potential).toBe(86);
        expect(smazak?.starMin).toBe(3.5);
        expect(smazak?.starMax).toBe(4.5);
        expect(overallRating(smazak!.player.attributes)).toBe(58);
    });

    it('seeds Michal Blabolil in USK with elite wing upside', () => {
        const state = createNewGame(config, 939, 'USK');
        advanceThroughRound12(state);
        const blabolil = state.market.youthProspects.find((p) => p.player.id === 'YTH-USK-BLABOLIL');
        expect(blabolil).toBeDefined();
        expect(blabolil?.player.potential).toBe(82);
        expect(blabolil?.starMin).toBe(3.5);
        expect(blabolil?.starMax).toBe(4);
        expect(overallRating(blabolil!.player.attributes)).toBe(53);
    });

    it('does not duplicate fixed prospect names in random youth intake', () => {
        const state = createNewGame(config, 938, 'DEC');
        runYouthIntake(state, marketConfig, config.economy, namePools, createRng(11), { markDone: true });
        const reserved = new Set(
            youthAcademyProspects.filter((p) => p.teamId === 'DEC').map((p) => `${p.firstName} ${p.lastName}`),
        );
        for (const prospect of state.market.youthProspects) {
            if (prospect.player.id.startsWith('YTH-DEC-')) {
                continue;
            }
            expect(reserved.has(`${prospect.player.firstName} ${prospect.player.lastName}`)).toBe(false);
        }
    });
});
