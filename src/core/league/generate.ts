import type { BalanceConfig } from '../../config/balance';
import type { BclConfig, BclTeamDef } from '../../config/bcl';
import type { FecConfig } from '../../config/fec';
import type { LeagueConfig, RealPlayerDef, TeamDef } from '../../config/league';
import type { NamePools } from '../../config/names';
import { preferredLineupForTeam } from '../../config/openingLineups';
import { generateName } from '../namegen';
import type { Attributes, Player, Position, Team } from '../model/types';
import { ATTRIBUTE_KEYS, overallRating, POSITIONS } from '../model/types';
import { hashString, type Rng } from '../rng';
import { pickStarters } from '../roster';
import { personalityForTeam } from '../personality';
import {
    enforceTopClubOverallGap,
    minutesPotentialBonus,
    potentialHeadroomForAge,
    tierMean,
    TIER_MEANS,
    youthFillMean,
} from './playerRating';

export interface GeneratedLeague {
    teams: Record<string, Team>;
    players: Record<string, Player>;
}

export { TIER_MEANS };

/** Real roster players use a tighter spread so stats-derived means stay recognizable. */
const REAL_PLAYER_ATTR_SPREAD = 6;

function clampAttribute(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)));
}

function generateAttributes(rng: Rng, position: Position, mean: number, spread: number, balance: BalanceConfig): Attributes {
    const gen = balance.playerGen;
    const bias = gen.positionBias[position] as Partial<Record<keyof Attributes, number>>;
    const attributes = {} as Attributes;
    for (const key of ATTRIBUTE_KEYS) {
        // Sum of two uniforms approximates a triangular distribution around the mean.
        const noise = (rng.next() + rng.next() - 1) * spread;
        attributes[key] = clampAttribute(mean + noise + (bias[key] ?? 0), gen.attributeMin, gen.attributeMax);
    }
    return attributes;
}

function meanFromDef(def: RealPlayerDef, tierMeanBonus: number): number {
    if (def.targetOverall != null && Number.isFinite(def.targetOverall)) {
        return def.targetOverall + tierMeanBonus;
    }
    return tierMean(def.tier, tierMeanBonus);
}

function rollPotential(
    rng: Rng,
    overall: number,
    age: number,
    def: RealPlayerDef,
    balance: BalanceConfig,
): number {
    const gen = balance.playerGen;
    if (def.potentialHint != null && Number.isFinite(def.potentialHint)) {
        return clampAttribute(def.potentialHint, gen.attributeMin, gen.attributeMax);
    }
    const { lo, hi } = potentialHeadroomForAge(age);
    const headroom = rng.int(lo, hi) + minutesPotentialBonus(age, def.mpg);
    return clampAttribute(overall + headroom, gen.attributeMin, gen.attributeMax);
}

/**
 * Builds a Player from a real NBL roster entry. Attributes are derived
 * deterministically from targetOverall (or tier) + position, seeded by name,
 * so the same league seed always produces the same ratings.
 */
export function playerFromDef(
    rng: Rng,
    id: string,
    teamId: string | null,
    def: RealPlayerDef,
    seasonYear: number,
    balance: BalanceConfig,
    tierMeanBonus = 0,
): Player {
    const gen = balance.playerGen;
    const personalRng = rng.fork(`real:${def.firstName} ${def.lastName}`);
    const mean = meanFromDef(def, tierMeanBonus);
    const attributes = generateAttributes(personalRng, def.position, mean, REAL_PLAYER_ATTR_SPREAD, balance);
    const age = def.born ? Math.max(16, seasonYear - def.born) : personalRng.int(20, 32);
    const heights = gen.heightRangeCm[def.position];
    const overall = overallRating(attributes);
    return {
        id,
        firstName: def.firstName,
        lastName: def.lastName,
        nationality: def.nationality ?? 'CZE',
        age,
        heightCm: def.heightCm ?? personalRng.int(heights.min, heights.max),
        position: def.position,
        attributes,
        potential: rollPotential(personalRng, overall, age, def, balance),
        fatigue: 0,
        morale: teamId === null ? 60 : 70,
        injury: null,
        teamId,
        contract: null,
    };
}

