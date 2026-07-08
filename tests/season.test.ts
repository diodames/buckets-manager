import { describe, expect, it } from 'vitest';
import { economyConfig } from '../src/config/economy';
import {
    nblLeaguePrizeAmount,
    nblPlayoffPrizeAmount,
    payNblLeaguePrize,
    payNblPlayoffPrize,
    rolloverSponsors,
    sponsorTierRange,
} from '../src/core/economy';
import { createNewGame } from '../src/core/game';
import { graduateUnsignedYouthProspects, releaseExpiredPlayer, replenishFreeAgents } from '../src/core/market';
import { startPlayoffs } from '../src/core/playoffs';
import { canStartNextSeason, startNextSeason } from '../src/core/season';
import { canScoutPlayer, scoutedPlayerIds } from '../src/core/scouting';
import { createRng } from '../src/core/rng';
import { bclPrizeAmount } from '../src/core/bcl/prizes';
import { assignNblBclQualifiers, czechBclQualifiers, nblPlayoffBclQualifiers, nblPlayoffBclQualifyingEntrant, nblPlayoffFecQualifiers, startBclSeason } from '../src/core/bcl/index';
import { startFecSeason } from '../src/core/fec/index';
import { testConfig as config } from './helpers';

function simFullSeason(state: ReturnType<typeof createNewGame>): void {
    for (let i = 0; i < 200; i++) {
        if (canStartNextSeason(state, config)) {
            break;
        }
        try {
            const { advanceRoundInstant } = require('../src/core/game') as typeof import('../src/core/game');
            advanceRoundInstant(state, config);
        } catch {
            break;
        }
    }
}

function addUnsignedProspect(
    state: ReturnType<typeof createNewGame>,
    id: string,
    academySeasons: number,
) {
    const template = Object.values(state.players).find((p) => p.teamId === 'NYM');
    expect(template).toBeDefined();
    const prospect = {
        ...template!,
        id,
        firstName: 'Test',
        lastName: id,
        teamId: null,
        contract: null,
    };
    state.players[id] = prospect;
    state.market.youthProspects.push({
        player: prospect,
        starMin: 2,
        starMax: 3,
        quoteIndex: 0,
        decideByRound: state.currentRound + 3,
        academySeasons,
    });
    return prospect;
}

function finishPlayoffs(
    state: ReturnType<typeof createNewGame>,
    champion = 'NYM',
    thirdPlace = 'PCE',
): void {
    if (!state.playoffs) {
        state.currentRound = 23;
        startPlayoffs(state, config.league);
    }
    state.playoffs!.championTeamId = champion;
    state.playoffs!.thirdPlaceTeamId = thirdPlace;
}

function endSeason(state: ReturnType<typeof createNewGame>) {
    finishPlayoffs(state);
}

