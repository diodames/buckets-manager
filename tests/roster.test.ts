import { describe, expect, it } from 'vitest';
import { marketConfig } from '../src/config/market';
import { economyConfig } from '../src/config/economy';
import { createNewGame } from '../src/core/game';
import { countForeignPlayers, wouldExceedForeignCap } from '../src/core/roster';
import { signYouth } from '../src/core/market';
import type { Player } from '../src/core/model/types';
import { testConfig as config } from './helpers';

describe('roster foreign cap', () => {
    it('blocks signing a seventh foreign player', () => {
        const state = createNewGame(config, 42, 'NYM');
        const team = state.teams[state.userTeamId];
        expect(team).toBeDefined();
        // Fill foreign slots with synthetic players.
        for (let i = countForeignPlayers(state, state.userTeamId); i < marketConfig.roster.maxForeigners; i++) {
            const id = `FOREIGN-${i}`;
            const player: Player = {
                id,
                firstName: 'Test',
                lastName: `Foreign${i}`,
                nationality: 'USA',
                age: 25,
                heightCm: 200,
                position: 'SF',
                attributes: state.players[team!.playerIds[0]!]!.attributes,
                potential: 70,
                fatigue: 0,
                morale: 70,
                injury: null,
                teamId: state.userTeamId,
                contract: { salary: 500_000, yearsLeft: 1 },
            };
            state.players[id] = player;
            team!.playerIds.push(id);
        }
        expect(countForeignPlayers(state, state.userTeamId)).toBe(marketConfig.roster.maxForeigners);
        const nextForeign: Player = {
            id: 'FOREIGN-NEW',
            firstName: 'New',
            lastName: 'Import',
            nationality: 'SRB',
            age: 22,
            heightCm: 205,
            position: 'C',
            attributes: state.players[team!.playerIds[0]!]!.attributes,
            potential: 75,
            fatigue: 0,
            morale: 70,
            injury: null,
            teamId: null,
            contract: null,
        };
        expect(wouldExceedForeignCap(state, state.userTeamId, nextForeign)).toBe(true);
        state.market.youthProspects.push({
            player: nextForeign,
            starMin: 2,
            starMax: 3,
            quoteIndex: 0,
            decideByRound: 20,
            academySeasons: 0,
        });
        expect(signYouth(state, 'FOREIGN-NEW', marketConfig, economyConfig)).toBe('foreignCapFull');
    });
});
