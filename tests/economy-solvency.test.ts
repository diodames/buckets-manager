import { describe, expect, it } from 'vitest';
import { economyConfig } from '../src/config/economy';
import { leagueConfig } from '../src/config/league';
import {
    nblLeaguePrizeAmount,
    nblPlayoffPrizeAmount,
    payNblLeaguePrize,
    payNblPlayoffPrize,
    scaledSponsorSigningBonus,
    userTeamTier,
} from '../src/core/economy';
import { advanceRoundInstant, createNewGame } from '../src/core/game';
import { startPlayoffs } from '../src/core/playoffs';
import { testConfig as config } from './helpers';

function equipStandardSponsor(state: ReturnType<typeof createNewGame>): void {
    const profile = economyConfig.sponsors.ambitionProfiles.find((p) => p.id === 'standard');
    expect(profile).toBeDefined();
    const tier = 2;
    state.club.sponsors = [{
        id: 'sol-test',
        brandKey: 'banka',
        tier,
        perRound: economyConfig.sponsors.perRoundByTier[tier - 1] ?? 130_000,
        seasonsRemaining: 1,
        relationship: economyConfig.sponsors.startRelationship,
        promisedMaxRank: profile!.promisedMaxRank,
        bonusAmount: 0,
        signingBonus: 0,
    }];
    state.club.budget += scaledSponsorSigningBonus(profile!.signingBonus, userTeamTier(state), economyConfig);
}

function simulateRegularSeason(state: ReturnType<typeof createNewGame>, rounds = 22): void {
    for (let i = 0; i < rounds; i++) {
        advanceRoundInstant(state, config);
    }
}

function payMidTablePrizes(state: ReturnType<typeof createNewGame>, rank: number): void {
    state.lastSeasonStandings[state.userTeamId] = rank;
    payNblLeaguePrize(state, economyConfig);
    state.currentRound = 23;
    startPlayoffs(state, leagueConfig);
    state.playoffs!.championTeamId = 'NYM';
    state.playoffs!.thirdPlaceTeamId = 'PCE';
    payNblPlayoffPrize(state, economyConfig);
}

describe('economy solvency', () => {
    it('mid-table tier-3 club finishes comfortably in profit after one season', () => {
        const state = createNewGame(config, 8801, 'DEC');
        const start = state.club.budget;
        equipStandardSponsor(state);
        simulateRegularSeason(state);
        payMidTablePrizes(state, 6);
        const profit = state.club.budget - start;
        expect(profit).toBeGreaterThanOrEqual(500_000);
        expect(profit).toBeLessThanOrEqual(3_000_000);
    });

    it('tier-5 NYM stays solvent with a strong roster', () => {
        const state = createNewGame(config, 8802, 'NYM');
        const start = state.club.budget;
        equipStandardSponsor(state);
        simulateRegularSeason(state);
        state.lastSeasonStandings[state.userTeamId] = 1;
        payNblLeaguePrize(state, economyConfig);
        state.currentRound = 23;
        startPlayoffs(state, leagueConfig);
        state.playoffs!.championTeamId = 'NYM';
    state.playoffs!.thirdPlaceTeamId = 'PCE';
        payNblPlayoffPrize(state, economyConfig);
        expect(state.club.budget - start).toBeGreaterThanOrEqual(500_000);
    });

    it('tier-1 HKR avoids deep bankruptcy over one season', () => {
        const state = createNewGame(config, 8803, 'HKR');
        const start = state.club.budget;
        equipStandardSponsor(state);
        simulateRegularSeason(state);
        payMidTablePrizes(state, 10);
        expect(state.club.budget).toBeGreaterThan(start - 1_000_000);
    });

    it('AI NBL clubs keep finite budgets after a full regular season', () => {
        const state = createNewGame(config, 8804, 'DEC');
        equipStandardSponsor(state);
        simulateRegularSeason(state);
        for (const teamDef of leagueConfig.teams) {
            if (teamDef.id === state.userTeamId) {
                continue;
            }
            const fin = state.nblFinances[teamDef.id];
            expect(fin, teamDef.id).toBeDefined();
            expect(Number.isFinite(fin!.budget)).toBe(true);
        }
    });

    it('league and playoff prize tables remain meaningful', () => {
        expect(nblLeaguePrizeAmount(6, economyConfig)).toBe(500_000);
        expect(nblPlayoffPrizeAmount('playoffs', economyConfig)).toBe(50_000);
    });
});