describe('season rollover', () => {
    it('increments seasonYear and resets league state', () => {
        const state = createNewGame(config, 5001, 'NYM');
        simFullSeason(state);
        if (!canStartNextSeason(state, config)) {
            finishPlayoffs(state);
        }
        expect(canStartNextSeason(state, config)).toBe(true);
        const beforeYear = state.seasonYear;
        const summary = startNextSeason(state, config, createRng(99));
        expect(state.seasonYear).toBe(beforeYear + 1);
        expect(state.currentRound).toBe(1);
        expect(state.calendarWeek).toBe(1);
        expect(state.playoffs).toBeNull();
        expect(state.fixtures.every((f) => f.result === null)).toBe(true);
        expect(summary.nblPrize).toBeGreaterThanOrEqual(0);
    });

    it('seeds scout reports for replenished free agents after rollover', () => {
        const state = createNewGame(config, 5010, 'NYM');
        simFullSeason(state);
        if (!canStartNextSeason(state, config)) {
            finishPlayoffs(state);
        }
        startNextSeason(state, config, createRng(5010));
        expect(state.market.scoutingComplete).toBe(false);
        expect(state.currentRound).toBe(1);
        const freeAgents = Object.values(state.players).filter(
            (p) => p.teamId === null && p.contract === null && (p.id.startsWith('FA-') || p.id.startsWith('SM-')),
        );
        expect(freeAgents.length).toBeGreaterThan(0);
        for (const player of freeAgents) {
            expect(state.market.scoutedFreeAgents[player.id]).toBeDefined();
            expect(canScoutPlayer(state, player.id)).toBe(true);
        }
        expect(scoutedPlayerIds(state).length).toBeGreaterThanOrEqual(freeAgents.length);
    });

    it('expires contracts and releases players to free agency', () => {
        const state = createNewGame(config, 5002, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'NYM');
        expect(player).toBeDefined();
        if (player) {
            player.contract = { salary: 500_000, yearsLeft: 1 };
        }
        endSeason(state);
        startNextSeason(state, config, createRng(100));
        if (player) {
            expect(player.teamId).toBeNull();
            expect(player.contract).toBeNull();
            expect(player.age).toBeGreaterThan(16);
        }
    });

    it('replenishes free agent pool', () => {
        const state = createNewGame(config, 5003, 'NYM');
        endSeason(state);
        const before = Object.values(state.players).filter((p) => p.teamId === null && p.contract === null).length;
        startNextSeason(state, config, createRng(101));
        const after = Object.values(state.players).filter((p) => p.teamId === null && p.contract === null).length;
        expect(after).toBeGreaterThanOrEqual(before);
    });

    it('graduates unsigned youth after two seasons to the free-agent market', () => {
        const state = createNewGame(config, 5004, 'NYM');
        const graduateId = 'YTH-GRAD-TEST';
        const graduate = addUnsignedProspect(state, graduateId, 1);

        endSeason(state);
        const summary = startNextSeason(state, config, createRng(200));

        expect(summary.youthGraduated).toBe(1);
        expect(summary.playerMovements.some((m) =>
            m.kind === 'freeAgent' && m.reason === 'youthGraduate' && m.name.includes('GRAD-TEST'),
        )).toBe(true);
        expect(state.market.youthProspects.some((p) => p.player.id === graduateId)).toBe(false);
        expect(graduate.teamId).toBeNull();
        expect(graduate.contract).toBeNull();
        expect(state.players[graduateId]).toBeDefined();
    });

    it('records expired contracts in playerMovements', () => {
        const state = createNewGame(config, 5006, 'NYM');
        const player = Object.values(state.players).find((p) => p.teamId === 'NYM');
        expect(player).toBeDefined();
        if (player) {
            player.contract = { salary: 500_000, yearsLeft: 1 };
        }
        endSeason(state);
        const summary = startNextSeason(state, config, createRng(201));
        expect(summary.playerMovements.some((m) =>
            m.kind === 'freeAgent' && m.reason === 'expired' && m.isUserPlayer,
        )).toBe(true);
    });

    it('includes playerMovements array in offseason summary', () => {
        const state = createNewGame(config, 5007, 'NYM');
        endSeason(state);
        const summary = startNextSeason(state, config, createRng(202));
        expect(Array.isArray(summary.playerMovements)).toBe(true);
    });

    it('graduateUnsignedYouthProspects keeps prospects below the season limit', () => {
        const state = createNewGame(config, 5005, 'NYM');
        const prospectId = 'YTH-YOUNG-TEST';
        addUnsignedProspect(state, prospectId, 0);

        const graduated = graduateUnsignedYouthProspects(state, config.market.youth.maxUnsignedSeasons);

        expect(graduated.count).toBe(0);
        const kept = state.market.youthProspects.find((p) => p.player.id === prospectId);
        expect(kept?.academySeasons).toBe(1);
    });
});