function playerFromReal(
    rng: Rng,
    id: string,
    teamId: string,
    def: RealPlayerDef,
    seasonYear: number,
    balance: BalanceConfig,
    tierMeanBonus = 0,
): Player {
    return playerFromDef(rng, id, teamId, def, seasonYear, balance, tierMeanBonus);
}

/** Fictional youth fill-in for rosters shorter than the fill target. */
function generateYouthPlayer(
    rng: Rng,
    id: string,
    teamId: string,
    position: Position,
    pools: NamePools,
    usedNames: Set<string>,
    balance: BalanceConfig,
    teamTier = 3,
): Player {
    const gen = balance.playerGen;
    const name = generateName(rng, pools, usedNames);
    const attributes = generateAttributes(rng, position, youthFillMean(teamTier), 7, balance);
    const heights = gen.heightRangeCm[position];
    const overall = overallRating(attributes);
    return {
        id,
        firstName: name.firstName,
        lastName: name.lastName,
        nationality: 'CZE',
        age: rng.int(17, 20),
        heightCm: rng.int(heights.min, heights.max),
        position,
        attributes,
        potential: clampAttribute(overall + rng.int(10, 30), gen.attributeMin, gen.attributeMax),
        fatigue: 0,
        morale: 70,
        injury: null,
        teamId,
        contract: null,
    };
}

/**
 * Youth depth fills prefer the thinnest positions (below max 3 / opening min 2),
 * re-evaluated after each add so short clubs do not restack one slot.
 */
function fillPriorityPositions(roster: readonly { position: Position }[]): Position[] {
    const counts = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    for (const player of roster) {
        counts[player.position] += 1;
    }
    const belowMin = POSITIONS.filter((pos) => counts[pos] < 2).sort((a, b) => counts[a] - counts[b]);
    if (belowMin.length > 0) {
        return belowMin;
    }
    const belowMax = POSITIONS.filter((pos) => counts[pos] < 3).sort((a, b) => counts[a] - counts[b]);
    if (belowMax.length > 0) {
        return belowMax;
    }
    return POSITIONS.slice().sort((a, b) => counts[a] - counts[b]);
}

/** Journeyman free agents available on the market from day one. */
export function generateFreeAgents(rng: Rng, count: number, pools: NamePools, balance: BalanceConfig): Player[] {
    const usedNames = new Set<string>();
    const agents: Player[] = [];
    for (let i = 0; i < count; i++) {
        const gen = balance.playerGen;
        const name = generateName(rng, pools, usedNames);
        const position = rng.pick(POSITIONS);
        const attributes = generateAttributes(rng, position, 50, 9, balance);
        const heights = gen.heightRangeCm[position];
        const overall = overallRating(attributes);
        const age = rng.int(22, 33);
        agents.push({
            id: `FA-${i + 1}`,
            firstName: name.firstName,
            lastName: name.lastName,
            nationality: 'CZE',
            age,
            heightCm: rng.int(heights.min, heights.max),
            position,
            attributes,
            potential: clampAttribute(overall + (age <= 25 ? rng.int(3, 12) : rng.int(0, 3)), gen.attributeMin, gen.attributeMax),
            fatigue: 0,
            morale: 60,
            injury: null,
            teamId: null,
            contract: null,
        });
    }
    return agents;
}

function teamAvgOverall(team: Team, players: Record<string, Player>): number {
    const ratings = team.playerIds
        .map((id) => players[id])
        .filter((p): p is Player => p !== undefined)
        .map((p) => overallRating(p.attributes));
    if (ratings.length === 0) {
        return 0;
    }
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}

function bumpPlayerAttributes(player: Player, bump: number, balance: BalanceConfig): void {
    if (bump <= 0) {
        return;
    }
    const gen = balance.playerGen;
    for (const key of ATTRIBUTE_KEYS) {
        player.attributes[key] = clampAttribute(player.attributes[key] + bump, gen.attributeMin, gen.attributeMax);
    }
    player.potential = clampAttribute(Math.max(player.potential, overallRating(player.attributes)), gen.attributeMin, gen.attributeMax);
}

