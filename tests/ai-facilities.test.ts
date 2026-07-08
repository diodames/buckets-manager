import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/core/game';
import { tickAiFacilities, aiTrainingDevMultiplier } from '../src/core/aiFacilities';
import { testConfig as config } from './helpers';

describe('AI facilities', () => {
    it('tier-5 AI clubs eventually upgrade training when solvent', () => {
        const state = createNewGame(config, 9940, 'DEC');
        const nymFinance = state.nblFinances.NYM;
        expect(nymFinance).toBeDefined();
        nymFinance!.budget = 50_000_000;
        nymFinance!.facilities = { arena: 1, training: 1, academy: 1 };
        nymFinance!.roundsSinceFacilityUpgrade = 100;
        tickAiFacilities(state, config.economy, config.league);
        expect(nymFinance!.facilities!.training).toBeGreaterThanOrEqual(2);
        expect(aiTrainingDevMultiplier(nymFinance!, config.economy)).toBeGreaterThan(1);
    });
});
