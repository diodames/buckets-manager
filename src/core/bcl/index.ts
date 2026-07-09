import { bclConfig } from '../../config/bcl';
import type { BclConfig } from '../../config/bcl';
import { createSchedule } from '../league/schedule';
import { computeStandings, nblFixtures } from '../league/standings';
import type {
    BclGroup, BclUserFinish, CompetitionState, Fixture, GameState, PlayoffSeries, TeamId,
} from '../model/types';
import type { Rng } from '../rng';
import { activeSeries, maybeAdvanceStage, nextSeriesFixture, recordSeriesGame, seriesDecided, seriesWinner } from '../playoffs';
import type { LeagueConfig } from '../../config/league';
import { leagueConfig } from '../../config/league';
import { resolveTeamCountry } from '../teams';

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

/** Czech 3rd-place NBL team that enters BCL qualifying. */
export function nblPlayoffBclQualifyingEntrant(state: GameState): TeamId | null {
    const third = state.playoffs?.thirdPlaceTeamId;
    if (!third || !CZECH_NBL_IDS.includes(third) || !state.teams[third]) {
        return null;
    }
    return third;
}

/** Czech 4th-place NBL team that enters FIBA Europe Cup. */
export function nblPlayoffFecQualifiers(state: GameState): TeamId[] {
    const series = state.playoffs?.thirdPlaceSeries;
    const third = state.playoffs?.thirdPlaceTeamId;
    if (!series || !third) {
        return [];
    }
    const fourth = series.homeTeamId === third ? series.awayTeamId : series.homeTeamId;
    if (CZECH_NBL_IDS.includes(fourth) && state.teams[fourth]) {
        return [fourth];
    }
    return [];
}

/** Persist Czech European entrants from the playoffs that just ended. */
export function assignNblEuropeanQualifiers(state: GameState, bclCount: number, league: LeagueConfig): void {
    const direct = nblPlayoffBclQualifiers(state, bclCount, league);
    state.lastBclQualifierIds = direct;
    state.bclDirectQualified = direct.includes(state.userTeamId);
    state.bclQualifyingEntrantId = nblPlayoffBclQualifyingEntrant(state);
    state.lastFecQualifierIds = nblPlayoffFecQualifiers(state);
    state.fecQualified = state.lastFecQualifierIds.includes(state.userTeamId);
    state.bclQualified = state.bclDirectQualified;
}

/** Persist Czech BCL entrants from the playoffs that just ended. */
export function assignNblBclQualifiers(state: GameState, count: number, league: LeagueConfig): TeamId[] {
    assignNblEuropeanQualifiers(state, count, league);
    return state.lastBclQualifierIds;
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

/** Run qualifying knockout; returns teams advancing to regular season. */
export function runQualifyingRound(bcl: BclConfig, rng: Rng, count = 11): TeamId[] {
    const pool = bcl.teams.filter((t) => t.tier <= 2).map((t) => t.id);
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
            const aTier = bcl.teams.find((t) => t.id === a)?.tier ?? 1;
            const bTier = bcl.teams.find((t) => t.id === b)?.tier ?? 1;
            const aWins = aTier >= bTier ? rng.chance(0.55) : rng.chance(0.45);
            next.push(aWins ? a : b);
        }
        current = next;
        if (current.length <= count) {
            winners.push(...current.slice(0, count - winners.length));
            break;
        }
    }
    return winners.slice(0, count);
}

function teamTier(teamId: TeamId, bcl: BclConfig): number {
    const def = bcl.teams.find((t) => t.id === teamId || t.nblTeamId === teamId);
    return def?.tier ?? 1;
}

function buildEmptyGroups(groupCount: number): BclGroup[] {
    const groups: BclGroup[] = [];
    for (let g = 0; g < groupCount; g++) {
        groups.push({ id: `BCL-G${g}`, teamIds: [], fixtures: [] });
    }
    return groups;
}

function groupCountryCounts(teamIds: TeamId[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const id of teamIds) {
        const country = resolveTeamCountry(id);
        counts.set(country, (counts.get(country) ?? 0) + 1);
    }
    return counts;
}

