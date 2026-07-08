import { describe, expect, it } from 'vitest';
import { externalOffersConfig } from '../src/config/externalOffers';
import {
    acceptExternalOffer,
    aggregatePlayerSeasonStats,
    breakthroughRatio,
    computeSalaryOffer,
    computeTransferFee,
    evaluateBreakthroughOffers,
    expectedGameScore,
    rejectExternalOffer,
    tickExternalOffers,
} from '../src/core/breakthrough';
import { createNewGame, SAVE_FORMAT_VERSION } from '../src/core/game';
import { negotiateOffer } from '../src/core/market';
import { createEmptyBoxLine, overallRating, type Fixture, type GameState, type PlayerId } from '../src/core/model/types';
import { deserializeSave } from '../src/core/save/save';
import { createRng } from '../src/core/rng';
import { testConfig } from './helpers';

function makeBox(playerId: PlayerId, points: number) {
    return {
        homeScore: 80,
        awayScore: 70,
        quarterScores: [[20, 18], [20, 18], [20, 17], [20, 17]] as Array<[number, number]>,
        box: {
            [playerId]: {
                ...createEmptyBoxLine(),
                points,
                rebounds: 6,
                assists: 4,
                steals: 1,
                blocks: 1,
            },
        },
        seed: 1,
    };
}

function addPlayedFixtures(state: GameState, playerId: PlayerId, games: number, points: number): void {
    for (let i = 0; i < games; i++) {
        const fixture: Fixture = {
            id: `test-${playerId}-${i}`,
            round: i + 1,
            homeTeamId: state.userTeamId,
            awayTeamId: Object.keys(state.teams).find((id) => id !== state.userTeamId) ?? 'AWAY',
            result: makeBox(playerId, points),
            competitionId: 'nbl',
            week: i + 1,
        };
        state.fixtures.push(fixture);
    }
}

describe('aggregatePlayerSeasonStats', () => {
    it('sums box scores across NBL fixtures', () => {
        const state = createNewGame(testConfig, 42, 'NYM');
        const playerId = state.teams.NYM!.playerIds[0]!;
        addPlayedFixtures(state, playerId, 14, 20);
        const stats = aggregatePlayerSeasonStats(state, playerId);
        expect(stats.games).toBe(14);
        expect(stats.ppg).toBe(20);
        expect(stats.gameScore).toBeGreaterThan(25);
    });
});

describe('breakthroughRatio', () => {
    it('rewards production above rating expectation', () => {
        const expected = expectedGameScore(68, externalOffersConfig);
        const ratio = breakthroughRatio(32, 68, externalOffersConfig);
        expect(ratio).toBeGreaterThan(1.28);
        expect(expected).toBeCloseTo(24.56, 1);
    });
});

describe('financial formulas', () => {
    it('caps salary offers within configured limits', () => {
        const state = createNewGame(testConfig, 7, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'NYM')!;
        const bclSalary = computeSalaryOffer(state, player, 'bcl', testConfig.market, testConfig.economy, externalOffersConfig);
        const euroSalary = computeSalaryOffer(state, player, 'euroleague', testConfig.market, testConfig.economy, externalOffersConfig);
        expect(bclSalary).toBeLessThanOrEqual(externalOffersConfig.salary.bclCap);
        expect(euroSalary).toBeLessThanOrEqual(externalOffersConfig.salary.euroCap);
        expect(euroSalary).toBeGreaterThan(bclSalary);
    });

    it('scales transfer fees by tier and breakthrough severity', () => {
        const state = createNewGame(testConfig, 8, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'NYM')!;
        const ratio = 1.45;
        const bclFee = computeTransferFee(player, 'bcl', ratio, testConfig.market, testConfig.economy, externalOffersConfig);
        const euroFee = computeTransferFee(player, 'euroleague', ratio, testConfig.market, testConfig.economy, externalOffersConfig);
        expect(euroFee).toBeGreaterThan(bclFee);
        expect(bclFee % externalOffersConfig.fee.roundTo).toBe(0);
    });
});

