import type { FecConfig } from '../../config/fec';
import { fecConfig } from '../../config/fec';
import {
    createGroupFixtures as createBclGroupFixtures,
    drawGroupsWithCountryPreference,
    drawSeededGroups,
} from '../bcl/index';
import { computeStandings } from '../league/standings';
import type {
    BclGroup, CompetitionState, FecUserFinish, Fixture, GameState, TeamId,
} from '../model/types';
import type { Rng } from '../rng';
import {
    activeSeries, maybeAdvanceStage, nextSeriesFixture, recordSeriesGame, seriesDecided,
} from '../playoffs';
import type { LeagueConfig } from '../../config/league';
import { leagueConfig } from '../../config/league';

function resolveFecTeamId(fecTeamId: string): string {
    const def = fecConfig.teams.find((t) => t.id === fecTeamId);
    return def?.nblTeamId ?? fecTeamId;
}

/** Czech NBL teams that qualify for FIBA Europe Cup from the last completed playoffs. */
export function czechFecQualifiers(state: GameState): TeamId[] {
    if (state.lastFecQualifierIds.length > 0) {
        return state.lastFecQualifierIds.slice(0, fecConfig.czechQualifiers);
    }
    return [];
}

function directEntryTeams(state: GameState, fec: FecConfig): TeamId[] {
    const czech = czechFecQualifiers(state);
    const fixed = fec.teams
        .filter((t) => t.tier >= 3 && !t.nblTeamId)
        .slice(0, fec.regularSeasonTeams - czech.length - 12)
        .map((t) => t.id);
    const entries = [...czech, ...fixed.map(resolveFecTeamId)];
    while (entries.length < fec.regularSeasonTeams - 12) {
        const extra = fec.teams.find((t) => t.tier >= 3 && !entries.includes(t.nblTeamId ?? t.id));
        if (!extra) {
            break;
        }
        entries.push(extra.nblTeamId ?? extra.id);
    }
    return entries.slice(0, fec.regularSeasonTeams - 12);
}

function runFecQualifyingRound(fec: FecConfig, rng: Rng, count: number): TeamId[] {
    const pool = fec.teams.filter((t) => t.tier <= 2 && !t.nblTeamId).map((t) => t.id);
    const shuffled = rng.shuffle([...pool]);
    const winners: TeamId[] = [];
    let current = shuffled;
    while (winners.length < count && current.length > 0) {
        const next: TeamId[] = [];
        for (let i = 0; i < current.length; i += 2) {
            const a = current[i] as TeamId;
            const b = current[i + 1];
            if (!b) {
                next.push(a);
                continue;
            }
            const aTier = fec.teams.find((t) => t.id === a)?.tier ?? 1;
            const bTier = fec.teams.find((t) => t.id === b)?.tier ?? 1;
            next.push(aTier >= bTier ? (rng.chance(0.55) ? a : b) : (rng.chance(0.45) ? a : b));
        }
        current = next;
        if (current.length <= count) {
            winners.push(...current.slice(0, count - winners.length));
            break;
        }
    }
    return winners.slice(0, count);
}

const GROUP_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const SR_GROUP_NAMES = ['K', 'L', 'M', 'N'];

function labelGroups(groups: BclGroup[], names: readonly string[]): BclGroup[] {
    return groups.map((g, i) => ({ ...g, id: `FEC-${names[i] ?? i}` }));
}

function createFecGroupFixtures(groups: BclGroup[], weeks: readonly number[]): Fixture[] {
    const fixtures = createBclGroupFixtures(groups, weeks);
    for (const f of fixtures) {
        f.competitionId = 'fec';
    }
    return fixtures;
}

function fecKnockoutWins(stage: number, fec: FecConfig): number {
    return fec.knockoutWinsNeeded[stage] ?? 2;
}

function fecKnockoutLeague(fec: FecConfig): LeagueConfig {
    return {
        ...leagueConfig,
        playoffs: {
            ...leagueConfig.playoffs,
            winsNeeded: [...fec.knockoutWinsNeeded] as [number, number, number],
        },
    };
}

