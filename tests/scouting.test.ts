import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/core/game';
import { createRng } from '../src/core/rng';
import { initializeSeasonMarket } from '../src/core/seasonMarket';
import {
    canNegotiateScoutedFreeAgent,
    canScoutPlayer,
    ensureScoutReportsForOpeningFreeAgents,
    initializeScouting,
    requestQuickReport,
    scoutedPlayerIds,
} from '../src/core/scouting';
import { replenishFreeAgents } from '../src/core/market';
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

    it('ensureScoutReportsForOpeningFreeAgents backfills replenished free agents', () => {
        const state = createNewGame(config, 9922, 'DEC');
        const rng = createRng(9922);
        initializeSeasonMarket(state, config, rng.fork('market'));
        replenishFreeAgents(state, 18, config.names, config.balance, rng.fork('fa'));
        initializeScouting(state, config, rng.fork('scouting'));
        const freeAgents = Object.values(state.players).filter(
            (p) => p.teamId === null && p.contract === null && p.id.startsWith('FA-'),
        );
        expect(freeAgents.length).toBeGreaterThan(0);
        for (const player of freeAgents) {
            expect(canScoutPlayer(state, player.id)).toBe(true);
        }
    });

    it('ensureScoutReportsForOpeningFreeAgents repairs missing entries without resetting budget', () => {
        const state = createNewGame(config, 9923, 'DEC');
        const rng = createRng(9923);
        initializeSeasonMarket(state, config, rng.fork('market'));
        replenishFreeAgents(state, 18, config.names, config.balance, rng.fork('fa'));
        initializeScouting(state, config, rng.fork('scouting'));
        const budget = state.market.scoutingBudget;
        const firstId = scoutedPlayerIds(state)[0];
        expect(firstId).toBeDefined();
        delete state.market.scoutedFreeAgents[firstId!];
        const added = ensureScoutReportsForOpeningFreeAgents(state, config, rng.fork('repair'));
        expect(added).toBe(1);
        expect(state.market.scoutedFreeAgents[firstId!]).toBeDefined();
        expect(state.market.scoutingBudget).toBe(budget);
    });
});