/** Ensure tier-5 flagship clubs sit at least `gap` overall above the next NBL club. */
function enforceFlagshipTeamGap(
    teams: Record<string, Team>,
    players: Record<string, Player>,
    league: LeagueConfig,
    balance: BalanceConfig,
    gap = 3,
): void {
    const avgs: Record<string, number> = {};
    for (const teamDef of league.teams) {
        const team = teams[teamDef.id];
        if (team) {
            avgs[teamDef.id] = teamAvgOverall(team, players);
        }
    }
    const topClubs = league.teams.filter((t) => t.tier >= 5).map((t) => t.id);
    const bumps = enforceTopClubOverallGap(avgs, topClubs, gap);
    for (const [teamId, bump] of Object.entries(bumps)) {
        const team = teams[teamId];
        if (!team) {
            continue;
        }
        for (const playerId of team.playerIds) {
            const player = players[playerId];
            if (player) {
                bumpPlayerAttributes(player, bump, balance);
            }
        }
    }
}

/** Builds the league from the real NBL rosters in the league config. */
export function generateLeague(rng: Rng, league: LeagueConfig, balance: BalanceConfig, pools: NamePools): GeneratedLeague {
    const teams: Record<string, Team> = {};
    const players: Record<string, Player> = {};
    const usedNames = new Set<string>();

    league.teams.forEach((teamDef: TeamDef, teamIndex) => {
        const teamRng = rng.fork(`team:${teamDef.id}`);
        const teamPlayers: Player[] = teamDef.roster.map((def, i) =>
            playerFromReal(teamRng.fork(`p${i}:${hashString(def.lastName)}`), `${teamDef.id}-P${i + 1}`, teamDef.id, def, league.startingSeasonYear, balance),
        );
        // Fill short rosters with youth players, covering underfilled positions first.
        // Quality scales with club tier so top clubs aren't dragged down by 44-OVR pads.
        const toFill = Math.max(0, league.playersPerTeam - teamPlayers.length);
        for (let i = 0; i < toFill; i++) {
            const fillPositions = fillPriorityPositions(teamPlayers);
            const position = fillPositions[0] ?? teamRng.pick(POSITIONS);
            teamPlayers.push(
                generateYouthPlayer(
                    teamRng,
                    `${teamDef.id}-Y${i + 1}`,
                    teamDef.id,
                    position,
                    pools,
                    usedNames,
                    balance,
                    teamDef.tier,
                ),
            );
        }
        for (const player of teamPlayers) {
            players[player.id] = player;
        }
        // AI clubs get a house defensive style; man-to-man is the league norm.
        const schemes = ['man', 'man', 'man', 'man', 'man', 'man', 'man', 'zone', 'zone', 'press'] as const;
        teams[teamDef.id] = {
            id: teamDef.id,
            playerIds: teamPlayers.map((pl) => pl.id),
            tactics: {
                starters: pickStarters(teamPlayers, preferredLineupForTeam(teamDef.id)),
                pace: 'normal',
                offenseFocus: 'balanced',
                defenseScheme: teamRng.pick(schemes),
            },
            colorSlotPrimary: 16 + teamIndex * 2,
            colorSlotSecondary: 16 + teamIndex * 2 + 1,
            aiPersonality: personalityForTeam(teamDef.id),
            aiListings: [],
        };
    });

    enforceFlagshipTeamGap(teams, players, league, balance, 2);

    return { teams, players };
}

