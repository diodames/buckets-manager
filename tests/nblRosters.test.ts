import { describe, expect, it } from 'vitest';
import { leagueConfig } from '../src/config/league';
import { seasonMarket2025 } from '../src/config/seasonSignings';
import { createNewGame } from '../src/core/game';
import { overallRating } from '../src/core/model/types';
import { testConfig as config } from './helpers';

describe('NBL rosters', () => {
    it('attaches real player definitions to every NBL club', () => {
        expect(leagueConfig.teams.length).toBe(12);
        for (const team of leagueConfig.teams) {
            expect(team.roster.length, team.id).toBeGreaterThanOrEqual(8);
            for (const player of team.roster) {
                expect(player.tier).toBeGreaterThanOrEqual(1);
                expect(player.tier).toBeLessThanOrEqual(5);
                expect(['PG', 'SG', 'SF', 'PF', 'C']).toContain(player.position);
                if (player.targetOverall != null) {
                    expect(player.targetOverall).toBeGreaterThanOrEqual(44);
                    expect(player.targetOverall).toBeLessThanOrEqual(76);
                }
            }
        }
    });

    it('uses a playoff-era Nymburk and Brno opening snapshot', () => {
        const nym = leagueConfig.teams.find((t) => t.id === 'NYM')!;
        const nymNames = nym.roster.map((p) => `${p.firstName} ${p.lastName}`);
        expect(nymNames.some((n) => n.includes('Sehnal'))).toBe(true);
        expect(nymNames).toContain('Vojtěch Hruban');
        expect(nymNames).toContain('Jaquan Lawrence');
        expect(nymNames).toContain('Marcus Santos-Silva');
        expect(nymNames.some((n) => n.includes('Perkins'))).toBe(true);
        expect(nymNames.some((n) => n.includes('Rice'))).toBe(false);
        expect(nym.roster.length).toBeGreaterThanOrEqual(12);

        const brn = leagueConfig.teams.find((t) => t.id === 'BRN')!;
        const brnNames = brn.roster.map((p) => `${p.firstName} ${p.lastName}`);
        expect(brnNames.some((n) => n.includes('Williams'))).toBe(false);
        expect(brnNames.some((n) => n.includes('Groves'))).toBe(false);
        expect(brnNames.some((n) => n.includes('Langley'))).toBe(true);

        const usk = leagueConfig.teams.find((t) => t.id === 'USK')!;
        const uskNames = usk.roster.map((p) => `${p.firstName} ${p.lastName}`);
        expect(uskNames.some((n) => n.includes('Wright') || n.includes('Montgomery'))).toBe(true);
    });

    it('applies hand-tuned rating and name overrides', () => {
        const ovr = (teamId: string, lastName: string): number => {
            const team = leagueConfig.teams.find((t) => t.id === teamId)!;
            const player = team.roster.find((p) => p.lastName === lastName || p.lastName.includes(lastName));
            expect(player, `${teamId} ${lastName}`).toBeTruthy();
            return player!.targetOverall!;
        };
        expect(ovr('DEC', 'Slowiak')).toBe(62);
        expect(ovr('OST', 'Svoboda')).toBe(64);
        expect(ovr('OLO', 'Autrey')).toBe(66);
        expect(ovr('OLO', 'Filewich')).toBe(67);
        const filewich = leagueConfig.teams.find((t) => t.id === 'OLO')!.roster.find((p) => p.lastName === 'Filewich');
        expect(filewich?.position).toBe('C');
        expect(ovr('USK', 'Henderson')).toBe(63);
        expect(ovr('USK', 'Soldán')).toBe(51);
        const soldan = leagueConfig.teams.find((t) => t.id === 'USK')!.roster.find((p) => p.lastName === 'Soldán');
        expect(soldan?.position).toBe('C');
        expect(ovr('USK', 'Fuxa')).toBe(55);
        expect(ovr('OPA', 'Gray')).toBe(69);
        expect(ovr('OPA', 'Šiřina')).toBe(67);
        expect(ovr('OPA', 'Kavan')).toBe(62);
        expect(ovr('OPA', 'Švandrlík')).toBe(65);
        expect(ovr('NYM', 'Perkins')).toBe(66);
        expect(ovr('NYM', 'Sehnal')).toBe(70);
        expect(ovr('NYM', 'Bohačík')).toBe(67);

        const opa = leagueConfig.teams.find((t) => t.id === 'OPA')!;
        expect(opa.roster.some((p) => p.firstName === 'Wesley' && p.lastName === 'Person')).toBe(true);
        expect(opa.roster.some((p) => p.firstName === 'Clevon' && p.lastName === 'Brown')).toBe(true);
        expect(opa.roster.some((p) => p.lastName === 'Jr' || p.lastName === 'Jr.')).toBe(false);
    });

    it('starts NBL clubs with playoff preferred lineups', () => {
        const state = createNewGame(config, 777, 'NYM');
        const starterNames = (teamId: string): string[] => {
            const team = state.teams[teamId]!;
            return (['PG', 'SG', 'SF', 'PF', 'C'] as const).map((pos) => {
                const player = state.players[team.tactics.starters[pos]]!;
                return player.lastName;
            });
        };
        expect(starterNames('NYM')).toEqual(['Sehnal', 'Perkins', 'Bohačík', 'Shumate', 'Santos-Silva']);
        expect(starterNames('PCE')).toEqual(['Tůma', 'Evans', 'Moffatt', 'Kovář', 'Švrdlík']);
        expect(starterNames('OPA')).toEqual(['Šiřina', 'Kavan', 'Gray', 'Brown', 'Puršl']);
        expect(starterNames('BRN')).toEqual(['Půlpán', 'Farský', 'Jelínek', 'Olison', 'Kejval']);
    });

    it('gives every NBL club 2–3 players at each position', () => {
        const state = createNewGame(config, 777, 'NYM');
        const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
        for (const teamDef of leagueConfig.teams) {
            const team = state.teams[teamDef.id]!;
            const counts = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
            for (const id of team.playerIds) {
                counts[state.players[id]!.position] += 1;
            }
            expect(team.playerIds.length, teamDef.id).toBe(12);
            for (const pos of positions) {
                expect(counts[pos], `${teamDef.id} ${pos}`).toBeGreaterThanOrEqual(2);
                expect(counts[pos], `${teamDef.id} ${pos}`).toBeLessThanOrEqual(3);
            }
        }
    });

    it('does not re-inject absorbed 2025 mid-season market events', () => {
        expect(seasonMarket2025.timedSignings).toHaveLength(0);
        expect(seasonMarket2025.departures).toHaveLength(0);
        expect(seasonMarket2025.openingFreeAgents.some((p) => p.lastName === 'Williams')).toBe(false);
    });

    it('keeps Nymburk near 64 overall and ahead of the next NBL club', () => {
        const state = createNewGame(config, 777, 'NYM');
        const avg = (teamId: string): number => {
            const team = state.teams[teamId]!;
            const ratings = team.playerIds
                .map((id) => state.players[id]!)
                .map((p) => overallRating(p.attributes));
            return ratings.reduce((a, b) => a + b, 0) / ratings.length;
        };
        const nym = avg('NYM');
        const others = leagueConfig.teams
            .map((t) => t.id)
            .filter((id) => id !== 'NYM')
            .map((id) => avg(id));
        const second = Math.max(...others);
        expect(nym).toBeGreaterThanOrEqual(second + 2);
        expect(nym).toBeGreaterThanOrEqual(63);
        expect(nym).toBeLessThanOrEqual(65.5);
    });
});