function snakeGroupOrder(potIndex: number, groupCount: number): number[] {
    const order = Array.from({ length: groupCount }, (_, i) => i);
    if (potIndex % 2 === 1) {
        order.reverse();
    }
    return order;
}

function sortTeamsByTier(teamIds: TeamId[], bcl: BclConfig, rng: Rng): TeamId[] {
    const byTier = new Map<number, TeamId[]>();
    for (const id of teamIds) {
        const tier = teamTier(id, bcl);
        const bucket = byTier.get(tier) ?? [];
        bucket.push(id);
        byTier.set(tier, bucket);
    }
    const tiers = [...byTier.keys()].sort((a, b) => b - a);
    const sorted: TeamId[] = [];
    for (const tier of tiers) {
        sorted.push(...rng.shuffle(byTier.get(tier) ?? []));
    }
    return sorted;
}

function placeTeamInGroup(
    groups: BclGroup[],
    teamId: TeamId,
    teamsPerGroup: number,
    slotOrder: number[],
    hardCountryRule: boolean,
): void {
    const country = resolveTeamCountry(teamId);
    let bestGroup = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const g of slotOrder) {
        const group = groups[g];
        if (!group || group.teamIds.length >= teamsPerGroup) {
            continue;
        }
        const counts = groupCountryCounts(group.teamIds);
        const sameCountry = counts.get(country) ?? 0;
        if (hardCountryRule && sameCountry > 0) {
            continue;
        }
        const slotPriority = slotOrder.indexOf(g);
        const score = sameCountry * 1000 + slotPriority;
        if (score < bestScore) {
            bestScore = score;
            bestGroup = g;
        }
    }

    if (bestGroup < 0) {
        for (let g = 0; g < groups.length; g++) {
            const group = groups[g];
            if (!group || group.teamIds.length >= teamsPerGroup) {
                continue;
            }
            const counts = groupCountryCounts(group.teamIds);
            const sameCountry = counts.get(country) ?? 0;
            const score = sameCountry * 1000 + g;
            if (score < bestScore) {
                bestScore = score;
                bestGroup = g;
            }
        }
    }

    if (bestGroup >= 0) {
        groups[bestGroup]!.teamIds.push(teamId);
    }
}

/** Tier-seeded draw: 4 pots, snake assignment, hard same-country rule. */
export function drawSeededGroups(
    teamIds: TeamId[],
    bcl: BclConfig,
    rng: Rng,
    opts: { groupCount: number; teamsPerGroup: number },
): BclGroup[] {
    const { groupCount, teamsPerGroup } = opts;
    const potCount = teamsPerGroup;
    const teamsPerPot = groupCount;
    const sorted = sortTeamsByTier(teamIds, bcl, rng);
    const pots: TeamId[][] = Array.from({ length: potCount }, () => []);
    for (let i = 0; i < sorted.length; i++) {
        const potIndex = Math.floor(i / teamsPerPot);
        if (potIndex < potCount) {
            pots[potIndex]!.push(sorted[i] as TeamId);
        }
    }

    const groups = buildEmptyGroups(groupCount);
    for (let potIndex = 0; potIndex < potCount; potIndex++) {
        const slotOrder = snakeGroupOrder(potIndex, groupCount);
        const pot = pots[potIndex] ?? [];
        for (let i = 0; i < pot.length; i++) {
            const teamId = pot[i] as TeamId;
            const primary = slotOrder[i % groupCount] as number;
            const tryOrder = [primary, ...slotOrder.filter((s) => s !== primary)];
            placeTeamInGroup(groups, teamId, teamsPerGroup, tryOrder, true);
        }
    }
    return groups;
}

