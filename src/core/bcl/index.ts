import { bclConfig } from '../../config/bcl';
import type { BclConfig } from '../../config/bcl';
import { computeStandings, nblFixtures } from '../league/standings';
import type {
    BclGroup, BclUserFinish, CompetitionState, Fixture, GameState, TeamId,
} from '../model/types';
import type { Rng } from '../rng';
import { activeSeries, maybeAdvanceStage, nextSeriesFixture, recordSeriesGame, seriesDecided, seriesWinner } from '../playoffs';
import type { LeagueConfig } from '../../config/league';

const CZECH_NBL_IDS = ['NYM', 'PCE', 'BRN', 'UST', 'OPA', 'PIS', 'DEC', 'OST', 'OLO', 'USK', 'SLA', 'HKR'];

export { CZECH_NBL_IDS };

/** Top N Czech NBL teams that qualify for BCL from the last completed NBL playoffs. */
export function czechBclQualifiers(state: GameState, count: number, league?: LeagueConfig): TeamId[] {
    if (state.lastBclQualifierIds.length > 0) {
        return state.lastBclQualifierIds.slice(0, count);
    }
    const playoffs = state.playoffs;
    if (playoffs?.championTeamId && league) {
        const fromPlayoffs = nblPlayoffBclQualifiers(state, count, league);
        if (fromPlayoffs.length > 0) {
            return fromPlayoffs;
        }
    }
    const czechTeams = CZECH_NBL_IDS.filter((id) => state.teams[id]);
    const standings = computeStandings(czechTeams, nblFixtures(state.fixtures));
    return standings.slice(0, count).map((r) => r.teamId);
}

/** Champion and finalist from a completed NBL playoff bracket. */
export function nblPlayoffBclQualifiers(state: GameState, count: number, league: LeagueConfig): TeamId[] {
    const playoffs = state.playoffs;
    const champion = playoffs?.championTeamId;
    if (!champion) {
        return [];
    }
    const finalsStage = league.playoffs.winsNeeded.length - 1;
    const finals = playoffs.series.find((s) => s.stage === finalsStage);
    const runnerUp = finals
        ? (finals.homeTeamId === champion ? finals.awayTeamId : finals.homeTeamId)
        : null;
    const qualifiers: TeamId[] = [];
    if (CZECH_NBL_IDS.includes(champion) && state.teams[champion]) {
        qualifiers.push(champion);
    }
    if (
        runnerUp
        && runnerUp !== champion
        && CZECH_NBL_IDS.includes(runnerUp)
        && state.teams[runnerUp]
        && qualifiers.length < count
    ) {
        qualifiers.push(runnerUp);
    }
    return qualifiers.slice(0, count);
}

/** Persist Czech BCL entrants from the playoffs that just ended. */
export function assignNblBclQualifiers(state: GameState, count: number, league: LeagueConfig): TeamId[] {
    const qualifiers = nblPlayoffBclQualifiers(state, count, league);
    state.lastBclQualifierIds = qualifiers;
    state.bclQualified = qualifiers.includes(state.userTeamId);
    return qualifiers;
}

export function userBclQualified(state: GameState): boolean {
    return state.bclQualified;
}

function resolveBclTeamId(bclTeamId: string): string {
    const def = bclConfig.teams.find((t) => t.id === bclTeamId);
    return def?.nblTeamId ?? bclTeamId;
}

/** Teams that enter BCL regular season directly (21 fixed European + Czech qualifiers). */
export function directEntryTeams(state: GameState, bcl: BclConfig, league: LeagueConfig): TeamId[] {
    const czech = czechBclQualifiers(state, bcl.czechQualifiers, league);
    const fixed = bcl.teams
        .filter((t) => t.tier >= 3 && !t.nblTeamId)
        .slice(0, 21 - czech.length)
        .map((t) => t.id);
    const entries = [...czech, ...fixed.map(resolveBclTeamId)];
    // Pad to 21 with remaining tier-3 clubs if needed.
    while (entries.length < 21) {
        const extra = bcl.teams.find((t) => t.tier >= 3 && !entries.includes(t.nblTeamId ?? t.id));
        if (!extra) {
            break;
        }
        entries.push(extra.nblTeamId ?? extra.id);
    }
    return entries.slice(0, 21);
}

