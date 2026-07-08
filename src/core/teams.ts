import { bclConfig, type BclTeamDef } from '../config/bcl';
import { leagueConfig, type TeamDef } from '../config/league';

const nblById = new Map(leagueConfig.teams.map((t) => [t.id, t]));
const bclById = new Map(bclConfig.teams.map((t) => [t.id, t]));

/** Resolve display metadata for any team id (NBL or BCL). */
export function resolveTeamDef(teamId: string): TeamDef | BclTeamDef {
    const nbl = nblById.get(teamId);
    if (nbl) {
        return nbl;
    }
    const bcl = bclById.get(teamId);
    if (bcl) {
        return bcl;
    }
    // BCL entries may reference NBL ids via nblTeamId.
    const mapped = bclConfig.teams.find((t) => t.nblTeamId === teamId);
    if (mapped) {
        const nblMapped = nblById.get(teamId);
        if (nblMapped) {
            return nblMapped;
        }
    }
    throw new Error(`resolveTeamDef: unknown team '${teamId}'`);
}

export function isNblTeam(teamId: string): boolean {
    return nblById.has(teamId);
}

export function isBclOnlyTeam(teamId: string): boolean {
    return bclById.has(teamId) && !nblById.has(teamId);
}

export function allTeamDefs(): Array<TeamDef | BclTeamDef> {
    return [...leagueConfig.teams, ...bclConfig.teams.filter((t) => !t.nblTeamId)];
}