export function startFecSeason(state: GameState, fec: FecConfig, rng: Rng): CompetitionState | null {
    const czech = czechFecQualifiers(state);
    state.fecQualified = czech.includes(state.userTeamId);

    const direct = directEntryTeams(state, fec);
    const qualCount = fec.regularSeasonTeams - direct.length;
    const qualifyingWinners = runFecQualifyingRound(fec, rng, qualCount);
    const allTeams = [...direct, ...qualifyingWinners].slice(0, fec.regularSeasonTeams);
    while (allTeams.length < fec.regularSeasonTeams) {
        const extra = fec.teams.find((t) => !allTeams.includes(t.nblTeamId ?? t.id));
        if (!extra) {
            break;
        }
        allTeams.push(extra.nblTeamId ?? extra.id);
    }

    const groups = labelGroups(
        drawSeededGroups(allTeams, fec as unknown as import('../../config/bcl').BclConfig, rng, {
            groupCount: fec.regularSeasonGroups,
            teamsPerGroup: fec.teamsPerGroup,
        }),
        GROUP_NAMES,
    );
    const fixtures = createFecGroupFixtures(groups, fec.groupWeeks);

    const competition: CompetitionState = {
        id: 'fec',
        phase: 'regularSeason',
        fixtures,
        groups,
        playoffs: null,
        qualifyingSeries: null,
        qualifyingEntrantId: null,
        qualifyingOpponentId: null,
        qualifiedTeamIds: allTeams,
        championTeamId: null,
        prizePaid: false,
        weeklyPrizePaidTotal: 0,
        userFinish: null,
    };
    state.competitions.fec = competition;
    return competition;
}

export function fecCompetition(state: GameState): CompetitionState | null {
    return state.competitions.fec ?? null;
}

export function pendingFecFixtures(state: GameState, week: number): Fixture[] {
    const fec = fecCompetition(state);
    if (!fec) {
        return [];
    }
    return fec.fixtures.filter((f) => (f.week ?? f.round) === week && f.result === null);
}

function groupStandings(group: BclGroup) {
    return computeStandings(group.teamIds, group.fixtures);
}

function isFecRegularSeasonComplete(comp: CompetitionState): boolean {
    if (comp.phase !== 'regularSeason') {
        return false;
    }
    const rsFixtures = comp.fixtures.filter((f) => comp.groups.some((g) => g.fixtures.includes(f)));
    return rsFixtures.length > 0 && rsFixtures.every((f) => f.result !== null);
}

function isFecSecondRoundComplete(comp: CompetitionState, fec: FecConfig): boolean {
    if (comp.phase !== 'secondRound') {
        return false;
    }
    const srWeekStart = fec.groupWeeks[6] ?? 15;
    const srFixtures = comp.fixtures.filter((f) => (f.week ?? 0) >= srWeekStart);
    return srFixtures.length > 0 && srFixtures.every((f) => f.result !== null);
}

/** Advance from regular season (groups A-J) to second round (groups K-N). */
export function advanceFecFromRegularSeason(state: GameState, fec: FecConfig, rng: Rng): void {
    const comp = state.competitions.fec;
    if (!comp || comp.phase !== 'regularSeason') {
        return;
    }
    const candidates: Array<{ teamId: TeamId; wins: number; diff: number }> = [];
    for (const group of comp.groups) {
        const standings = groupStandings(group);
        for (let i = 0; i < Math.min(2, standings.length); i++) {
            const row = standings[i];
            if (row) {
                candidates.push({
                    teamId: row.teamId,
                    wins: row.wins,
                    diff: row.pointsFor - row.pointsAgainst,
                });
            }
        }
    }
    candidates.sort((a, b) => b.wins - a.wins || b.diff - a.diff);
    const srTeams = candidates.slice(0, fec.secondRoundTeams).map((c) => c.teamId);
    while (srTeams.length < fec.secondRoundTeams) {
        const extra = rng.shuffle([...comp.qualifiedTeamIds]).find((t) => !srTeams.includes(t));
        if (!extra) {
            break;
        }
        srTeams.push(extra);
    }
    const srGroups = labelGroups(
        drawGroupsWithCountryPreference(srTeams, fec as unknown as import('../../config/bcl').BclConfig, rng, {
            groupCount: fec.secondRoundGroups,
            teamsPerGroup: 4,
        }),
        SR_GROUP_NAMES,
    );
    const srFixtures = createFecGroupFixtures(srGroups, fec.groupWeeks.slice(6));
    comp.fixtures.push(...srFixtures);
    comp.groups = srGroups;
    comp.phase = 'secondRound';
}

/** Start FEC knockout playoffs from second-round group winners. */
export function maybeStartFecKnockout(state: GameState, fec: FecConfig, rng: Rng): void {
    const comp = state.competitions.fec;
    if (!comp || comp.phase !== 'secondRound' || comp.playoffs) {
        return;
    }
    const srWeekStart = fec.groupWeeks[6] ?? 15;
    const srFixtures = comp.fixtures.filter((f) => (f.week ?? 0) >= srWeekStart);
    if (!srFixtures.every((f) => f.result !== null)) {
        return;
    }
    const qualifiers: TeamId[] = [];
    for (const group of comp.groups) {
        const groupFixtures = group.fixtures.filter((f) => srFixtures.includes(f));
        const standings = computeStandings(group.teamIds, groupFixtures.length > 0 ? groupFixtures : group.fixtures);
        if (standings[0]) {
            qualifiers.push(standings[0].teamId);
        }
        if (standings[1]) {
            qualifiers.push(standings[1].teamId);
        }
    }
    const top8 = qualifiers.slice(0, 8);
    while (top8.length < 8) {
        const extra = rng.shuffle([...comp.qualifiedTeamIds]).find((t) => !top8.includes(t));
        if (!extra) {
            break;
        }
        top8.push(extra);
    }
    const seeds: Record<TeamId, number> = {};
    top8.forEach((id, i) => {
        seeds[id] = i + 1;
    });
    const pairs: Array<[number, number]> = [[1, 8], [4, 5], [2, 7], [3, 6]];
    const series = pairs.map(([high, low], slot) => ({
        id: `FEC-QF-${slot}`,
        stage: 0,
        slot,
        homeTeamId: top8[high - 1] as TeamId,
        awayTeamId: top8[low - 1] as TeamId,
        homeWins: 0,
        awayWins: 0,
        games: [],
    }));
    comp.playoffs = {
        stage: 0,
        seeds,
        series,
        championTeamId: null,
        thirdPlaceSeries: null,
        thirdPlaceTeamId: null,
    };
    comp.phase = 'quarterFinals';
}