/** Run qualifying knockout; returns 11 teams advancing to regular season. */
export function runQualifyingRound(bcl: BclConfig, rng: Rng): TeamId[] {
    const pool = bcl.teams.filter((t) => t.tier <= 2).map((t) => t.id);
    const shuffled = rng.shuffle([...pool]);
    const winners: TeamId[] = [];
    let current = shuffled;
    while (winners.length < 11 && current.length > 0) {
        const next: TeamId[] = [];
        for (let i = 0; i < current.length; i += 2) {
            const a = current[i] as TeamId;
            const b = current[i + 1];
            if (!b) {
                next.push(a);
                continue;
            }
            const aTier = bcl.teams.find((t) => t.id === a)?.tier ?? 1;
            const bTier = bcl.teams.find((t) => t.id === b)?.tier ?? 1;
            const aWins = aTier >= bTier ? rng.chance(0.55) : rng.chance(0.45);
            next.push(aWins ? a : b);
        }
        current = next;
        if (current.length <= 11) {
            winners.push(...current.slice(0, 11 - winners.length));
            break;
        }
    }
    return winners.slice(0, 11);
}

/** Draw 8 groups of 4 from 32 teams. */
export function drawGroups(teamIds: TeamId[], rng: Rng): BclGroup[] {
    const shuffled = rng.shuffle([...teamIds]);
    const groups: BclGroup[] = [];
    for (let g = 0; g < 8; g++) {
        const slice = shuffled.slice(g * 4, g * 4 + 4);
        groups.push({ id: `BCL-G${g}`, teamIds: slice, fixtures: [] });
    }
    return groups;
}

/** Home-and-away round robin within each group (6 games per team). */
export function createGroupFixtures(groups: BclGroup[], weeks: readonly number[]): Fixture[] {
    const fixtures: Fixture[] = [];
    for (const group of groups) {
        const ids = group.teamIds;
        const pairings: Array<[TeamId, TeamId]> = [];
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                pairings.push([ids[i] as TeamId, ids[j] as TeamId]);
                pairings.push([ids[j] as TeamId, ids[i] as TeamId]);
            }
        }
        for (let p = 0; p < pairings.length; p++) {
            const [home, away] = pairings[p] as [TeamId, TeamId];
            const week = weeks[Math.floor(p / 2) % weeks.length] ?? 2;
            const fixture: Fixture = {
                id: `${group.id}-F${p}`,
                round: p + 1,
                homeTeamId: home,
                awayTeamId: away,
                result: null,
                competitionId: 'bcl',
                week,
            };
            fixtures.push(fixture);
            group.fixtures.push(fixture);
        }
    }
    return fixtures;
}

export function startBclSeason(state: GameState, bcl: BclConfig, league: LeagueConfig, rng: Rng): CompetitionState | null {
    const czech = czechBclQualifiers(state, bcl.czechQualifiers, league);
    state.bclQualified = czech.includes(state.userTeamId);

    const direct = directEntryTeams(state, bcl, league);
    const qualifyingWinners = runQualifyingRound(bcl, rng);
    const allTeams = [...direct, ...qualifyingWinners].slice(0, bcl.regularSeasonTeams);
    while (allTeams.length < bcl.regularSeasonTeams) {
        const extra = bcl.teams.find((t) => !allTeams.includes(t.nblTeamId ?? t.id));
        if (!extra) {
            break;
        }
        allTeams.push(extra.nblTeamId ?? extra.id);
    }

    const groups = drawGroups(allTeams.slice(0, 32), rng);
    const fixtures = createGroupFixtures(groups, bcl.groupWeeks);

    const competition: CompetitionState = {
        id: 'bcl',
        phase: 'regularSeason',
        fixtures,
        groups,
        playoffs: null,
        qualifiedTeamIds: allTeams.slice(0, 32),
        championTeamId: null,
        prizePaid: false,
        userFinish: null,
    };
    state.competitions.bcl = competition;
    return competition;
}

