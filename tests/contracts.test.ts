import { describe, expect, it } from 'vitest';
import { externalOffersConfig } from '../src/config/externalOffers';
import { marketConfig } from '../src/config/market';
import {
    bclQualifiedNblTeams,
    canClubSignElite,
    isCorePlayer,
    isCzech,
    playerImportance,
    removePlayerAbroadNoFee,
    runSmartAiContractRenewals,
    walkAwayIntent,
} from '../src/core/contracts';
import { contractDemand, requiredSalary, bidOnPlayer, canNegotiate, runAiContractRenewals, transferValue, negotiationDemand } from '../src/core/market';
import { createNewGame } from '../src/core/game';
import type { Fixture, GameState, Player, PlayerId } from '../src/core/model/types';
import { createEmptyBoxLine, overallRating } from '../src/core/model/types';
import type { Rng } from '../src/core/rng';
import { testConfig as config } from './helpers';

function mockRng(): Rng {
    const rng: Rng = {
        next: () => 0,
        int: (_min, max) => max,
        chance: () => true,
        pick: (items) => items[0] as (typeof items)[number],
        weightedIndex: () => 0,
        shuffle: (items) => items,
        fork: () => rng,
    };
    return rng;
}

function addPlayedFixtures(state: GameState, playerId: PlayerId, teamId: string, games: number, points: number): void {
    const opponent = Object.keys(state.teams).find((id) => id !== teamId) ?? 'AWAY';
    for (let i = 0; i < games; i++) {
        const fixture: Fixture = {
            id: `test-${playerId}-${i}`,
            round: i + 1,
            homeTeamId: teamId,
            awayTeamId: opponent,
            result: {
                homeScore: 80,
                awayScore: 70,
                quarterScores: [[20, 18], [20, 18], [20, 17], [20, 17]],
                box: {
                    [playerId]: {
                        ...createEmptyBoxLine(),
                        points,
                        rebounds: 8,
                        assists: 5,
                        steals: 2,
                        blocks: 1,
                    },
                },
                seed: 1,
            },
            competitionId: 'nbl',
            week: i + 1,
        };
        state.fixtures.push(fixture);
    }
}

function czechStarter(state: GameState, teamId: string): Player {
    const team = state.teams[teamId];
    if (!team) {
        throw new Error(`missing team ${teamId}`);
    }
    for (const id of Object.values(team.tactics.starters)) {
        const player = state.players[id];
        if (player && isCzech(player)) {
            return player;
        }
    }
    throw new Error(`no Czech starter on ${teamId}`);
}

describe('smart AI contract renewals', () => {
    it('renews Czech core players with multi-year deals', () => {
        const state = createNewGame(config, 11001, 'DEC');
        state.lastSeasonStandings['NYM'] = 1;
        const player = czechStarter(state, 'NYM');
        if (player.contract) {
            player.contract.yearsLeft = 1;
        }
        expect(isCorePlayer(state, player, 'NYM')).toBe(true);

        runSmartAiContractRenewals(state, marketConfig, config.economy, externalOffersConfig, contractDemand, mockRng());
        expect(player.contract?.yearsLeft).toBeGreaterThanOrEqual(2);
        expect(player.teamId).toBe('NYM');
    });

    it('removes foreign overperformers on bottom-half teams abroad', () => {
        const state = createNewGame(config, 11002, 'NYM');
        const player = Object.values(state.players).find(
            (p) => p.teamId === 'DEC' && p.nationality !== 'CZE',
        );
        expect(player).toBeDefined();
        if (!player?.contract) {
            return;
        }
        player.contract.yearsLeft = 1;
        state.lastSeasonStandings['DEC'] = 12;
        addPlayedFixtures(state, player.id, 'DEC', 14, 28);
        expect(walkAwayIntent(state, player, 'DEC', marketConfig, externalOffersConfig)).toBeGreaterThanOrEqual(0.35);

        const id = player.id;
        runSmartAiContractRenewals(state, marketConfig, config.economy, externalOffersConfig, contractDemand, mockRng());
        expect(state.players[id]).toBeUndefined();
    });

    it('records abroad departures in renewal result', () => {
        const state = createNewGame(config, 11004, 'NYM');
        const player = Object.values(state.players).find(
            (p) => p.teamId === 'DEC' && p.nationality !== 'CZE',
        );
        expect(player).toBeDefined();
        if (!player?.contract) {
            return;
        }
        player.contract.yearsLeft = 1;
        state.lastSeasonStandings['DEC'] = 12;
        addPlayedFixtures(state, player.id, 'DEC', 14, 28);

        const result = runSmartAiContractRenewals(
            state,
            marketConfig,
            config.economy,
            externalOffersConfig,
            contractDemand,
            mockRng(),
        );
        expect(result.abroadStaged.some((s) => s.entry.kind === 'leftAbroad')).toBe(true);
    });

    it('runAiContractRenewals delegates to smart renewals', () => {
        const state = createNewGame(config, 11003, 'DEC');
        state.lastSeasonStandings['NYM'] = 1;
        const player = czechStarter(state, 'NYM');
        if (player.contract) {
            player.contract.yearsLeft = 1;
        }
        runAiContractRenewals(state, marketConfig, config.economy, mockRng());
        expect(player.contract?.yearsLeft).toBeGreaterThanOrEqual(2);
    });

    it('proactively renews core players one year before expiry', () => {
        const state = createNewGame(config, 11005, 'DEC');
        state.lastSeasonStandings['NYM'] = 1;
        const player = czechStarter(state, 'NYM');
        if (player.contract) {
            player.contract.yearsLeft = 2;
        }
        expect(isCorePlayer(state, player, 'NYM')).toBe(true);

        runSmartAiContractRenewals(state, marketConfig, config.economy, externalOffersConfig, contractDemand, mockRng());
        expect(player.contract?.yearsLeft).toBeGreaterThanOrEqual(2);
        expect(player.teamId).toBe('NYM');
    });
});