describe('offseason economy', () => {
    it('pays playoff prize money once', () => {
        const state = createNewGame(config, 6001, 'NYM');
        state.currentRound = 23;
        startPlayoffs(state, config.league);
        state.playoffs!.championTeamId = 'NYM';
        const amount = payNblPlayoffPrize(state, economyConfig);
        expect(amount).toBe(nblPlayoffPrizeAmount('champion', economyConfig));
        expect(state.nblPrizePaid).toBe(true);
        expect(payNblPlayoffPrize(state, economyConfig)).toBe(0);
    });

    it('pays league table prize by regular-season rank', () => {
        expect(nblLeaguePrizeAmount(1, economyConfig)).toBe(1_500_000);
        expect(nblLeaguePrizeAmount(2, economyConfig)).toBe(1_100_000);
        expect(nblLeaguePrizeAmount(4, economyConfig)).toBe(650_000);
        expect(nblLeaguePrizeAmount(9, economyConfig)).toBe(400_000);
        expect(nblLeaguePrizeAmount(11, economyConfig)).toBe(200_000);
        expect(nblLeaguePrizeAmount(12, economyConfig)).toBe(130_000);

        const state = createNewGame(config, 6004, 'NYM');
        state.lastSeasonStandings[state.userTeamId] = 4;
        const league = payNblLeaguePrize(state, economyConfig);
        expect(league.rank).toBe(4);
        expect(league.amount).toBe(650_000);
        expect(state.club.ledger.some((e) => e.kind === 'leaguePrize' && e.amount === 650_000)).toBe(true);
    });

    it('includes league prize in offseason summary', () => {
        const state = createNewGame(config, 6005, 'NYM');
        for (const f of state.fixtures) {
            f.result = {
                homeScore: f.homeTeamId === 'NYM' ? 90 : 70,
                awayScore: f.awayTeamId === 'NYM' ? 90 : 70,
                quarterScores: [[22, 20], [22, 20], [23, 15], [23, 15]],
                box: {},
                seed: 1,
            };
        }
        endSeason(state);
        const summary = startNextSeason(state, config, createRng(103));
        expect(summary.nblLeagueRank).toBe(1);
        expect(summary.nblLeaguePrize).toBe(1_500_000);
    });

    it('expires sponsor deals after season rollover', () => {
        const state = createNewGame(config, 6002, 'NYM');
        state.club.sponsors = [{
            id: 'd1', brandKey: 'banka', tier: 4, perRound: 280_000, seasonsRemaining: 1, relationship: 55,
            promisedMaxRank: 6, bonusAmount: 0, signingBonus: 0,
        }];
        const expired = rolloverSponsors(state);
        expect(expired).toBe(true);
        expect(state.club.sponsors).toHaveLength(0);
    });

    it('generates three ambition sponsor offers after rollover', () => {
        const state = createNewGame(config, 6003, 'NYM');
        state.currentRound = 23;
        startPlayoffs(state, config.league);
        finishPlayoffs(state);
        startNextSeason(state, config, createRng(102));
        expect(state.club.sponsorOffers).toHaveLength(3);
        expect(state.club.sponsorOffers.map((o) => o.ambitionId).sort()).toEqual(['bold', 'safe', 'standard']);
    });

    it('maps table position to sponsor tier interest', () => {
        const top = sponsorTierRange(1, economyConfig, false);
        expect(top.tierMin).toBeGreaterThanOrEqual(4);
        const bottom = sponsorTierRange(12, economyConfig, false);
        expect(bottom.tierMax).toBeLessThanOrEqual(2);
        const bclBump = sponsorTierRange(6, economyConfig, true);
        expect(bclBump.tierMin).toBeGreaterThan(sponsorTierRange(6, economyConfig, false).tierMin);
    });
});