describe('evaluateBreakthroughOffers', () => {
    it('generates offers for a breakout user player', () => {
        const state = createNewGame(testConfig, 99, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'NYM')!;
        player.age = 24;
        player.potential = overallRating(player.attributes) + 8;
        addPlayedFixtures(state, player.id, 15, 26);
        const offers = evaluateBreakthroughOffers(state, testConfig, createRng(100));
        expect(offers.length).toBeGreaterThan(0);
        expect(offers[0]?.playerId).toBe(player.id);
        expect(offers[0]?.transferFee).toBeGreaterThan(0);
        expect(offers[0]?.salaryOffer).toBeGreaterThan(player.contract!.salary);
    });

    it('skips players with too few games', () => {
        const state = createNewGame(testConfig, 101, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'NYM')!;
        addPlayedFixtures(state, player.id, 5, 30);
        const offers = evaluateBreakthroughOffers(state, testConfig, createRng(102));
        expect(offers).toHaveLength(0);
    });

    it('issues at most one offer even when several players qualify', () => {
        const state = createNewGame(testConfig, 103, 'NYM');
        const team = state.teams.NYM!;
        const players = team.playerIds
            .map((id) => state.players[id])
            .filter((p): p is NonNullable<typeof p> => p !== undefined)
            .slice(0, 2);
        for (const player of players) {
            player.age = 24;
            player.potential = overallRating(player.attributes) + 8;
            addPlayedFixtures(state, player.id, 15, 26);
        }
        const offers = evaluateBreakthroughOffers(state, testConfig, createRng(104));
        expect(offers).toHaveLength(1);
    });
});

describe('acceptExternalOffer', () => {
    it('credits ledger and removes the player', () => {
        const state = createNewGame(testConfig, 55, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'NYM')!;
        const budgetBefore = state.club.budget;
        const offer = {
            id: 'test-offer',
            playerId: player.id,
            tier: 'bcl' as const,
            clubName: 'Test Club',
            clubCity: 'Test',
            transferFee: 5_000_000,
            salaryOffer: 4_000_000,
            contractYears: 2 as const,
            breakthroughRatio: 1.35,
            seasonPpg: 18,
            seasonGameScore: 26,
            seasonYear: state.seasonYear,
            expiresRound: 4,
            status: 'pending' as const,
        };
        state.market.externalOffers = [offer];
        const ok = acceptExternalOffer(state, offer.id, testConfig.economy, externalOffersConfig, testConfig.market);
        expect(ok).toBe(true);
        expect(state.players[player.id]).toBeUndefined();
        expect(state.club.budget).toBe(budgetBefore + 5_000_000);
        expect(offer.status).toBe('accepted');
    });
});

describe('externalRetention negotiation', () => {
    it('accepts a high counter near the foreign benchmark', () => {
        const state = createNewGame(testConfig, 66, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'NYM')!;
        player.morale = 85;
        state.club.budget = 50_000_000;
        const offer = {
            id: 'retain-offer',
            playerId: player.id,
            tier: 'bcl' as const,
            clubName: 'Test Club',
            clubCity: 'Test',
            transferFee: 5_000_000,
            salaryOffer: 4_500_000,
            contractYears: 2 as const,
            breakthroughRatio: 1.35,
            seasonPpg: 18,
            seasonGameScore: 26,
            seasonYear: state.seasonYear,
            expiresRound: 4,
            status: 'pending' as const,
        };
        state.market.externalOffers = [offer];
        state.market.negotiations.push({
            playerId: player.id,
            round: 1,
            hintSalary: null,
            mode: 'externalRetention',
            externalOfferId: offer.id,
        });
        const result = negotiateOffer(
            state,
            player.id,
            { salary: 4_200_000, years: 3 },
            'externalRetention',
            testConfig.market,
            testConfig.economy,
            { externalOffers: externalOffersConfig },
        );
        expect(result.status).toBe('accepted');
        expect(offer.status).toBe('retained');
        expect(player.contract?.salary).toBe(4_200_000);
    });

    it('rejects a low NBL-fair counter', () => {
        const state = createNewGame(testConfig, 67, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'NYM')!;
        const offer = {
            id: 'retain-low',
            playerId: player.id,
            tier: 'euroleague' as const,
            clubName: 'Test Club',
            clubCity: 'Test',
            transferFee: 12_000_000,
            salaryOffer: 9_000_000,
            contractYears: 3 as const,
            breakthroughRatio: 1.5,
            seasonPpg: 22,
            seasonGameScore: 30,
            seasonYear: state.seasonYear,
            expiresRound: 4,
            status: 'pending' as const,
        };
        state.market.externalOffers = [offer];
        state.market.negotiations.push({
            playerId: player.id,
            round: 1,
            hintSalary: null,
            mode: 'externalRetention',
            externalOfferId: offer.id,
        });
        const result = negotiateOffer(
            state,
            player.id,
            { salary: 800_000, years: 2 },
            'externalRetention',
            testConfig.market,
            testConfig.economy,
            { externalOffers: externalOffersConfig },
        );
        expect(result.status).toBe('rejected');
        expect(offer.status).toBe('pending');
    });
});