export function bclCompetition(state: GameState): CompetitionState | null {
    return state.competitions.bcl ?? null;
}

export function pendingBclFixtures(state: GameState, week: number): Fixture[] {
    const bcl = bclCompetition(state);
    if (!bcl) {
        return [];
    }
    return bcl.fixtures.filter((f) => (f.week ?? f.round) === week && f.result === null);
}

export function allPendingFixturesForWeek(state: GameState, week: number): Fixture[] {
    const nbl = state.fixtures.filter(
        (f) => (f.week ?? f.round) === week && f.result === null && (!f.competitionId || f.competitionId === 'nbl'),
    );
    const bcl = pendingBclFixtures(state, week);
    return [...bcl, ...nbl];
}

export function isBclGroupStageComplete(bcl: CompetitionState): boolean {
    return bcl.phase === 'regularSeason' && bcl.fixtures.every((f) => f.result !== null);
}

function groupStandings(group: BclGroup): ReturnType<typeof computeStandings> {
    return computeStandings(group.teamIds, group.fixtures);
}

/** Advance from group stage to play-ins and round of 16. */
export function advanceBclFromGroups(state: GameState, bcl: BclConfig, rng: Rng): void {
    const comp = state.competitions.bcl;
    if (!comp || comp.phase !== 'regularSeason') {
        return;
    }
    const groupWinners: TeamId[] = [];
    const groupThirds: TeamId[] = [];
    for (const group of comp.groups) {
        const standings = groupStandings(group);
        if (standings[0]) {
            groupWinners.push(standings[0].teamId);
        }
        if (standings[2]) {
            groupThirds.push(standings[2].teamId);
        }
    }
    // Play-in: third-place teams paired, winners join R16.
    const playInWinners: TeamId[] = [];
    for (let i = 0; i < groupThirds.length; i += 2) {
        const a = groupThirds[i];
        const b = groupThirds[i + 1];
        if (!a) {
            continue;
        }
        if (!b) {
            playInWinners.push(a);
            continue;
        }
        playInWinners.push(rng.chance(0.5) ? a : b);
    }
    const r16Teams = [...groupWinners, ...playInWinners].slice(0, 16);
    const r16Groups = drawGroups(r16Teams, rng);
    const r16Fixtures = createGroupFixtures(r16Groups, bcl.groupWeeks.slice(6));
    comp.fixtures.push(...r16Fixtures);
    comp.groups = r16Groups;
    comp.phase = 'roundOf16';
}

export function advanceBclKnockout(state: GameState, league: LeagueConfig): void {
    const comp = state.competitions.bcl;
    if (!comp?.playoffs) {
        return;
    }
    maybeAdvanceStage({ playoffs: comp.playoffs } as GameState, league);
    if (comp.playoffs.championTeamId) {
        comp.championTeamId = comp.playoffs.championTeamId;
        comp.phase = 'complete';
        comp.userFinish = resolveUserBclFinish(state, comp);
    }
}

