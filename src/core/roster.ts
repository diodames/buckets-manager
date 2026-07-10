import { marketConfig } from '../config/market';
import type { PreferredStarter } from '../config/openingLineups';
import { normalizePlayerNameKey } from '../config/rosterAdjustments';
import { isCzech } from './contracts';
import type { GameState, Player, PlayerId, Position, TeamId } from './model/types';
import { overallRating, POSITIONS } from './model/types';

/** Count non-Czech players on a team's active roster. */
export function countForeignPlayers(state: GameState, teamId: TeamId): number {
    const team = state.teams[teamId];
    if (!team) {
        return 0;
    }
    return team.playerIds.filter((id) => {
        const player = state.players[id];
        return player !== undefined && !isCzech(player);
    }).length;
}

/** True when adding this player would exceed the NBL foreign-player cap (M13). */
export function wouldExceedForeignCap(state: GameState, teamId: TeamId, player: Player): boolean {
    if (isCzech(player)) {
        return false;
    }
    const cap = marketConfig.roster.maxForeigners;
    const current = countForeignPlayers(state, teamId);
    if (player.teamId === teamId) {
        return current > cap;
    }
    return current >= cap;
}

/** Re-export for roster screens. */
export function foreignCapStatus(state: GameState, teamId: TeamId): { count: number; max: number } {
    return { count: countForeignPlayers(state, teamId), max: marketConfig.roster.maxForeigners };
}

/** Derived playing role from attribute profile (FM-style label key). */
export function playerRoleKey(player: Player): string {
    const a = player.attributes;
    const ovr = overallRating(a);
    if (player.position === 'PG') {
        if (a.passing >= a.shooting3 + 8) {
            return 'role.floorGeneral';
        }
        if (a.shooting3 >= 70) {
            return 'role.sharpshooter';
        }
        return 'role.comboGuard';
    }
    if (player.position === 'SG' || player.position === 'SF') {
        if (a.shooting3 >= 72 && a.shooting2 >= 60) {
            return 'role.threeAndD';
        }
        if (a.shooting3 >= 70) {
            return 'role.wingShooter';
        }
        if (a.defense >= 65) {
            return 'role.twoWayWing';
        }
        return 'role.wing';
    }
    if (player.position === 'PF') {
        if (a.shooting3 >= 65 && a.rebounding >= 55) {
            return 'role.stretchFour';
        }
        if (a.rebounding >= 65) {
            return 'role.powerForward';
        }
        return 'role.forward';
    }
    // C
    if (a.blocking >= 65 && a.rebounding >= 65) {
        return 'role.rimProtector';
    }
    if (a.shooting3 >= 60) {
        return 'role.stretchBig';
    }
    if (ovr >= 72) {
        return 'role.anchor';
    }
    return 'role.center';
}

/** Last N played user-team games PPG for form comparison. */
export function recentFormPpg(state: GameState, playerId: PlayerId, games = 5): number | null {
    const fixtures = [...state.fixtures]
        .filter(
            (f) =>
                f.result &&
                (f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId) &&
                f.result.box[playerId],
        )
        .sort((a, b) => b.round - a.round)
        .slice(0, games);
    if (fixtures.length === 0) {
        return null;
    }
    let pts = 0;
    for (const f of fixtures) {
        pts += f.result?.box[playerId]?.points ?? 0;
    }
    return pts / fixtures.length;
}

/** Form trend: 'hot' | 'cold' | 'steady' vs season average. */
export function formTrend(state: GameState, playerId: PlayerId, seasonPpg: number): 'hot' | 'cold' | 'steady' {
    const recent = recentFormPpg(state, playerId);
    if (recent === null || seasonPpg <= 0) {
        return 'steady';
    }
    const ratio = recent / seasonPpg;
    if (ratio >= 1.15) {
        return 'hot';
    }
    if (ratio <= 0.85) {
        return 'cold';
    }
    return 'steady';
}

function matchesPreferred(player: Player, preferred: PreferredStarter): boolean {
    const last = normalizePlayerNameKey('', preferred.lastName).trim();
    const full = normalizePlayerNameKey(player.firstName, player.lastName);
    const playerLast = normalizePlayerNameKey('', player.lastName).trim();
    const lastOk = playerLast === last || full.endsWith(` ${last}`) || full === last;
    if (!lastOk) {
        return false;
    }
    if (!preferred.firstName) {
        return true;
    }
    const first = normalizePlayerNameKey(preferred.firstName, '').trim();
    const playerFirst = normalizePlayerNameKey(player.firstName, '').trim();
    return playerFirst === first || playerFirst.startsWith(first) || first.startsWith(playerFirst);
}

function bestAvailable(players: readonly Player[], used: Set<PlayerId>, preferPos?: Position): Player | undefined {
    const pool = players.filter((p) => !used.has(p.id) && p.injury === null);
    const ranked = [...pool].sort((a, b) => {
        const posBoostA = preferPos && a.position === preferPos ? 1000 : 0;
        const posBoostB = preferPos && b.position === preferPos ? 1000 : 0;
        return posBoostB + overallRating(b.attributes) - (posBoostA + overallRating(a.attributes));
    });
    return ranked[0];
}

/**
 * Pick starters at each position. When `preferred` is provided (NBL opening
 * lineups), match those players by name first, then fill gaps by OVR.
 */
export function pickStarters(
    players: Player[],
    preferred?: Readonly<Partial<Record<Position, PreferredStarter>>>,
): Record<Position, PlayerId> {
    const starters = {} as Record<Position, PlayerId>;
    const used = new Set<PlayerId>();

    if (preferred) {
        for (const pos of POSITIONS) {
            const want = preferred[pos];
            if (!want) {
                continue;
            }
            const match = players.find(
                (p) => !used.has(p.id) && p.injury === null && matchesPreferred(p, want),
            );
            if (match) {
                starters[pos] = match.id;
                used.add(match.id);
            }
        }
    }

    for (const pos of POSITIONS) {
        if (starters[pos]) {
            continue;
        }
        const byPos = players
            .filter((p) => p.position === pos && p.injury === null && !used.has(p.id))
            .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes));
        const pick = byPos[0] ?? bestAvailable(players, used, pos);
        if (!pick) {
            throw new Error('pickStarters: not enough players');
        }
        starters[pos] = pick.id;
        used.add(pick.id);
    }
    return starters;
}

/** Refresh AI team starters after roster changes. */
export function refreshTeamStarters(state: GameState, teamId: TeamId): void {
    const team = state.teams[teamId];
    if (!team) {
        return;
    }
    const roster = team.playerIds
        .map((id) => state.players[id])
        .filter((p): p is Player => p !== undefined);
    if (roster.length < 5) {
        return;
    }
    try {
        team.tactics.starters = pickStarters(roster);
    } catch {
        // Leave starters unchanged if roster is too depleted.
    }
}