describe('tickExternalOffers', () => {
    it('removes player without fee when offer expires unanswered', () => {
        const state = createNewGame(testConfig, 77, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'NYM')!;
        const offer = {
            id: 'expire-offer',
            playerId: player.id,
            tier: 'bcl' as const,
            clubName: 'Test Club',
            clubCity: 'Test',
            transferFee: 5_000_000,
            salaryOffer: 4_000_000,
            contractYears: 2 as const,
            breakthroughRatio: 1.35,
            seasonPpg: 18,
            seasonGameScore: 26,
            seasonYear: state.seasonYear,
            expiresRound: 4,
            status: 'pending' as const,
        };
        state.market.externalOffers = [offer];
        state.currentRound = 5;
        const budgetBefore = state.club.budget;
        tickExternalOffers(state, testConfig.economy, externalOffersConfig, testConfig.market);
        expect(state.players[player.id]).toBeUndefined();
        expect(state.club.budget).toBe(budgetBefore);
        expect(offer.status).toBe('departed');
    });
});

describe('rejectExternalOffer', () => {
    it('lowers morale and may mark force departure for Euroleague', () => {
        const state = createNewGame(testConfig, 88, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'NYM')!;
        const moraleBefore = player.morale;
        const offer = {
            id: 'reject-offer',
            playerId: player.id,
            tier: 'euroleague' as const,
            clubName: 'Test Club',
            clubCity: 'Test',
            transferFee: 12_000_000,
            salaryOffer: 9_000_000,
            contractYears: 3 as const,
            breakthroughRatio: 1.5,
            seasonPpg: 22,
            seasonGameScore: 30,
            seasonYear: state.seasonYear,
            expiresRound: 4,
            status: 'pending' as const,
        };
        state.market.externalOffers = [offer];
        rejectExternalOffer(state, offer.id, externalOffersConfig, createRng(1));
        expect(player.morale).toBeLessThan(moraleBefore);
        expect(offer.status).toBe('rejected');
    });
});

describe('save migration v8 -> v9', () => {
    it('adds externalOffers to market state', () => {
        const raw = JSON.stringify({
            formatVersion: 8,
            name: 'test',
            savedAtIso: '2026-01-01',
            state: {
                version: 8,
                masterSeed: 1,
                userTeamId: 'NYM',
                seasonYear: 2025,
                currentRound: 1,
                calendarWeek: 1,
                teams: {},
                players: {},
                fixtures: [],
                club: { budget: 0, fanSupport: 50, ticketPrice: 220, facilities: {}, facilityProjects: {}, sponsors: [], sponsorOffers: [], ledger: [], trainingFocus: 'balanced' },
                market: { listings: [], incomingOffers: [], negotiations: [], negotiationLocks: {}, youthProspects: [], youthArrivalsThisSeason: 0, youthIntakeDone: false, pendingFixedYouthArrivals: [], pendingFreeAgents: [], processedDepartureKeys: [], signingHints: {} },
                playoffs: null,
                competitions: {},
                lastSeasonStandings: {},
                nblPrizePaid: false,
                lastOffseason: null,
                bclQualified: false,
            },
        });
        const save = deserializeSave(raw);
        expect(save.state.market.externalOffers).toEqual([]);
        expect(save.state.club.ticketPrice).toBe(220);
        expect(save.state.market.pendingFixedYouthArrivals).toEqual([]);
        expect(save.state.club.facilityProjects).toEqual({});
        expect(save.formatVersion).toBe(SAVE_FORMAT_VERSION);
    });
});