describe('BCL', () => {
    it('falls back to the regular-season table when playoffs are incomplete', () => {
        const state = createNewGame(config, 7001, 'NYM');
        for (const f of state.fixtures) {
            if (f.homeTeamId === 'NYM' || f.awayTeamId === 'NYM') {
                f.result = {
                    homeScore: f.homeTeamId === 'NYM' ? 90 : 70,
                    awayScore: f.awayTeamId === 'NYM' ? 90 : 70,
                    quarterScores: [[22, 20], [22, 20], [23, 15], [23, 15]],
                    box: {},
                    seed: 1,
                };
            }
        }
        const qualifiers = czechBclQualifiers(state, 2, config.league);
        expect(qualifiers).toHaveLength(2);
        expect(qualifiers[0]).toBe('NYM');
    });

    it('qualifies the NBL playoff champion and finalist for BCL', () => {
        const state = createNewGame(config, 7006, 'DEC');
        state.currentRound = 23;
        startPlayoffs(state, config.league);
        const finalsStage = config.league.playoffs.winsNeeded.length - 1;
        state.playoffs!.series.push({
            id: 'PO2-0',
            stage: finalsStage,
            slot: 0,
            homeTeamId: 'DEC',
            awayTeamId: 'NYM',
            homeWins: 3,
            awayWins: 1,
            games: [],
        });
        state.playoffs!.championTeamId = 'DEC';
        state.playoffs!.thirdPlaceTeamId = 'BRN';
        state.playoffs!.thirdPlaceSeries = {
            id: 'PO3RD-0',
            stage: 3,
            slot: 0,
            homeTeamId: 'BRN',
            awayTeamId: 'PCE',
            homeWins: 2,
            awayWins: 0,
            games: [],
        };

        expect(nblPlayoffBclQualifiers(state, 2, config.league)).toEqual(['DEC', 'NYM']);
        expect(nblPlayoffBclQualifyingEntrant(state)).toBe('BRN');
        expect(nblPlayoffFecQualifiers(state)).toEqual(['PCE']);

        assignNblBclQualifiers(state, 2, config.league);
        expect(state.bclQualified).toBe(true);
        expect(state.lastBclQualifierIds).toEqual(['DEC', 'NYM']);
        expect(state.bclQualifyingEntrantId).toBe('BRN');
        expect(state.lastFecQualifierIds).toEqual(['PCE']);
    });

    it('offseason rollover qualifies playoff winner despite mid-table regular season finish', () => {
        const state = createNewGame(config, 7007, 'DEC');
        for (const f of state.fixtures) {
            f.result = {
                homeScore: f.homeTeamId === 'DEC' ? 72 : 80,
                awayScore: f.awayTeamId === 'DEC' ? 72 : 80,
                quarterScores: [[18, 20], [18, 20], [18, 20], [18, 20]],
                box: {},
                seed: 1,
            };
        }
        endSeason(state);
        finishPlayoffs(state, 'DEC', 'NYM');
        const finalsStage = config.league.playoffs.winsNeeded.length - 1;
        state.playoffs!.series.push({
            id: 'PO2-0',
            stage: finalsStage,
            slot: 0,
            homeTeamId: 'DEC',
            awayTeamId: 'NYM',
            homeWins: 3,
            awayWins: 2,
            games: [],
        });

        const summary = startNextSeason(state, config, createRng(104));
        expect(summary.bclQualified).toBe(true);
        expect(state.lastBclQualifierIds).toContain('DEC');
    });

    it('starts BCL season with 32 teams in 8 groups', () => {
        const state = createNewGame(config, 7002, 'NYM');
        state.currentRound = 23;
        for (const f of state.fixtures) {
            f.result = {
                homeScore: 80, awayScore: 75,
                quarterScores: [[20, 18], [20, 19], [20, 19], [20, 19]],
                box: {}, seed: 1,
            };
        }
        const comp = startBclSeason(state, config.bcl, config.league, createRng(42));
        expect(comp).not.toBeNull();
        expect(comp!.groups).toHaveLength(8);
        expect(comp!.qualifiedTeamIds.length).toBeGreaterThanOrEqual(28);
        expect(comp!.fixtures.length).toBeGreaterThan(0);
    });

    it('calculates BCL champion prize', () => {
        const amount = bclPrizeAmount('champion', config.bcl);
        expect(amount).toBeGreaterThan(7_500_000);
        expect(amount).toBeLessThan(8_500_000);
        expect(bclPrizeAmount('groupStage', config.bcl)).toBe(
            config.bcl.prizes.entry + config.bcl.prizes.groupStage,
        );
    });

    it('starts FEC season with 10 regular-season groups', () => {
        const state = createNewGame(config, 7010, 'PCE');
        finishPlayoffs(state, 'NYM', 'BRN');
        state.playoffs!.thirdPlaceSeries = {
            id: 'PO3RD-0',
            stage: 3,
            slot: 0,
            homeTeamId: 'BRN',
            awayTeamId: 'PCE',
            homeWins: 0,
            awayWins: 2,
            games: [],
        };
        state.playoffs!.thirdPlaceTeamId = 'BRN';
        assignNblBclQualifiers(state, 2, config.league);
        const comp = startFecSeason(state, config.fec, createRng(43));
        expect(comp).not.toBeNull();
        expect(comp!.groups).toHaveLength(10);
        expect(comp!.qualifiedTeamIds).toContain('PCE');
        expect(state.fecQualified).toBe(true);
    });
});

describe('market expiry', () => {
    it('releaseExpiredPlayer sends player to FA pool', () => {
        const state = createNewGame(config, 8001, 'NYM');
        const player = state.players[state.teams.NYM!.playerIds[0] as string];
        expect(player).toBeDefined();
        if (!player) {
            return;
        }
        player.contract = { salary: 400_000, yearsLeft: 0 };
        releaseExpiredPlayer(state, player);
        expect(player.teamId).toBeNull();
        expect(player.contract).toBeNull();
    });

    it('replenishFreeAgents adds new players', () => {
        const state = createNewGame(config, 8002, 'NYM');
        const added = replenishFreeAgents(state, 20, config.names, config.balance, createRng(5));
        expect(added).toBeGreaterThan(0);
    });
});