/** Best-effort country separation for R16 re-draw (no tier seeding). */
export function drawGroupsWithCountryPreference(
    teamIds: TeamId[],
    _bcl: BclConfig,
    rng: Rng,
    opts: { groupCount: number; teamsPerGroup: number },
): BclGroup[] {
    const { groupCount, teamsPerGroup } = opts;
    const countryTotals = new Map<string, number>();
    for (const id of teamIds) {
        const country = resolveTeamCountry(id);
        countryTotals.set(country, (countryTotals.get(country) ?? 0) + 1);
    }
    const ordered = rng.shuffle([...teamIds]).sort((a, b) => {
        const ca = countryTotals.get(resolveTeamCountry(a)) ?? 0;
        const cb = countryTotals.get(resolveTeamCountry(b)) ?? 0;
        return cb - ca;
    });

    function assignFrom(index: number, groups: BclGroup[], allowSameCountry: boolean): boolean {
        if (index >= ordered.length) {
            return true;
        }
        const teamId = ordered[index] as TeamId;
        const country = resolveTeamCountry(teamId);
        const slotOrder = Array.from({ length: groupCount }, (_, i) => i)
            .sort((a, b) => groups[a]!.teamIds.length - groups[b]!.teamIds.length);
        for (const g of slotOrder) {
            const group = groups[g]!;
            if (group.teamIds.length >= teamsPerGroup) {
                continue;
            }
            const sameCountry = (groupCountryCounts(group.teamIds).get(country) ?? 0) > 0;
            if (!allowSameCountry && sameCountry) {
                continue;
            }
            group.teamIds.push(teamId);
            if (assignFrom(index + 1, groups, allowSameCountry)) {
                return true;
            }
            group.teamIds.pop();
        }
        return false;
    }

    const groups = buildEmptyGroups(groupCount);
    if (!assignFrom(0, groups, false)) {
        for (const group of groups) {
            group.teamIds = [];
        }
        assignFrom(0, groups, true);
    }
    return groups;
}

