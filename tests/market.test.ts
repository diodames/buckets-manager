import { describe, expect, it } from 'vitest';
import { marketConfig } from '../src/config/market';
import { advanceRoundInstant, createNewGame } from '../src/core/game';
import {
    acceptTransferOffer, bidOnPlayer, canNegotiate, contractDemand, executePurchase, listPlayer,
    negotiateOffer, runYouthIntake, signYouth, teamNeeds, transferValue,
} from '../src/core/market';
import type { Player } from '../src/core/model/types';
import { overallRating } from '../src/core/model/types';
import { createRng } from '../src/core/rng';
import { namePools } from '../src/config/names';
import { testConfig as config } from './helpers';

function bestUserPlayer(state: ReturnType<typeof createNewGame>): Player {
    const team = state.teams[state.userTeamId];
    const players = (team?.playerIds ?? []).map((id) => state.players[id]).filter((p): p is Player => p !== undefined);
    return players.sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes))[0] as Player;
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
        expect(freeAgents.length).toBeGreaterThanOrEqual(10);
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
        const low = negotiateOffer(state, freeAgent.id, { salary: 100_000, years: 1 }, 'freeAgent', marketConfig, config.economy);
        expect(low.status).toBe('rejected');
        const follow = negotiateOffer(state, freeAgent.id, { salary: low.hintSalary ?? 0, years: 1 }, 'freeAgent', marketConfig, config.economy);
        expect(follow.status).toBe('accepted');
        expect(freeAgent.teamId).toBe(state.userTeamId);
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

    it('bids respect the transfer window deadline', () => {
        const state = createNewGame(config, 912, 'NYM');
        state.currentRound = marketConfig.transfers.deadlineRound + 1;
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
        const lowProspects = runYouthIntake(low, marketConfig, config.economy, namePools, createRng(7));
        const highProspects = runYouthIntake(high, marketConfig, config.economy, namePools, createRng(7));
        expect(highProspects.length).toBeGreaterThan(lowProspects.length);
        const avg = (ps: typeof lowProspects) => ps.reduce((s, p) => s + p.player.potential, 0) / ps.length;
        expect(avg(highProspects)).toBeGreaterThan(avg(lowProspects));
        // Star band shrinks with academy level.
        const lowBand = (lowProspects[0]?.starMax ?? 0) - (lowProspects[0]?.starMin ?? 0);
        const highBand = (highProspects[0]?.starMax ?? 0) - (highProspects[0]?.starMin ?? 0);
        expect(highBand).toBeLessThanOrEqual(lowBand);
    });

    it('signing a prospect adds him to the roster on a youth deal', () => {
        const state = createNewGame(config, 932, 'NYM');
        const prospects = runYouthIntake(state, marketConfig, config.economy, namePools, createRng(9));
        const prospect = prospects[0];
        if (!prospect) {
            throw new Error('no prospects generated');
        }
        // Make room (NYM roster may be at 13 of 14).
        expect(signYouth(state, prospect.player.id, marketConfig)).toBe(true);
        expect(prospect.player.teamId).toBe(state.userTeamId);
        expect(prospect.player.contract?.salary).toBe(marketConfig.youth.salary);
        expect(state.teams[state.userTeamId]?.playerIds).toContain(prospect.player.id);
    });
});
