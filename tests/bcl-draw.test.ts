import { describe, expect, it } from 'vitest';
import { bclConfig } from '../src/config/bcl';
import {
    drawGroupsWithCountryPreference,
    drawSeededGroups,
    startBclSeason,
} from '../src/core/bcl/index';
import { createNewGame } from '../src/core/game';
import { createRng } from '../src/core/rng';
import { resolveTeamCountry } from '../src/core/teams';
import { testConfig as config } from './helpers';

function teamTier(teamId: string): number {
    const def = bclConfig.teams.find((t) => t.id === teamId || t.nblTeamId === teamId);
    return def?.tier ?? 1;
}

function sameCountryPairsInGroups(groups: Array<{ teamIds: string[] }>): number {
    let pairs = 0;
    for (const group of groups) {
        for (let i = 0; i < group.teamIds.length; i++) {
            for (let j = i + 1; j < group.teamIds.length; j++) {
                const a = group.teamIds[i] as string;
                const b = group.teamIds[j] as string;
                if (resolveTeamCountry(a) === resolveTeamCountry(b)) {
                    pairs++;
                }
            }
        }
    }
    return pairs;
}

function flattenTeamIds(groups: Array<{ teamIds: string[] }>): string[] {
    return groups.flatMap((g) => g.teamIds);
}

function expectedPotOne(teamIds: string[], _bcl: typeof bclConfig, rng: ReturnType<typeof createRng>): string[] {
    const byTier = new Map<number, string[]>();
    for (const id of teamIds) {
        const tier = teamTier(id);
        const bucket = byTier.get(tier) ?? [];
        bucket.push(id);
        byTier.set(tier, bucket);
    }
    const tiers = [...byTier.keys()].sort((a, b) => b - a);
    const sorted: string[] = [];
    for (const tier of tiers) {
        sorted.push(...rng.shuffle(byTier.get(tier) ?? []));
    }
    return sorted.slice(0, 8);
}

describe('BCL group draw', () => {
    it('resolves country for BCL and Czech NBL teams', () => {
        expect(resolveTeamCountry('BCL-UNI')).toBe('ESP');
        expect(resolveTeamCountry('NYM')).toBe('CZE');
        expect(resolveTeamCountry('BCL-PAOK')).toBe('GRE');
    });

    it('drawSeededGroups creates 8 groups of 4 with no same-country pairs', () => {
        const state = createNewGame(config, 9001, 'NYM');
        state.currentRound = 23;
        for (const f of state.fixtures) {
            f.result = {
                homeScore: 80,
                awayScore: 75,
                quarterScores: [[20, 18], [20, 19], [20, 19], [20, 19]],
                box: {},
                seed: 1,
            };
        }
        const comp = startBclSeason(state, config.bcl, config.league, createRng(42));
        expect(comp).not.toBeNull();
        expect(comp!.groups).toHaveLength(8);
        for (const group of comp!.groups) {
            expect(group.teamIds).toHaveLength(4);
        }
        expect(new Set(flattenTeamIds(comp!.groups)).size).toBe(32);
        expect(sameCountryPairsInGroups(comp!.groups)).toBe(0);
    });

    it('places pot-1 teams (top 8 by tier) in separate groups', () => {
        const teamIds = bclConfig.teams.map((t) => t.nblTeamId ?? t.id).slice(0, 32);
        const potOne = expectedPotOne(teamIds, bclConfig, createRng(99));
        const groups = drawSeededGroups(teamIds, bclConfig, createRng(99), {
            groupCount: 8,
            teamsPerGroup: 4,
        });
        const groupFor = (id: string) => groups.findIndex((g) => g.teamIds.includes(id));
        expect(new Set(potOne.map(groupFor)).size).toBe(8);
    });

    it('R16 draw avoids same-country pairs when possible', () => {
        const teamIds = bclConfig.teams.slice(0, 16).map((t) => t.id);
        const groups = drawGroupsWithCountryPreference(teamIds, bclConfig, createRng(77), {
            groupCount: 4,
            teamsPerGroup: 4,
        });
        expect(sameCountryPairsInGroups(groups)).toBe(0);
    });

    it('drawSeededGroups is deterministic with the same seed', () => {
        const teamIds = bclConfig.teams.slice(0, 32).map((t) => t.nblTeamId ?? t.id);
        const a = drawSeededGroups(teamIds, bclConfig, createRng(123), {
            groupCount: 8,
            teamsPerGroup: 4,
        });
        const b = drawSeededGroups(teamIds, bclConfig, createRng(123), {
            groupCount: 8,
            teamsPerGroup: 4,
        });
        expect(flattenTeamIds(a)).toEqual(flattenTeamIds(b));
    });

    it('drawGroupsWithCountryPreference creates 4 groups of 4', () => {
        const teamIds = bclConfig.teams.slice(0, 16).map((t) => t.id);
        const groups = drawGroupsWithCountryPreference(teamIds, bclConfig, createRng(55), {
            groupCount: 4,
            teamsPerGroup: 4,
        });
        expect(groups).toHaveLength(4);
        for (const group of groups) {
            expect(group.teamIds).toHaveLength(4);
        }
        expect(new Set(flattenTeamIds(groups)).size).toBe(16);
    });
});
