import type {
    GameState,
    OffseasonMovementKind,
    OffseasonMovementReason,
    OffseasonPlayerMovement,
    Player,
} from './model/types';
import { overallRating } from './model/types';
import { resolveTeamDef } from './teams';

function formerTeamLabel(teamId: string | null): string {
    if (!teamId) {
        return 'Free agent';
    }
    try {
        const def = resolveTeamDef(teamId);
        if ('shortName' in def && typeof def.shortName === 'string') {
            return def.shortName;
        }
        return def.abbr;
    } catch {
        return teamId;
    }
}

/** Snapshot a player movement before they are released, retired, or deleted. */
export function buildMovementEntry(
    state: GameState,
    player: Player,
    kind: OffseasonMovementKind,
    reason?: OffseasonMovementReason,
): OffseasonPlayerMovement {
    const entry: OffseasonPlayerMovement = {
        kind,
        name: `${player.firstName} ${player.lastName}`,
        age: player.age,
        position: player.position,
        formerTeamId: player.teamId,
        formerTeamName: formerTeamLabel(player.teamId),
        isUserPlayer: player.teamId === state.userTeamId,
    };
    if (reason !== undefined) {
        entry.reason = reason;
    }
    return entry;
}

export interface StagedMovement {
    entry: OffseasonPlayerMovement;
    overall: number;
}

/** User players first, then by overall rating descending. */
export function sortMovements(entries: StagedMovement[]): OffseasonPlayerMovement[] {
    return [...entries]
        .sort((a, b) => {
            if (a.entry.isUserPlayer !== b.entry.isUserPlayer) {
                return a.entry.isUserPlayer ? -1 : 1;
            }
            return b.overall - a.overall;
        })
        .map((staged) => staged.entry);
}

export function stageMovement(
    state: GameState,
    player: Player,
    kind: OffseasonMovementKind,
    reason?: OffseasonMovementReason,
): StagedMovement {
    return {
        entry: buildMovementEntry(state, player, kind, reason),
        overall: overallRating(player.attributes),
    };
}
