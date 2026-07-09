import { describe, expect, it } from 'vitest';
import { bclConfig } from '../src/config/bcl';
import { createNewGame } from '../src/core/game';
import { generateBclClubs } from '../src/core/league/generate';
import { overallRating } from '../src/core/model/types';
import { createRng } from '../src/core/rng';
import { testConfig as config } from './helpers';

const SEED = 42;

function starterAvgOverall(state: { teams: Record<string, { playerIds: string[]; tactics: { starters: Record<string, string> } }>; players: Record<string, { attributes: Record<string, number> }> }, teamId: string): number {
    const team = state.teams[teamId];
    const starters = Object.values(team?.tactics.starters ?? {})
        .map((id) => state.players[id])
        .filter((p) => p !== undefined);
    if (starters.length === 0) {
        return 0;
    }
    return starters.reduce((sum, p) => sum + overallRating(p.attributes), 0) / starters.length;
}

function leagueStarterAvg(state: ReturnType<typeof createNewGame>, teamIds: string[]): number {
    const ratings = teamIds.map((id) => starterAvgOverall(state, id));
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}

describe('BCL vs NBL quality gap', () => {
    const nblIds = config.league.teams.map((t) => t.id);
    const bclOnlyIds = bclConfig.teams.filter((t) => !t.nblTeamId).map((t) => t.id);
    const bclTier5Ids = bclConfig.teams.filter((t) => !t.nblTeamId && t.tier === 5).map((t) => t.id);

    it('does not change NBL generation', () => {
        const state = createNewGame(config, SEED, 'NYM');
        expect(Object.keys(state.teams)).toHaveLength(12);
        expect(state.teams.NYM).toBeDefined();
        expect(state.teams.NYM?.playerIds.length).toBeGreaterThanOrEqual(8);
    });

    it('BCL European clubs rate clearly above the NBL league average', () => {
        const state = createNewGame(config, SEED, 'NYM');
        generateBclClubs(state, config.bcl, config.balance, config.names, state.seasonYear, createRng(SEED).fork('bcl-gen'));

        const nblAvg = leagueStarterAvg(state, nblIds);
        const bclAvg = leagueStarterAvg(state, bclOnlyIds);
        expect(bclAvg - nblAvg).toBeGreaterThanOrEqual(8);
    });

    it('BCL tier-5 elites outclass the Czech champion roster', () => {
        const state = createNewGame(config, SEED, 'NYM');
        generateBclClubs(state, config.bcl, config.balance, config.names, state.seasonYear, createRng(SEED).fork('bcl-gen'));

        const nymAvg = starterAvgOverall(state, 'NYM');
        const tier5Avg = leagueStarterAvg(state, bclTier5Ids);
        expect(tier5Avg - nymAvg).toBeGreaterThanOrEqual(6);
    });

    it('Czech BCL entrants keep their NBL rosters unchanged', () => {
        const state = createNewGame(config, SEED, 'NYM');
        const nymBefore = state.teams.NYM?.playerIds.slice();
        generateBclClubs(state, config.bcl, config.balance, config.names, state.seasonYear, createRng(SEED).fork('bcl-gen'));

        expect(state.teams.NYM?.playerIds).toEqual(nymBefore);
        expect(state.teams['BCL-NYM']).toBeUndefined();
        for (const team of bclConfig.teams) {
            if (!team.nblTeamId) {
                continue;
            }
            expect(state.teams[team.id]).toBeUndefined();
        }
    });
});
