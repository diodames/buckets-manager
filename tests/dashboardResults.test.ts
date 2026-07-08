import { describe, expect, it } from 'vitest';
import {
    activeResultGroups,
    competitionGroupFromFixture,
    groupResultsByCompetition,
    resultColumnStarts,
    truncateResultList,
} from '../src/ui/dashboardResults';
import type { Fixture, MatchSummary } from '../src/core/model/types';
import type { RoundResult } from '../src/core/game';

function fixture(id: string, competitionId?: Fixture['competitionId']): Fixture {
    return {
        id,
        homeTeamId: 'NYM',
        awayTeamId: 'BRN',
        round: 1,
        week: 1,
        result: null,
        ...(competitionId !== undefined ? { competitionId } : {}),
    };
}

function resultEntry(id: string, competitionId?: Fixture['competitionId']): RoundResult['results'][number] {
    return { fixture: fixture(id, competitionId), summary: {} as MatchSummary };
}

describe('dashboardResults', () => {
    it('groups results by competition', () => {
        const results = [
            resultEntry('n1'),
            resultEntry('b1', 'bcl'),
            resultEntry('f1', 'fec'),
            resultEntry('n2'),
        ];
        const grouped = groupResultsByCompetition(results);
        expect(grouped.nbl).toHaveLength(2);
        expect(grouped.bcl).toHaveLength(1);
        expect(grouped.fec).toHaveLength(1);
    });

    it('maps competition ids to groups', () => {
        expect(competitionGroupFromFixture({ competitionId: 'bcl' })).toBe('bcl');
        expect(competitionGroupFromFixture({ competitionId: 'fec' })).toBe('fec');
        expect(competitionGroupFromFixture({})).toBe('nbl');
    });

    it('returns active groups in NBL/BCL/FEC order', () => {
        const grouped = groupResultsByCompetition([
            resultEntry('f1', 'fec'),
            resultEntry('b1', 'bcl'),
        ]);
        expect(activeResultGroups(grouped)).toEqual(['bcl', 'fec']);
    });

    it('derives column starts from grid width', () => {
        expect(resultColumnStarts(80, ['nbl', 'bcl', 'fec'])).toEqual([3, 28, 53]);
        expect(resultColumnStarts(80, ['nbl'])).toEqual([3]);
    });

    it('truncates long result lists and reports hidden count', () => {
        const items = [1, 2, 3, 4, 5];
        expect(truncateResultList(items, 5)).toEqual({ visible: items, hidden: 0 });
        expect(truncateResultList(items, 3)).toEqual({ visible: [1, 2], hidden: 3 });
    });
});