/** @deprecated Use drawSeededGroups or drawGroupsWithCountryPreference. */
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
        if (ids.length >= 2 && ids.length % 2 === 0) {
            const groupFixtures = createSchedule(ids, 2);
            for (const f of groupFixtures) {
                const week = weeks[f.round - 1] ?? weeks[weeks.length - 1] ?? 2;
                const fixture: Fixture = {
                    id: `${group.id}-R${f.round}-${f.homeTeamId}-${f.awayTeamId}`,
                    round: f.round,
                    homeTeamId: f.homeTeamId,
                    awayTeamId: f.awayTeamId,
                    result: null,
                    competitionId: 'bcl',
                    week,
                };
                fixtures.push(fixture);
                group.fixtures.push(fixture);
            }
            continue;
        }
        // Odd-sized groups (e.g. R16 with fewer than 16 qualifiers): one leg per week.
        const pairings: Array<[TeamId, TeamId]> = [];
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                pairings.push([ids[i] as TeamId, ids[j] as TeamId]);
                pairings.push([ids[j] as TeamId, ids[i] as TeamId]);
            }
        }
        for (let p = 0; p < pairings.length; p++) {
            const [home, away] = pairings[p] as [TeamId, TeamId];
            const week = weeks[p % weeks.length] ?? 2;
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

function bclQualifyingWinsNeeded(bcl: BclConfig): number {
    return bcl.qualifyingWinsNeeded ?? 2;
}

function isBclQualifyingSeriesDecided(series: PlayoffSeries, bcl: BclConfig): boolean {
    const needed = bclQualifyingWinsNeeded(bcl);
    return series.homeWins >= needed || series.awayWins >= needed;
}

function bclQualifyingWinner(series: PlayoffSeries, bcl: BclConfig): TeamId | null {
    const needed = bclQualifyingWinsNeeded(bcl);
    if (series.homeWins >= needed) {
        return series.homeTeamId;
    }
    if (series.awayWins >= needed) {
        return series.awayTeamId;
    }
    return null;
}

function pickBclQualifyingOpponent(bcl: BclConfig, entrantId: TeamId, rng: Rng): TeamId {
    const pool = bcl.teams
        .filter((t) => t.tier <= 2 && (t.nblTeamId ?? t.id) !== entrantId)
        .map((t) => t.nblTeamId ?? t.id);
    const shuffled = rng.shuffle(pool);
    return (shuffled[0] ?? bcl.teams[0]?.id ?? 'BCL-RYT') as TeamId;
}

function startBclQualifyingSeries(
    _state: GameState,
    bcl: BclConfig,
    entrantId: TeamId,
    rng: Rng,
): CompetitionState {
    const opponent = pickBclQualifyingOpponent(bcl, entrantId, rng);
    const [home, away] = entrantId <= opponent ? [entrantId, opponent] : [opponent, entrantId];
    const series: PlayoffSeries = {
        id: 'BCL-QUALI-0',
        stage: 0,
        slot: 0,
        homeTeamId: home,
        awayTeamId: away,
        homeWins: 0,
        awayWins: 0,
        games: [],
    };
    return {
        id: 'bcl',
        phase: 'qualifying',
        fixtures: [],
        groups: [],
        playoffs: null,
        qualifyingSeries: series,
        qualifyingEntrantId: entrantId,
        qualifyingOpponentId: opponent,
        qualifiedTeamIds: [],
        championTeamId: null,
        prizePaid: false,
        weeklyPrizePaidTotal: 0,
        userFinish: null,
    };
}

function buildBclRegularSeason(
    state: GameState,
    bcl: BclConfig,
    league: LeagueConfig,
    rng: Rng,
    extraQualifyingWinners: TeamId[],
): CompetitionState {
    const direct = directEntryTeams(state, bcl, league);
    const rngWinners = runQualifyingRound(bcl, rng, 11 - extraQualifyingWinners.length);
    const allTeams = [...direct, ...extraQualifyingWinners, ...rngWinners].slice(0, bcl.regularSeasonTeams);
    while (allTeams.length < bcl.regularSeasonTeams) {
        const extra = bcl.teams.find((t) => !allTeams.includes(t.nblTeamId ?? t.id));
        if (!extra) {
            break;
        }
        allTeams.push(extra.nblTeamId ?? extra.id);
    }

    const groups = drawSeededGroups(allTeams.slice(0, 32), bcl, rng, {
        groupCount: bcl.groupCount,
        teamsPerGroup: bcl.teamsPerGroup,
    });
    const fixtures = createGroupFixtures(groups, bcl.groupWeeks);

    return {
        id: 'bcl',
        phase: 'regularSeason',
        fixtures,
        groups,
        playoffs: null,
        qualifyingSeries: null,
        qualifyingEntrantId: null,
        qualifyingOpponentId: null,
        qualifiedTeamIds: allTeams.slice(0, 32),
        championTeamId: null,
        prizePaid: false,
        weeklyPrizePaidTotal: 0,
        userFinish: null,
    };
}

export function startBclSeason(state: GameState, bcl: BclConfig, league: LeagueConfig, rng: Rng): CompetitionState | null {
    const czech = czechBclQualifiers(state, bcl.czechQualifiers, league);
    state.bclDirectQualified = czech.includes(state.userTeamId);
    state.bclQualified = state.bclDirectQualified;

    const qualiEntrant = state.bclQualifyingEntrantId;
    if (qualiEntrant) {
        const competition = startBclQualifyingSeries(state, bcl, qualiEntrant, rng);
        state.competitions.bcl = competition;
        return competition;
    }

    const competition = buildBclRegularSeason(state, bcl, league, rng, []);
    state.competitions.bcl = competition;
    return competition;
}

export function bclCompetition(state: GameState): CompetitionState | null {
    return state.competitions.bcl ?? null;
}

/** Resolve group fixture rows to the canonical objects in comp.fixtures (by id). */
export function resolveGroupFixtures(comp: CompetitionState, group: BclGroup): Fixture[] {
    const byId = new Map(comp.fixtures.map((f) => [f.id, f]));
    return group.fixtures.map((f) => byId.get(f.id) ?? f);
}

/** Re-link group.fixtures to comp.fixtures after JSON save/load duplicates objects. */
export function relinkCompetitionGroups(comp: CompetitionState): void {
    const byId = new Map(comp.fixtures.map((f) => [f.id, f]));
    const relink = (groups: BclGroup[]) => {
        for (const group of groups) {
            group.fixtures = group.fixtures.map((f) => byId.get(f.id) ?? f);
        }
    };
    relink(comp.groups);
    if (comp.archivedGroups) {
        relink(comp.archivedGroups);
    }
}

function bclKnockoutWins(stage: number, bcl: BclConfig): number {
    return bcl.knockoutWinsNeeded[stage] ?? 2;
}

export function bclKnockoutLeague(bcl: BclConfig): LeagueConfig {
    return {
        ...leagueConfig,
        playoffs: {
            ...leagueConfig.playoffs,
            winsNeeded: [...bcl.knockoutWinsNeeded] as [number, number, number],
        },
    };
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

export function isBclRegularSeasonComplete(comp: CompetitionState): boolean {
    if (comp.phase !== 'regularSeason') {
        return false;
    }
    const rsFixtures = comp.fixtures.filter((f) => comp.groups.some((g) => g.fixtures.some((gf) => gf.id === f.id)));
    return rsFixtures.length > 0 && rsFixtures.every((f) => f.result !== null);
}

export function isBclR16Complete(comp: CompetitionState, bcl: BclConfig): boolean {
    if (comp.phase !== 'roundOf16') {
        return false;
    }
    const r16WeekStart = bcl.groupWeeks[6] ?? 14;
    const r16Fixtures = comp.fixtures.filter((f) => (f.week ?? 0) >= r16WeekStart);
    return r16Fixtures.length > 0 && r16Fixtures.every((f) => f.result !== null);
}

/** @deprecated Use isBclRegularSeasonComplete. */
export function isBclGroupStageComplete(bcl: CompetitionState): boolean {
    return isBclRegularSeasonComplete(bcl);
}

function groupStandings(comp: CompetitionState, group: BclGroup): ReturnType<typeof computeStandings> {
    return computeStandings(group.teamIds, resolveGroupFixtures(comp, group));
}

function r16GroupStandings(comp: CompetitionState, group: BclGroup, bcl: BclConfig): ReturnType<typeof computeStandings> {
    const r16WeekStart = bcl.groupWeeks[6] ?? 14;
    const resolved = resolveGroupFixtures(comp, group).filter((f) => (f.week ?? 0) >= r16WeekStart);
    return computeStandings(group.teamIds, resolved.length > 0 ? resolved : resolveGroupFixtures(comp, group));
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
        const standings = groupStandings(comp, group);
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
    const r16Groups = drawGroupsWithCountryPreference(r16Teams, bcl, rng, {
        groupCount: 4,
        teamsPerGroup: bcl.teamsPerGroup,
    });
    const r16Fixtures = createGroupFixtures(r16Groups, bcl.groupWeeks.slice(6));
    comp.archivedGroups = comp.groups.map((g) => ({
        id: g.id,
        teamIds: [...g.teamIds],
        fixtures: resolveGroupFixtures(comp, g),
    }));
    comp.fixtures.push(...r16Fixtures);
    comp.groups = r16Groups;
    comp.phase = 'roundOf16';
}

export function advanceBclKnockout(state: GameState, bcl: BclConfig): void {
    const comp = state.competitions.bcl;
    if (!comp?.playoffs) {
        return;
    }
    const league = bclKnockoutLeague(bcl);
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
    if (!isBclR16Complete(comp, bcl)) {
        return;
    }
    const qualifiers: TeamId[] = [];
    for (const group of comp.groups) {
        const standings = r16GroupStandings(comp, group, bcl);
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
    comp.playoffs = { stage: 0, seeds, series, championTeamId: null, thirdPlaceSeries: null, thirdPlaceTeamId: null };
    comp.phase = 'quarterFinals';
}

export function userBclQualifyingSeries(state: GameState, bcl: BclConfig): PlayoffSeries | null {
    const comp = state.competitions.bcl;
    if (!comp || comp.phase !== 'qualifying' || !comp.qualifyingSeries) {
        return null;
    }
    if (isBclQualifyingSeriesDecided(comp.qualifyingSeries, bcl)) {
        return null;
    }
    const series = comp.qualifyingSeries;
    if (series.homeTeamId === state.userTeamId || series.awayTeamId === state.userTeamId) {
        return series;
    }
    return null;
}

export function nextBclQualifyingFixture(state: GameState, bcl: BclConfig): Fixture | null {
    const series = userBclQualifyingSeries(state, bcl);
    if (!series) {
        return null;
    }
    const fixture = nextSeriesFixture(series);
    fixture.competitionId = 'bcl';
    fixture.week = state.calendarWeek;
    return fixture;
}

export function recordBclQualifyingGame(state: GameState, fixture: Fixture): void {
    const comp = state.competitions.bcl;
    if (!comp?.qualifyingSeries) {
        return;
    }
    recordSeriesGame(comp.qualifyingSeries, fixture);
}

export function maybeAdvanceBclFromQualifying(
    state: GameState,
    bcl: BclConfig,
    league: LeagueConfig,
    rng: Rng,
): void {
    const comp = state.competitions.bcl;
    if (!comp || comp.phase !== 'qualifying' || !comp.qualifyingSeries || !comp.qualifyingEntrantId) {
        return;
    }
    if (!isBclQualifyingSeriesDecided(comp.qualifyingSeries, bcl)) {
        return;
    }
    const winner = bclQualifyingWinner(comp.qualifyingSeries, bcl);
    const extraWinners: TeamId[] = [];
    if (winner === comp.qualifyingEntrantId) {
        extraWinners.push(comp.qualifyingEntrantId);
        if (comp.qualifyingEntrantId === state.userTeamId) {
            state.bclQualified = true;
        }
    }
    const next = buildBclRegularSeason(state, bcl, league, rng, extraWinners);
    state.competitions.bcl = next;
}

/** Sim out a BCL qualifying series when the user is not involved. */
export function simBclQualifyingSeries(
    state: GameState,
    bcl: BclConfig,
    league: LeagueConfig,
    rng: Rng,
    simGame: (fixture: Fixture) => void,
): void {
    const comp = state.competitions.bcl;
    if (!comp || comp.phase !== 'qualifying' || !comp.qualifyingSeries) {
        return;
    }
    while (!isBclQualifyingSeriesDecided(comp.qualifyingSeries, bcl)) {
        const fixture = nextSeriesFixture(comp.qualifyingSeries);
        fixture.competitionId = 'bcl';
        simGame(fixture);
        recordSeriesGame(comp.qualifyingSeries, fixture);
    }
    maybeAdvanceBclFromQualifying(state, bcl, league, rng);
}

export function completeBclQualifyingRound(state: GameState, bcl: BclConfig, league: LeagueConfig, rng: Rng): void {
    maybeAdvanceBclFromQualifying(state, bcl, league, rng);
}

export function activeBclSeries(state: GameState, bcl: BclConfig) {
    const comp = state.competitions.bcl;
    if (!comp?.playoffs) {
        return [];
    }
    return activeSeries({ playoffs: comp.playoffs } as GameState, bclKnockoutLeague(bcl));
}

export function userBclSeries(state: GameState, bcl: BclConfig) {
    const comp = state.competitions.bcl;
    if (!comp?.playoffs) {
        return null;
    }
    return activeBclSeries(state, bcl).find(
        (s) => s.homeTeamId === state.userTeamId || s.awayTeamId === state.userTeamId,
    ) ?? null;
}

export function completeBclKnockoutRound(state: GameState, bcl: BclConfig): void {
    advanceBclKnockout(state, bcl);
}

export function recordBclSeriesGame(state: GameState, fixture: Fixture): void {
    const comp = state.competitions.bcl;
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

export function nextBclSeriesFixture(state: GameState, bcl: BclConfig): Fixture | null {
    const series = userBclSeries(state, bcl);
    if (!series) {
        return null;
    }
    const fixture = nextSeriesFixture(series);
    fixture.competitionId = 'bcl';
    fixture.week = state.calendarWeek;
    return fixture;
}

export function hasPendingBclKnockout(state: GameState, bcl: BclConfig): boolean {
    const comp = state.competitions.bcl;
    if (!comp?.playoffs || comp.phase === 'complete') {
        return false;
    }
    return activeBclSeries(state, bcl).length > 0;
}

export function checkBclPhaseAdvancement(state: GameState, bcl: BclConfig, league: LeagueConfig, rng: Rng): void {
    const comp = state.competitions.bcl;
    if (!comp || comp.phase === 'complete') {
        return;
    }
    if (comp.phase === 'qualifying') {
        maybeAdvanceBclFromQualifying(state, bcl, league, rng);
        return;
    }
    if (comp.phase === 'regularSeason' && isBclRegularSeasonComplete(comp)) {
        advanceBclFromGroups(state, bcl, rng);
    }
    if (comp.phase === 'roundOf16') {
        maybeStartBclKnockout(state, bcl, league, rng);
    }
}

export { seriesDecided, seriesWinner, nextSeriesFixture, bclKnockoutWins };