describe('BCL elite signing gate', () => {
    it('blocks mid-table clubs from signing elite free agents', () => {
        const state = createNewGame(config, 11010, 'DEC');
        state.lastSeasonStandings['NYM'] = 1;
        state.lastSeasonStandings['PCE'] = 2;
        state.lastSeasonStandings['DEC'] = 8;
        state.lastBclQualifierIds = ['NYM', 'PCE'];
        state.bclQualified = false;
        const elite = Object.values(state.players).find((p) => p.teamId === null && overallRating(p.attributes) >= 62);
        expect(elite).toBeDefined();
        if (!elite) {
            return;
        }
        expect(canClubSignElite(state, 'DEC', elite, 0, marketConfig, externalOffersConfig)).toBe(false);
        expect(canNegotiate(state, elite, marketConfig)).toBe(false);
    });

    it('allows BCL qualifiers to sign elite free agents', () => {
        const state = createNewGame(config, 11011, 'NYM');
        state.lastSeasonStandings['NYM'] = 1;
        state.lastSeasonStandings['PCE'] = 2;
        state.lastBclQualifierIds = ['NYM', 'PCE'];
        state.bclQualified = true;
        const qualifiers = bclQualifiedNblTeams(state, 2);
        expect(qualifiers).toContain('NYM');
        expect(qualifiers).not.toContain('DEC');
        const elite = Object.values(state.players).find((p) => p.teamId === null && overallRating(p.attributes) >= 62);
        expect(elite).toBeDefined();
        if (!elite) {
            return;
        }
        expect(canClubSignElite(state, 'NYM', elite, 0, marketConfig, externalOffersConfig)).toBe(true);
    });
});

describe('harder transfers from AI clubs', () => {
    it('Czech core starter on top team is effectively not for sale', () => {
        const state = createNewGame(config, 11020, 'DEC');
        state.lastSeasonStandings['NYM'] = 1;
        state.club.budget = 100_000_000;
        const player = czechStarter(state, 'NYM');
        const minPrice = transferValue(player, marketConfig, config.economy) * marketConfig.transfers.sellFactorCzechCore;
        const lowBid = bidOnPlayer(state, player.id, Math.floor(minPrice * 0.5), marketConfig, config.economy);
        expect(lowBid.status).toBe('notForSale');
        const highBid = bidOnPlayer(state, player.id, Math.floor(minPrice * 1.5), marketConfig, config.economy);
        expect(highBid.status).toBe('agreed');
    });
});

describe('user renewal performance penalty', () => {
    it('requires higher salary after a bad team finish', () => {
        const state = createNewGame(config, 11030, 'DEC');
        state.lastSeasonStandings['NYM'] = 1;
        state.lastSeasonStandings['PCE'] = 2;
        const foreign = Object.values(state.players).find((p) => p.teamId === 'DEC' && p.nationality !== 'CZE');
        expect(foreign).toBeDefined();
        if (!foreign) {
            return;
        }
        if (foreign.contract) {
            foreign.contract.yearsLeft = 1;
        }
        state.currentRound = marketConfig.contracts.renewalsOpenFromRound;
        foreign.morale = 60;
        addPlayedFixtures(state, foreign.id, 'DEC', 14, 8);

        state.lastSeasonStandings['DEC'] = 11;
        const badSalary = requiredSalary(state, foreign, 2, 'renew', marketConfig, config.economy);

        state.lastSeasonStandings['DEC'] = 1;
        state.bclQualified = true;
        const goodSalary = requiredSalary(state, foreign, 2, 'renew', marketConfig, config.economy);
        expect(badSalary).toBeGreaterThan(goodSalary);
    });
});

