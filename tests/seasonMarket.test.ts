import { describe, expect, it } from 'vitest';
import { seasonMarket2025, seasonMarket2027, seasonMarket2028 } from '../src/config/seasonSignings';
import { advanceRoundInstant, createNewGame } from '../src/core/game';
import { initializeSeasonMarket } from '../src/core/seasonMarket';
import { createRng } from '../src/core/rng';
import { testConfig as config } from './helpers';

function freeAgentNames(state: ReturnType<typeof createNewGame>): string[] {
    return Object.values(state.players)
        .filter((p) => p.teamId === null && p.contract === null)
        .map((p) => `${p.firstName} ${p.lastName}`);
}

describe('season market pool', () => {
    it('seeds opening-day real free agents and keeps mid-season signings off rosters', () => {
        const state = createNewGame(config, 7001, 'NYM');
        const names = freeAgentNames(state);

        expect(names).toContain('Ross Williams');
        expect(names).toContain('Petr Šafarčík');
        expect(names.some((n) => n.includes('Perkins'))).toBe(false);
        expect(names.some((n) => n.includes('Evans'))).toBe(false);
        expect(names.some((n) => n.includes('Nikkarinen'))).toBe(false);

        const nymRoster = state.teams.NYM?.playerIds.map((id) => state.players[id]?.lastName) ?? [];
        expect(nymRoster).toContain('Rice');
        expect(nymRoster.some((n) => n?.includes('Perkins'))).toBe(false);

        const pceRoster = state.teams.PCE?.playerIds.map((id) => state.players[id]?.lastName) ?? [];
        expect(pceRoster.some((n) => n?.includes('Evans'))).toBe(false);

        expect(state.market.pendingFreeAgents.length).toBe(
            seasonMarket2025.timedSignings.filter((s) => s.availableFromRound > 1).length,
        );
    });

    it('releases timed signings when the matching round begins', () => {
        const state = createNewGame(config, 7002, 'NYM');
        expect(freeAgentNames(state).some((n) => n.includes('Nikkarinen'))).toBe(false);

        while (state.currentRound < 8) {
            advanceRoundInstant(state, config);
        }

        expect(freeAgentNames(state).some((n) => n.includes('Nikkarinen'))).toBe(true);
        expect(freeAgentNames(state).some((n) => n.includes('John'))).toBe(true);
    });

    it('releases Sir\'Jabari Rice to free agency when his departure round starts', () => {
        const state = createNewGame(config, 7003, 'NYM');
        const riceBefore = state.teams.NYM?.playerIds.some(
            (id) => state.players[id]?.lastName === 'Rice',
        );
        expect(riceBefore).toBe(true);

        while (state.currentRound < 10) {
            advanceRoundInstant(state, config);
        }

        const riceOnRoster = state.teams.NYM?.playerIds.some(
            (id) => state.players[id]?.lastName === 'Rice',
        );
        expect(riceOnRoster).toBe(false);
        expect(freeAgentNames(state).some((n) => n.includes('Rice'))).toBe(true);

        const hintedSg = Object.entries(state.market.signingHints).filter(([, teamId]) => teamId === 'NYM')
            .map(([id]) => state.players[id])
            .filter((p) => p?.position === 'SG');
        expect(hintedSg.length).toBeGreaterThan(0);
    });

    it('stores signing hints for likely AI destinations', () => {
        const state = createNewGame(config, 7004, 'NYM');
        const perkinsId = Object.keys(state.market.signingHints).find((id) => id.includes('perkins'));
        expect(perkinsId).toBeDefined();
        if (perkinsId) {
            expect(state.market.signingHints[perkinsId]).toBe('NYM');
        }
    });

    it('defines 2027 veteran returnees with expected tiers and hints', () => {
        expect(seasonMarket2027.openingFreeAgents).toHaveLength(3);
        const auda = seasonMarket2027.openingFreeAgents.find((p) => p.lastName === 'Auda');
        const kyzlink = seasonMarket2027.openingFreeAgents.find((p) => p.lastName === 'Kyzlink');
        const balvin = seasonMarket2027.openingFreeAgents.find((p) => p.lastName === 'Balvín');

        expect(auda?.tier).toBe(4);
        expect(auda?.likelyTeamId).toBe('USK');
        expect(kyzlink?.tier).toBe(4);
        expect(kyzlink?.likelyTeamId).toBeUndefined();
        expect(balvin?.tier).toBe(4);
        expect(balvin?.position).toBe('C');
    });

    it('seeds 2027 opening free agents on the market', () => {
        const state = createNewGame(config, 7101, 'NYM');
        state.seasonYear = 2027;
        initializeSeasonMarket(state, config, createRng(7101));

        const names = freeAgentNames(state);
        expect(names).toContain('Patrik Auda');
        expect(names).toContain('Tomáš Kyzlink');
        expect(names).toContain('Ondřej Balvín');

        const audaId = Object.keys(state.market.signingHints).find((id) => id.includes('auda'));
        expect(audaId).toBeDefined();
        if (audaId) {
            expect(state.market.signingHints[audaId]).toBe('USK');
        }
    });

    it('defines 2028 headline returnees with expected tiers and hints', () => {
        expect(seasonMarket2028.openingFreeAgents).toHaveLength(2);
        const sato = seasonMarket2028.openingFreeAgents.find((p) => p.lastName === 'Satoranský');
        const peterka = seasonMarket2028.openingFreeAgents.find((p) => p.lastName === 'Peterka');

        expect(sato?.tier).toBe(5);
        expect(sato?.likelyTeamId).toBe('NYM');
        expect(peterka?.tier).toBe(4);
        expect(peterka?.likelyTeamId).toBe('NYM');
    });

    it('seeds 2028 opening free agents on the market', () => {
        const state = createNewGame(config, 7102, 'NYM');
        state.seasonYear = 2028;
        initializeSeasonMarket(state, config, createRng(7102));

        const names = freeAgentNames(state);
        expect(names).toContain('Tomáš Satoranský');
        expect(names).toContain('Martin Peterka');

        for (const lastName of ['satoransk', 'peterka']) {
            const playerId = Object.keys(state.market.signingHints).find((id) => id.includes(lastName));
            expect(playerId).toBeDefined();
            if (playerId) {
                expect(state.market.signingHints[playerId]).toBe('NYM');
            }
        }
    });
});
