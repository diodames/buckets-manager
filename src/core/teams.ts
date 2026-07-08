import { bclConfig, type BclTeamDef } from '../config/bcl';
import { fecConfig } from '../config/fec';
import { leagueConfig, type TeamDef } from '../config/league';

const nblById = new Map(leagueConfig.teams.map((t) => [t.id, t]));
const bclById = new Map(bclConfig.teams.map((t) => [t.id, t]));
const fecById = new Map(fecConfig.teams.map((t) => [t.id, t]));

/** Resolve display metadata for any team id (NBL, BCL, or FEC). */
export function resolveTeamDef(teamId: string): TeamDef | BclTeamDef | import('../config/fec').FecTeamDef {
    const nbl = nblById.get(teamId);
    if (nbl) {
        return nbl;
    }
    const bcl = bclById.get(teamId);
    if (bcl) {
        return bcl;
    }
    const fec = fecById.get(teamId);
    if (fec) {
        return fec;
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

const CZECH_NBL_IDS = new Set([
    'NYM', 'PCE', 'BRN', 'UST', 'OPA', 'PIS', 'DEC', 'OST', 'OLO', 'USK', 'SLA', 'HKR',
]);

/** Resolve federation country for BCL draw rules (ISO 3166-1 alpha-3). */
export function resolveTeamCountry(teamId: string): string {
    if (CZECH_NBL_IDS.has(teamId)) {
        return 'CZE';
    }
    const bclByNbl = bclConfig.teams.find((t) => t.nblTeamId === teamId);
    if (bclByNbl) {
        return bclByNbl.country;
    }
    const bcl = bclById.get(teamId);
    if (bcl) {
        return bcl.country;
    }
    const fec = fecById.get(teamId);
    if (fec) {
        return fec.country;
    }
    return 'UNK';
}
