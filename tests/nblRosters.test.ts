import { describe, expect, it } from 'vitest';
import { leagueConfig } from '../src/config/league';

describe('NBL rosters', () => {
    it('attaches real player definitions to every NBL club', () => {
        expect(leagueConfig.teams.length).toBe(12);
        for (const team of leagueConfig.teams) {
            expect(team.roster.length, team.id).toBeGreaterThanOrEqual(8);
            for (const player of team.roster) {
                expect(player.tier).toBeGreaterThanOrEqual(1);
                expect(player.tier).toBeLessThanOrEqual(5);
                expect(['PG', 'SG', 'SF', 'PF', 'C']).toContain(player.position);
            }
        }
    });

    it('includes known Nymburk and USK players from 2025/26', () => {
        const nym = leagueConfig.teams.find((t) => t.id === 'NYM')!;
        const nymNames = nym.roster.map((p) => `${p.firstName} ${p.lastName}`);
        expect(nymNames.some((n) => n.includes('Sehnal'))).toBe(true);

        const usk = leagueConfig.teams.find((t) => t.id === 'USK')!;
        const uskNames = usk.roster.map((p) => `${p.firstName} ${p.lastName}`);
        expect(uskNames.some((n) => n.includes('Wright') || n.includes('Montgomery'))).toBe(true);
    });
});