/** Adds BCL-only clubs and players to an existing game state. */
export function generateBclClubs(
    state: { teams: Record<string, Team>; players: Record<string, Player> },
    bcl: BclConfig,
    balance: BalanceConfig,
    pools: NamePools,
    seasonYear: number,
    rng: Rng,
): void {
    const usedNames = new Set(Object.values(state.players).map((p) => `${p.firstName} ${p.lastName}`));
    let teamIndex = Object.keys(state.teams).length;
    for (const teamDef of bcl.teams) {
        if (teamDef.nblTeamId) {
            continue;
        }
        if (state.teams[teamDef.id]) {
            continue;
        }
        const teamRng = rng.fork(`bcl:${teamDef.id}`);
        const tierMeanBonus = bcl.playerTierMeanBonus;
        const teamPlayers: Player[] = teamDef.roster.map((def, i) =>
            playerFromReal(teamRng.fork(`p${i}`), `${teamDef.id}-P${i + 1}`, teamDef.id, def, seasonYear, balance, tierMeanBonus),
        );
        const toFill = Math.max(0, 12 - teamPlayers.length);
        for (let i = 0; i < toFill; i++) {
            const fillPositions = fillPriorityPositions(teamPlayers);
            const position = fillPositions[0] ?? teamRng.pick(POSITIONS);
            teamPlayers.push(
                generateYouthPlayer(teamRng, `${teamDef.id}-Y${i + 1}`, teamDef.id, position, pools, usedNames, balance),
            );
        }
        for (const player of teamPlayers) {
            player.contract = { salary: 0, yearsLeft: 99 };
            state.players[player.id] = player;
        }
        const schemes = ['man', 'man', 'zone', 'press'] as const;
        state.teams[teamDef.id] = {
            id: teamDef.id,
            playerIds: teamPlayers.map((pl) => pl.id),
            tactics: {
                starters: pickStarters(teamPlayers),
                pace: 'normal',
                offenseFocus: 'balanced',
                defenseScheme: teamRng.pick(schemes),
            },
            colorSlotPrimary: 16 + teamIndex * 2,
            colorSlotSecondary: 16 + teamIndex * 2 + 1,
            aiPersonality: personalityForTeam(teamDef.id),
            aiListings: [],
        };
        teamIndex++;
    }
}

export function bclTeamDefById(id: string, bcl: BclConfig): BclTeamDef | undefined {
    return bcl.teams.find((t) => t.id === id || t.nblTeamId === id);
}

/** Adds FIBA Europe Cup-only clubs and players to an existing game state. */
export function generateFecClubs(
    state: { teams: Record<string, Team>; players: Record<string, Player> },
    fec: FecConfig,
    balance: BalanceConfig,
    pools: NamePools,
    seasonYear: number,
    rng: Rng,
): void {
    const usedNames = new Set(Object.values(state.players).map((p) => `${p.firstName} ${p.lastName}`));
    let teamIndex = Object.keys(state.teams).length;
    for (const teamDef of fec.teams) {
        if (teamDef.nblTeamId) {
            continue;
        }
        if (state.teams[teamDef.id]) {
            continue;
        }
        const teamRng = rng.fork(`fec:${teamDef.id}`);
        const teamPlayers: Player[] = teamDef.roster.map((def, i) =>
            playerFromReal(teamRng.fork(`p${i}`), `${teamDef.id}-P${i + 1}`, teamDef.id, def, seasonYear, balance),
        );
        const toFill = Math.max(0, 12 - teamPlayers.length);
        for (let i = 0; i < toFill; i++) {
            const fillPositions = fillPriorityPositions(teamPlayers);
            const position = fillPositions[0] ?? teamRng.pick(POSITIONS);
            teamPlayers.push(
                generateYouthPlayer(teamRng, `${teamDef.id}-Y${i + 1}`, teamDef.id, position, pools, usedNames, balance),
            );
        }
        for (const player of teamPlayers) {
            player.contract = { salary: 0, yearsLeft: 99 };
            state.players[player.id] = player;
        }
        const schemes = ['man', 'man', 'zone', 'press'] as const;
        state.teams[teamDef.id] = {
            id: teamDef.id,
            playerIds: teamPlayers.map((pl) => pl.id),
            tactics: {
                starters: pickStarters(teamPlayers),
                pace: 'normal',
                offenseFocus: 'balanced',
                defenseScheme: teamRng.pick(schemes),
            },
            colorSlotPrimary: 16 + teamIndex * 2,
            colorSlotSecondary: 16 + teamIndex * 2 + 1,
            aiPersonality: personalityForTeam(teamDef.id),
            aiListings: [],
        };
        teamIndex++;
    }
}
