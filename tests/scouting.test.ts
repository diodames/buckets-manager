import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/core/game';
import { createRng } from '../src/core/rng';
import { initializeSeasonMarket } from '../src/core/seasonMarket';
import {
    canNegotiateScoutedFreeAgent,
    initializeScouting,
    requestQuickReport,
    scoutedPlayerIds,
} from '../src/core/scouting';
import { testConfig as config } from './helpers';

describe('pre-season scouting', () => {
    it('initializes blurred reports for opening free agents', () => {
        const state = createNewGame(config, 9920, 'DEC');
        const rng = createRng(9920);
        initializeSeasonMarket(state, config, rng.fork('market'));
        initializeScouting(state, config, rng.fork('scouting'));
        expect(state.market.scoutingComplete).toBe(false);
        expect(state.market.scoutingBudget).toBeGreaterThan(0);
        expect(scoutedPlayerIds(state).length).toBeGreaterThan(0);
        const first = scoutedPlayerIds(state)[0]!;
        const report = state.market.scoutedFreeAgents[first]!;
        expect(report.tier).toBe('rumour');
        expect(report.overallMax - report.overallMin).toBeGreaterThan(0);
    });

    it('quick report unlocks negotiation', () => {
        const state = createNewGame(config, 9921, 'DEC');
        initializeScouting(state, config, createRng(9921));
        const id = scoutedPlayerIds(state)[0];
        expect(id).toBeDefined();
        expect(canNegotiateScoutedFreeAgent(state, id!)).toBe(false);
        expect(requestQuickReport(state, id!, config.economy)).toBe(true);
        expect(canNegotiateScoutedFreeAgent(state, id!)).toBe(true);
    });
});
