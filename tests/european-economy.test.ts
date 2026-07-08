import { describe, expect, it } from 'vitest';
import { bclConfig } from '../src/config/bcl';
import { economyConfig } from '../src/config/economy';
import { fecConfig } from '../src/config/fec';
import { bclPrizeAmount, bclSettlementAmount, payBclPrize } from '../src/core/bcl/prizes';
import { europeanEconomyTicks } from '../src/core/economy';
import { createNewGame } from '../src/core/game';
import type { Fixture } from '../src/core/model/types';
import { testConfig as config } from './helpers';

describe('european economy', () => {
    it('books match fee and travel on an away BCL fixture', () => {
        const state = createNewGame(config, 9910, 'NYM');
        state.bclQualified = true;
        state.competitions.bcl = {
            id: 'bcl',
            phase: 'regularSeason',
            fixtures: [],
            groups: [],
            playoffs: null,
            qualifyingSeries: null,
            qualifyingEntrantId: null,
            qualifyingOpponentId: null,
            qualifiedTeamIds: [],
            championTeamId: null,
            prizePaid: false,
            weeklyPrizePaidTotal: 0,
            userFinish: null,
        };
        const fixture: Fixture = {
            id: 'bcl-away',
            homeTeamId: 'BCL-RYT',
            awayTeamId: 'NYM',
            result: { homeScore: 80, awayScore: 75, quarterScores: [[20, 18], [20, 18], [20, 19], [20, 20]], box: {}, seed: 1 },
            round: 1,
            week: 2,
            competitionId: 'bcl',
        };
        const before = state.club.budget;
        const { income, expenses } = europeanEconomyTicks(state, fixture, economyConfig, bclConfig, fecConfig, 2);
        expect(income).toBeGreaterThan(0);
        expect(expenses).toBe(economyConfig.european.travelCost.bcl);
        expect(state.club.budget).toBe(before + income - expenses);
        expect(state.competitions.bcl?.weeklyPrizePaidTotal).toBe(income);
        expect(state.club.ledger.some((e) => e.kind === 'bclTravel')).toBe(true);
    });

    it('pays BCL settlement remainder after weekly income', () => {
        const state = createNewGame(config, 9911, 'NYM');
        state.bclQualified = true;
        state.competitions.bcl = {
            id: 'bcl',
            phase: 'complete',
            fixtures: [],
            groups: [],
            playoffs: null,
            qualifyingSeries: null,
            qualifyingEntrantId: null,
            qualifyingOpponentId: null,
            qualifiedTeamIds: [],
            championTeamId: 'NYM',
            prizePaid: false,
            weeklyPrizePaidTotal: 500_000,
            userFinish: 'groupStage',
        };
        const finish = 'groupStage';
        const total = bclPrizeAmount(finish, bclConfig);
        const settlement = bclSettlementAmount(finish, bclConfig, 500_000);
        expect(settlement).toBe(total - 500_000);
        const paid = payBclPrize(state, bclConfig, economyConfig);
        expect(paid).toBe(settlement);
    });
});