function resolveUserBclFinish(state: GameState, comp: CompetitionState): BclUserFinish | null {
    if (!state.bclQualified) {
        return null;
    }
    const userId = state.userTeamId;
    if (comp.championTeamId === userId) {
        return 'champion';
    }
    const playoffs = comp.playoffs;
    if (!playoffs) {
        return 'groupStage';
    }
    const userSeries = playoffs.series.filter((s) => s.homeTeamId === userId || s.awayTeamId === userId);
    if (userSeries.length === 0) {
        return comp.phase === 'roundOf16' ? 'roundOf16' : 'groupStage';
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

/** When R16 group stage ends, start quarter-final bracket. */
export function maybeStartBclKnockout(state: GameState, bcl: BclConfig, _league: LeagueConfig, rng: Rng): void {
    const comp = state.competitions.bcl;
    if (!comp || comp.phase !== 'roundOf16' || comp.playoffs) {
        return;
    }
    const r16Fixtures = comp.fixtures.filter((f) => f.week !== undefined && (f.week ?? 0) >= (bcl.groupWeeks[6] ?? 14));
    if (!r16Fixtures.every((f) => f.result !== null)) {
        return;
    }
    const qualifiers: TeamId[] = [];
    for (const group of comp.groups) {
        const r16GroupFixtures = group.fixtures.filter((f) => r16Fixtures.includes(f));
        const standings = computeStandings(group.teamIds, r16GroupFixtures.length > 0 ? r16GroupFixtures : group.fixtures);
        if (standings[0]) {
            qualifiers.push(standings[0].teamId);
        }
        if (standings[1]) {
            qualifiers.push(standings[1].teamId);
        }
    }
    const top8 = qualifiers.slice(0, 8);
    if (top8.length < 8) {
        const filled = rng.shuffle([...comp.qualifiedTeamIds]).slice(0, 8);
        top8.push(...filled.filter((t) => !top8.includes(t)));
    }
    const seeds: Record<TeamId, number> = {};
    top8.forEach((id, i) => {
        seeds[id] = i + 1;
    });
    const pairs: Array<[number, number]> = [[1, 8], [4, 5], [2, 7], [3, 6]];
    const series = pairs.map(([high, low], slot) => ({
        id: `BCL-QF-${slot}`,
        stage: 0,
        slot,
        homeTeamId: top8[high - 1] as TeamId,
        awayTeamId: top8[low - 1] as TeamId,
        homeWins: 0,
        awayWins: 0,
        games: [],
    }));
    comp.playoffs = { stage: 0, seeds, series, championTeamId: null };
    comp.phase = 'quarterFinals';
}

export function activeBclSeries(state: GameState, league: LeagueConfig) {
    const comp = state.competitions.bcl;
    if (!comp?.playoffs) {
        return [];
    }
    return activeSeries({ playoffs: comp.playoffs } as GameState, league);
}

export function userBclSeries(state: GameState, league: LeagueConfig) {
    const comp = state.competitions.bcl;
    if (!comp?.playoffs) {
        return null;
    }
    return activeBclSeries(state, league).find(
        (s) => s.homeTeamId === state.userTeamId || s.awayTeamId === state.userTeamId,
    ) ?? null;
}

export function completeBclKnockoutRound(state: GameState, league: LeagueConfig): void {
    const comp = state.competitions.bcl;
    if (!comp?.playoffs) {
        return;
    }
    maybeAdvanceStage({ playoffs: comp.playoffs } as GameState, league);
    if (comp.playoffs.championTeamId) {
        comp.championTeamId = comp.playoffs.championTeamId;
        comp.phase = 'complete';
        comp.userFinish = resolveUserBclFinish(state, comp);
    }
}

export function recordBclSeriesGame(state: GameState, fixture: Fixture): void {
    const comp = state.competitions.bcl;
    if (!comp?.playoffs) {
        return;
    }
    for (const series of comp.playoffs.series) {
        if (series.homeTeamId === fixture.homeTeamId || series.awayTeamId === fixture.homeTeamId) {
            recordSeriesGame(series, fixture);
            break;
        }
    }
}

export function nextBclSeriesFixture(state: GameState, league: LeagueConfig): Fixture | null {
    const series = userBclSeries(state, league);
    if (!series) {
        return null;
    }
    const fixture = nextSeriesFixture(series);
    fixture.competitionId = 'bcl';
    fixture.week = state.calendarWeek;
    return fixture;
}

export function checkBclPhaseAdvancement(state: GameState, bcl: BclConfig, league: LeagueConfig, rng: Rng): void {
    const comp = state.competitions.bcl;
    if (!comp || comp.phase === 'complete') {
        return;
    }
    if (comp.phase === 'regularSeason' && isBclGroupStageComplete(comp)) {
        advanceBclFromGroups(state, bcl, rng);
    }
    if (comp.phase === 'roundOf16') {
        maybeStartBclKnockout(state, bcl, league, rng);
    }
}

export { seriesDecided, seriesWinner, nextSeriesFixture };
