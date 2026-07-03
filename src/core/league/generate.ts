import type { BalanceConfig } from '../../config/balance';
import type { LeagueConfig } from '../../config/league';
import type { NamePools } from '../../config/names';
import { generateName } from '../namegen';
import type { Attributes, Player, Position, Tactics, Team } from '../model/types';
import { ATTRIBUTE_KEYS, overallRating, POSITIONS } from '../model/types';
import type { Rng } from '../rng';

export interface GeneratedLeague {
    teams: Record<string, Team>;
    players: Record<string, Player>;
}

function clampAttribute(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)));
}

function generateAttributes(rng: Rng, position: Position, balance: BalanceConfig): Attributes {
    const gen = balance.playerGen;
    const bias = gen.positionBias[position] as Partial<Record<keyof Attributes, number>>;
    const attributes = {} as Attributes;
    for (const key of ATTRIBUTE_KEYS) {
        // Sum of two uniforms approximates a triangular distribution around the mean.
        const noise = (rng.next() + rng.next() - 1) * gen.attributeSpread;
        const value = gen.attributeMean + noise + (bias[key] ?? 0);
        attributes[key] = clampAttribute(value, gen.attributeMin, gen.attributeMax);
    }
    return attributes;
}

function generatePlayer(
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
    const attributes = generateAttributes(rng, position, balance);
    const heights = gen.heightRangeCm[position];
    const overall = overallRating(attributes);
    return {
        id,
        firstName: name.firstName,
        lastName: name.lastName,
        age: rng.int(gen.ageMin, gen.ageMax),
        heightCm: rng.int(heights.min, heights.max),
        position,
        attributes,
        potential: clampAttribute(overall + rng.int(0, 20), gen.attributeMin, gen.attributeMax),
        fatigue: 0,
        morale: 70,
        teamId,
    };
}

function pickStarters(players: readonly Player[]): Tactics['starters'] {
    const starters = {} as Tactics['starters'];
    for (const position of POSITIONS) {
        const candidates = players
            .filter((p) => p.position === position)
            .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes));
        const best = candidates[0];
        if (!best) {
            throw new Error(`pickStarters: no player generated for position ${position}`);
        }
        starters[position] = best.id;
    }
    return starters;
}

/**
 * Builds the full league: every configured team gets `playersPerTeam` players
 * with all five positions covered (two full five-man units, remaining slots
 * random), plus a default tactics setup.
 */
export function generateLeague(rng: Rng, league: LeagueConfig, balance: BalanceConfig, pools: NamePools): GeneratedLeague {
    const teams: Record<string, Team> = {};
    const players: Record<string, Player> = {};
    const usedNames = new Set<string>();

    league.teams.forEach((teamDef, teamIndex) => {
        const teamRng = rng.fork(`team:${teamDef.id}`);
        const positions: Position[] = [];
        for (let i = 0; i < league.playersPerTeam; i++) {
            // First two rounds of five cover each position twice.
            const position = i < 10 ? (POSITIONS[i % 5] as Position) : teamRng.pick(POSITIONS);
            positions.push(position);
        }
        const teamPlayers: Player[] = positions.map((position, i) =>
            generatePlayer(teamRng, `${teamDef.id}-P${i + 1}`, teamDef.id, position, pools, usedNames, balance),
        );
        for (const player of teamPlayers) {
            players[player.id] = player;
        }
        teams[teamDef.id] = {
            id: teamDef.id,
            playerIds: teamPlayers.map((p) => p.id),
            tactics: {
                starters: pickStarters(teamPlayers),
                pace: 'normal',
                offenseFocus: 'balanced',
            },
            colorSlotPrimary: 16 + teamIndex * 2,
            colorSlotSecondary: 16 + teamIndex * 2 + 1,
        };
    });

    return { teams, players };
}