describe('removePlayerAbroadNoFee', () => {
    it('deletes player from AI roster without entering FA pool', () => {
        const state = createNewGame(config, 11040, 'NYM');
        const player = state.teams.PCE!.playerIds.map((id) => state.players[id]).find((p): p is Player => p !== undefined)!;
        player.nationality = 'USA';
        const id = player.id;
        removePlayerAbroadNoFee(state, player);
        expect(state.players[id]).toBeUndefined();
        expect(state.teams.PCE?.playerIds.includes(id)).toBe(false);
    });
});

describe('playerImportance', () => {
    it('scores Czech starters higher than bench foreigners', () => {
        const state = createNewGame(config, 11050, 'NYM');
        const czech = czechStarter(state, 'NYM');
        const foreign = Object.values(state.players).find(
            (p) => p.teamId === 'NYM' && !isCzech(p) && !Object.values(state.teams.NYM!.tactics.starters).includes(p.id),
        );
        expect(foreign).toBeDefined();
        if (!foreign) {
            return;
        }
        expect(playerImportance(state, czech, 'NYM')).toBeGreaterThan(playerImportance(state, foreign, 'NYM'));
    });
});

describe('BCL prestige flavour', () => {
    it('raises renewal acceptance for BCL-qualified clubs', () => {
        const state = createNewGame(config, 11060, 'NYM');
        state.lastSeasonStandings['NYM'] = 1;
        state.lastSeasonStandings['PCE'] = 2;
        state.lastBclQualifierIds = ['NYM', 'PCE'];
        state.bclQualified = true;
        const foreign = Object.values(state.players).find((p) => p.teamId === 'NYM' && p.nationality === 'USA');
        expect(foreign).toBeDefined();
        if (!foreign) {
            return;
        }
        if (foreign.contract) {
            foreign.contract.yearsLeft = 1;
        }
        foreign.age = 26;
        state.currentRound = marketConfig.contracts.renewalsOpenFromRound;
        foreign.morale = 60;

        const bclSalary = requiredSalary(state, foreign, 2, 'renew', marketConfig, config.economy);

        state.lastSeasonStandings['NYM'] = 10;
        state.lastBclQualifierIds = [];
        state.bclQualified = false;
        const midSalary = requiredSalary(state, foreign, 2, 'renew', marketConfig, config.economy);
        expect(bclSalary).toBeLessThan(midSalary);
    });

    it('reduces walk-away intent when club is in Champions League', () => {
        const state = createNewGame(config, 11061, 'NYM');
        state.lastSeasonStandings['NYM'] = 12;
        const foreign = Object.values(state.players).find((p) => p.teamId === 'NYM' && p.nationality === 'USA');
        expect(foreign).toBeDefined();
        if (!foreign) {
            return;
        }
        addPlayedFixtures(state, foreign.id, 'NYM', 14, 18);

        const withoutBcl = walkAwayIntent(state, foreign, 'NYM', marketConfig, externalOffersConfig);

        state.competitions.bcl = {
            id: 'bcl',
            phase: 'regularSeason',
            groups: [{ id: 'G1', teamIds: ['NYM', 'X1', 'X2', 'X3'], fixtures: [] }],
            fixtures: [],
            playoffs: null,
            qualifyingSeries: null,
            qualifyingEntrantId: null,
            qualifyingOpponentId: null,
            qualifiedTeamIds: ['NYM'],
            championTeamId: null,
            userFinish: null,
            prizePaid: false,
            weeklyPrizePaidTotal: 0,
        };
        const withBcl = walkAwayIntent(state, foreign, 'NYM', marketConfig, externalOffersConfig);
        expect(withBcl).toBeLessThan(withoutBcl);
    });

    it('lowers FA demand for ambitious players joining a BCL club', () => {
        const state = createNewGame(config, 11062, 'NYM');
        state.lastSeasonStandings['NYM'] = 1;
        state.lastBclQualifierIds = ['NYM', 'PCE'];
        state.bclQualified = true;
        const fa = Object.values(state.players).find((p) => p.teamId === null && p.nationality === 'USA');
        expect(fa).toBeDefined();
        if (!fa) {
            return;
        }
        fa.age = 25;
        const bclDemand = negotiationDemand(state, fa, 'freeAgent', marketConfig, config.economy);

        state.lastSeasonStandings['NYM'] = 9;
        state.lastBclQualifierIds = [];
        state.bclQualified = false;
        const midDemand = negotiationDemand(state, fa, 'freeAgent', marketConfig, config.economy);
        expect(bclDemand).toBeLessThan(midDemand);
    });
});
