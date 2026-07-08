import { describe, expect, it } from 'vitest';
import { userNblPlayoffFinish } from '../src/core/economy';
import { advanceRoundInstant, createNewGame, isCampaignOver, isSeasonOver } from '../src/core/game';
import { aiTrainingFocus } from '../src/core/training';
import { testConfig as config } from './helpers';

const SEASON_COUNT = 20;

function playFullSeasonAsUsk(seed: number) {
    const state = createNewGame(config, seed, 'USK', 'hard');
    let guard = 0;
    while (!isCampaignOver(state, config) && guard++ < 80) {
        advanceRoundInstant(state, config);
    }
    return state;
}

describe('underdog balance helpers', () => {
    it('assigns tier-based AI training focus', () => {
        expect(aiTrainingFocus('NYM', config.league)).toBe('shooting');
        expect(aiTrainingFocus('PCE', config.league)).toBe('playmaking');
        expect(aiTrainingFocus('USK', config.league)).toBe('balanced');
    });
});

describe('USK year-1 difficulty (Monte Carlo)', () => {
    it('keeps titles rare while elite AI still wins the league', { timeout: 30_000 }, () => {
        let champions = 0;
        let nymChampions = 0;

        for (let seed = 1; seed <= SEASON_COUNT; seed++) {
            const state = playFullSeasonAsUsk(seed);
            expect(isSeasonOver(state, config)).toBe(true);

            const finish = userNblPlayoffFinish(state);
            if (finish === 'champion') {
                champions++;
            }
            if (state.playoffs?.championTeamId === 'NYM') {
                nymChampions++;
            }
        }

        const championRate = champions / SEASON_COUNT;
        const nymChampionRate = nymChampions / SEASON_COUNT;

        expect(championRate).toBeLessThanOrEqual(0.08);
        expect(nymChampionRate).toBeGreaterThanOrEqual(0.2);
    });
});