export function advanceFecKnockout(state: GameState, fec: FecConfig): void {
    const comp = state.competitions.fec;
    if (!comp?.playoffs) {
        return;
    }
    const league = fecKnockoutLeague(fec);
    maybeAdvanceStage({ playoffs: comp.playoffs } as GameState, league);
    if (comp.playoffs.championTeamId) {
        comp.championTeamId = comp.playoffs.championTeamId;
        comp.phase = 'complete';
        comp.userFinish = resolveUserFecFinish(state, comp);
    } else if (comp.playoffs.stage === 1) {
        comp.phase = 'semiFinals';
    } else if (comp.playoffs.stage === 2) {
        comp.phase = 'finals';
    }
}

function resolveUserFecFinish(state: GameState, comp: CompetitionState): FecUserFinish | null {
    if (!state.fecQualified) {
        return null;
    }
    const userId = state.userTeamId;
    if (comp.championTeamId === userId) {
        return 'champion';
    }
    const playoffs = comp.playoffs;
    if (!playoffs) {
        return comp.phase === 'secondRound' ? 'secondRound' : 'groupStage';
    }
    const userSeries = playoffs.series.filter((s) => s.homeTeamId === userId || s.awayTeamId === userId);
    if (userSeries.length === 0) {
        return comp.phase === 'secondRound' ? 'secondRound' : 'groupStage';
    }
    const deepest = userSeries.sort((a, b) => b.stage - a.stage)[0];
    if (!deepest) {
        return 'groupStage';
    }
    const won = deepest.homeWins > deepest.awayWins
        ? deepest.homeTeamId === userId
        : deepest.awayTeamId === userId;
    if (deepest.stage === 2) {
        return won ? 'champion' : 'finalist';
    }
    if (deepest.stage === 1) {
        return won ? 'finalist' : 'semifinal';
    }
    return won ? 'semifinal' : 'quarterfinal';
}

export function activeFecSeries(state: GameState, fec: FecConfig) {
    const comp = state.competitions.fec;
    if (!comp?.playoffs) {
        return [];
    }
    return activeSeries({ playoffs: comp.playoffs } as GameState, fecKnockoutLeague(fec));
}

export function userFecSeries(state: GameState, fec: FecConfig) {
    return activeFecSeries(state, fec).find(
        (s) => s.homeTeamId === state.userTeamId || s.awayTeamId === state.userTeamId,
    ) ?? null;
}

export function recordFecSeriesGame(state: GameState, fixture: Fixture): void {
    const comp = state.competitions.fec;
    if (!comp?.playoffs) {
        return;
    }
    for (const series of comp.playoffs.series) {
        const teams = new Set([series.homeTeamId, series.awayTeamId]);
        if (teams.has(fixture.homeTeamId) && teams.has(fixture.awayTeamId)) {
            recordSeriesGame(series, fixture);
            break;
        }
    }
}

export function nextFecSeriesFixture(state: GameState, fec: FecConfig): Fixture | null {
    const series = userFecSeries(state, fec);
    if (!series) {
        return null;
    }
    const fixture = nextSeriesFixture(series);
    fixture.competitionId = 'fec';
    fixture.week = state.calendarWeek;
    return fixture;
}

export function completeFecKnockoutRound(state: GameState, fec: FecConfig): void {
    advanceFecKnockout(state, fec);
}

export function checkFecPhaseAdvancement(state: GameState, fec: FecConfig, rng: Rng): void {
    const comp = state.competitions.fec;
    if (!comp || comp.phase === 'complete') {
        return;
    }
    if (comp.phase === 'regularSeason' && isFecRegularSeasonComplete(comp)) {
        advanceFecFromRegularSeason(state, fec, rng);
    }
    if (comp.phase === 'secondRound' && isFecSecondRoundComplete(comp, fec)) {
        maybeStartFecKnockout(state, fec, rng);
    }
}

export { seriesDecided, fecKnockoutWins };
