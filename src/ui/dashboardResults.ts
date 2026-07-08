import type { Fixture } from '../core/model/types';
import type { RoundResult } from '../core/game';

export type CompetitionGroup = 'nbl' | 'bcl' | 'fec';

export function competitionGroupFromFixture(fixture: { competitionId?: string }): CompetitionGroup {
    if (fixture.competitionId === 'bcl') {
        return 'bcl';
    }
    if (fixture.competitionId === 'fec') {
        return 'fec';
    }
    return 'nbl';
}

export function groupResultsByCompetition(
    results: RoundResult['results'],
): Record<CompetitionGroup, RoundResult['results']> {
    const grouped: Record<CompetitionGroup, RoundResult['results']> = {
        nbl: [],
        bcl: [],
        fec: [],
    };
    for (const entry of results) {
        grouped[competitionGroupFromFixture(entry.fixture)].push(entry);
    }
    return grouped;
}

/** Column starts for a multi-competition scoreboard on the character grid. */
export function resultColumnStarts(gridCols: number, activeGroups: CompetitionGroup[]): number[] {
    if (activeGroups.length <= 1) {
        return [3];
    }
    const startCol = 3;
    const available = gridCols - startCol - 2;
    const colWidth = Math.max(18, Math.floor(available / activeGroups.length));
    return activeGroups.map((_, index) => startCol + index * colWidth);
}

export const RESULT_GROUP_ORDER: CompetitionGroup[] = ['nbl', 'bcl', 'fec'];

export function activeResultGroups(grouped: Record<CompetitionGroup, RoundResult['results']>): CompetitionGroup[] {
    return RESULT_GROUP_ORDER.filter((group) => grouped[group].length > 0);
}

export function truncateResultList<T>(items: T[], maxVisible: number): { visible: T[]; hidden: number } {
    if (items.length <= maxVisible) {
        return { visible: items, hidden: 0 };
    }
    const visibleCount = Math.max(1, maxVisible - 1);
    return {
        visible: items.slice(0, visibleCount),
        hidden: items.length - visibleCount,
    };
}

export function isUserFixture(fixture: Fixture, userTeamId: string): boolean {
    return fixture.homeTeamId === userTeamId || fixture.awayTeamId === userTeamId;
}
