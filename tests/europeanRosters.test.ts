import { describe, expect, it } from 'vitest';
import { bclConfig } from '../src/config/bcl';
import { fecConfig } from '../src/config/fec';

describe('european rosters', () => {
    it('attaches real player definitions to every BCL-only club', () => {
        const teams = bclConfig.teams.filter((t) => !t.nblTeamId);
        expect(teams.length).toBeGreaterThanOrEqual(50);
        for (const team of teams) {
            expect(team.roster.length, team.id).toBeGreaterThanOrEqual(8);
            for (const player of team.roster) {
                expect(player.tier).toBeGreaterThanOrEqual(1);
                expect(player.tier).toBeLessThanOrEqual(5);
            }
        }
    });

    it('attaches real player definitions to every FEC-only club', () => {
        const teams = fecConfig.teams.filter((t) => !t.nblTeamId);
        expect(teams.length).toBeGreaterThanOrEqual(40);
        for (const team of teams) {
            expect(team.roster.length, team.id).toBeGreaterThanOrEqual(8);
            for (const player of team.roster) {
                expect(player.tier).toBeGreaterThanOrEqual(1);
                expect(player.tier).toBeLessThanOrEqual(5);
            }
        }
    });
});
