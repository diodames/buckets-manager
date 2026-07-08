import { describe, expect, it } from 'vitest';
import { difficultyModifiers } from '../src/core/difficulty';
import { roundEconomyTick } from '../src/core/economy';
import { createNewGame, userInjuryMultiplier } from '../src/core/game';
import { isFreeAgentMarketOpen, isFullTransferMarketOpen } from '../src/core/market';
import { createRng } from '../src/core/rng';
import { testConfig as config } from './helpers';

describe('difficulty modifiers', () => {
    it('defaults new careers to hard difficulty', () => {
        const state = createNewGame(config, 9921, 'DEC');
        expect(state.difficulty).toBe('hard');
        expect(userInjuryMultiplier(state)).toBe(1.2);
    });

    it('exposes income and injury multipliers per setting', () => {
        expect(difficultyModifiers('easy').userIncomeMult).toBe(1.08);
        expect(difficultyModifiers('easy').userInjuryMult).toBe(0.75);
        expect(difficultyModifiers('hard').userIncomeMult).toBe(0.95);
        expect(difficultyModifiers('hard').userInjuryMult).toBe(1.2);
        expect(difficultyModifiers('hard').aiSkillMult).toBe(1.09);
        const hard = createNewGame(config, 9920, 'DEC', 'hard');
        expect(userInjuryMultiplier(hard)).toBe(1.2);
    });

    it('easy mode boosts user ticket and league income', () => {
        const easy = createNewGame(config, 9910, 'DEC', 'easy');
        const normal = createNewGame(config, 9910, 'DEC', 'normal');
        const rng = createRng(9910);
        const input = { playedHome: true, won: true, margin: 10, realArenaCapacity: 1200, totalRounds: 22 };
        const easyEco = roundEconomyTick(easy, input, config.economy, config.league, rng.fork('easy'));
        const normalEco = roundEconomyTick(normal, input, config.economy, config.league, rng.fork('normal'));
        expect(easyEco.ticketIncome).toBeGreaterThan(normalEco.ticketIncome);
        expect(easyEco.leagueShare).toBeGreaterThan(normalEco.leagueShare);
    });
});

describe('transfer windows', () => {
    it('full market is open rounds 1-12 only', () => {
        const state = createNewGame(config, 9930, 'NYM');
        expect(isFullTransferMarketOpen(state, config.market)).toBe(true);
        state.currentRound = 12;
        expect(isFullTransferMarketOpen(state, config.market)).toBe(true);
        state.currentRound = 13;
        expect(isFullTransferMarketOpen(state, config.market)).toBe(false);
        expect(isFreeAgentMarketOpen(state)).toBe(true);
    });
});
