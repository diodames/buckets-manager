import type { BalanceConfig } from '../../config/balance';
import type { LeagueConfig, RealPlayerDef, TeamDef } from '../../config/league';
import type { NamePools } from '../../config/names';
import { generateName } from '../namegen';
import type { Attributes, Player, Position, Tactics, Team } from '../model/types';
import { ATTRIBUTE_KEYS, overallRating, POSITIONS } from '../model/types';
import { hashString, type Rng } from '../rng';

export interface GeneratedLeague {
    teams: Record<string, Team>;
    players: Record<string, Player>;
}

// Attribute mean by within-league player tier 1..5. Tier 3 is a league-average
// starter-level player.
const TIER_MEANS = [46, 52, 58, 65, 72] as const;

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

/**
 * Builds a Player from a real NBL roster entry. Attributes are derived
 * deterministically from the player's tier/position (seeded by name), so the
 * same league seed always produces the same ratings.
 */
function playerFromReal(rng: Rng, id: string, teamId: string, def: RealPlayerDef, seasonYear: number, balance: BalanceConfig): Player {
    const gen = balance.playerGen;
    const personalRng = rng.fork(`real:${def.firstName} ${def.lastName}`);
    const tier = Math.max(1, Math.min(5, Math.round(def.tier)));
    const mean = TIER_MEANS[tier - 1] as number;
    const attributes = generateAttributes(personalRng, def.position, mean, 9, balance);
    const age = def.born ? Math.max(16, seasonYear - def.born) : personalRng.int(20, 32);
    const heights = gen.heightRangeCm[def.position];
    const overall = overallRating(attributes);
    // Young players keep real headroom; veterans are near their ceiling.
    const headroom = age <= 21 ? personalRng.int(8, 22) : age <= 25 ? personalRng.int(4, 12) : personalRng.int(0, 4);
    return {
        id,
        firstName: def.firstName,
        lastName: def.lastName,
        age,
        heightCm: def.heightCm ?? personalRng.int(heights.min, heights.max),
        position: def.position,
        attributes,
        potential: clampAttribute(overall + headroom, gen.attributeMin, gen.attributeMax),
        fatigue: 0,
        morale: 70,
        injury: null,
        teamId,
        contract: null,
    };
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
): Player {
    const gen = balance.playerGen;
    const name = generateName(rng, pools, usedNames);
    const attributes = generateAttributes(rng, position, 44, 8, balance);
    const heights = gen.heightRangeCm[position];
    const overall = overallRating(attributes);
    return {
        id,
        firstName: name.firstName,
        lastName: name.lastName,
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

function pickStarters(players: readonly Player[]): Tactics['starters'] {
    const starters = {} as Tactics['starters'];
    const taken = new Set<string>();
    for (const position of POSITIONS) {
        const best = players
            .filter((p) => !taken.has(p.id))
            .sort(
                (a, b) =>
                    (b.position === position ? 1000 : 0) + overallRating(b.attributes) -
                    ((a.position === position ? 1000 : 0) + overallRating(a.attributes)),
            )[0];
        if (!best) {
            throw new Error(`pickStarters: cannot fill position ${position}`);
        }
        taken.add(best.id);
        starters[position] = best.id;
    }
    return starters;
}

function missingPositions(roster: readonly RealPlayerDef[]): Position[] {
    const covered = new Set(roster.map((r) => r.position));
    return POSITIONS.filter((pos) => !covered.has(pos));
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
        // Fill short rosters with youth players, covering missing positions first.
        const toFill = Math.max(0, league.playersPerTeam - teamPlayers.length);
        const fillPositions = [...missingPositions(teamDef.roster)];
        for (let i = 0; i < toFill; i++) {
            const position = fillPositions.shift() ?? teamRng.pick(POSITIONS);
            teamPlayers.push(
                generateYouthPlayer(teamRng, `${teamDef.id}-Y${i + 1}`, teamDef.id, position, pools, usedNames, balance),
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
                starters: pickStarters(teamPlayers),
                pace: 'normal',
                offenseFocus: 'balanced',
                defenseScheme: teamRng.pick(schemes),
            },
            colorSlotPrimary: 16 + teamIndex * 2,
            colorSlotSecondary: 16 + teamIndex * 2 + 1,
        };
    });

    return { teams, players };
}
