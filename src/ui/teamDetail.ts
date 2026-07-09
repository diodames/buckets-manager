import type { GameConfig } from '../core/game';
import {
    aiTeamFinance,
    arenaCapacity,
    interpolateFacilityValue,
    realArenaCapacity,
    startingBudgetForTeam,
} from '../core/economy';
import type { Player, GameState } from '../core/model/types';
import { overallRating, POSITIONS } from '../core/model/types';
import { foreignCapStatus } from '../core/roster';
import { isNblTeam, resolveTeamCountry, resolveTeamDef } from '../core/teams';
import { t, teamArenaName, teamCityName, teamDisplayName } from '../i18n';
import { drawTeamCrest } from './crests';
import { formatMoney, shortPlayerName } from './format';
import { ROLE } from './theme';
import { padLeft, padRight, type TextGrid } from './text';

export const TEAM_DETAIL_NAME_WIDTH = 18;
export const TEAM_DETAIL_POS_WIDTH = 3;
export const TEAM_DETAIL_OVR_WIDTH = 3;
export const TEAM_DETAIL_PANEL_WIDTH = 38;

export interface TeamDetailLayout {
    col: number;
    row: number;
    crestCol?: number;
    crestRow?: number;
}

export interface TeamDetailOptions {
    budget: number | null;
    arenaSeats: number;
    recordLine?: string | null;
    foreignCapLine?: string | null;
    tierLine?: string | null;
}

/** Sort roster by position, then overall rating descending. */
export function sortTeamPlayers(players: Player[]): Player[] {
    const posOrder = Object.fromEntries(POSITIONS.map((pos, index) => [pos, index]));
    return [...players].sort((a, b) => {
        const posDiff = (posOrder[a.position] ?? 99) - (posOrder[b.position] ?? 99);
        if (posDiff !== 0) {
            return posDiff;
        }
        return overallRating(b.attributes) - overallRating(a.attributes);
    });
}

/** Live roster for a team from game state. */
export function playersForTeam(state: GameState, teamId: string): Player[] {
    const team = state.teams[teamId];
    if (!team) {
        return [];
    }
    return sortTeamPlayers(
        team.playerIds
            .map((id) => state.players[id])
            .filter((p): p is Player => p !== undefined),
    );
}

/** Current budget for an NBL club; null for non-NBL teams without finances. */
export function teamBudget(state: GameState | null, teamId: string, config: GameConfig): number | null {
    if (!state) {
        const teamDef = config.league.teams.find((t) => t.id === teamId);
        return teamDef ? startingBudgetForTeam(teamDef, config.economy) : null;
    }
    if (teamId === state.userTeamId) {
        return state.club.budget;
    }
    const finance = aiTeamFinance(state, teamId);
    if (finance) {
        return finance.budget;
    }
    if (isNblTeam(teamId)) {
        const teamDef = config.league.teams.find((t) => t.id === teamId);
        return teamDef ? startingBudgetForTeam(teamDef, config.economy) : null;
    }
    return null;
}

/** Effective arena seats for display (user facilities or AI NBL upgrades). */
export function teamArenaSeats(teamId: string, state: GameState | null, config: GameConfig): number {
    const real = realArenaCapacity(config.league, teamId);
    if (state && teamId === state.userTeamId) {
        return arenaCapacity(state, config.economy, real);
    }
    if (state) {
        const finance = aiTeamFinance(state, teamId);
        if (finance?.facilities) {
            const level = finance.facilities.arena ?? 1;
            if (real) {
                const scale = interpolateFacilityValue(config.economy.facilities.arenaCapacityScale, level);
                return Math.round(real * scale);
            }
            return Math.round(interpolateFacilityValue(config.economy.facilities.arenaCapacityByLevel, level));
        }
    }
    if (real) {
        return real;
    }
    return config.economy.facilities.arenaCapacityByLevel[0] ?? 1500;
}

/** Draw team crest, header, stats, and roster table. */
export function renderTeamDetailPanel(
    grid: TextGrid,
    layout: TeamDetailLayout,
    teamId: string,
    players: Player[],
    options: TeamDetailOptions,
): void {
    const teamDef = resolveTeamDef(teamId);
    const { col, row } = layout;
    let line = row;

    if (layout.crestCol !== undefined && layout.crestRow !== undefined) {
        drawTeamCrest(grid, teamId, layout.crestCol, layout.crestRow);
    }

    grid.put(col, line, ROLE.header, `${teamDisplayName(teamDef)} - ${teamCityName(teamDef)}`);
    line++;
    grid.put(col, line, ROLE.text, t('teamSelect.arena', { name: teamArenaName(teamDef), n: options.arenaSeats }));
    line++;

    if (options.recordLine) {
        grid.put(col, line, ROLE.text, options.recordLine);
        line++;
    }

    if (options.budget !== null) {
        grid.put(col, line, ROLE.accent, t('teamSelect.budget', { amount: formatMoney(options.budget) }));
        line++;
    } else if (options.tierLine) {
        grid.put(col, line, ROLE.accent, options.tierLine);
        line++;
    }

    if (options.foreignCapLine) {
        grid.put(col, line, ROLE.text, options.foreignCapLine);
        line++;
    }

    grid.put(col, line, ROLE.textDim, '-'.repeat(TEAM_DETAIL_PANEL_WIDTH - 2));
    line++;
    grid.put(col, line, ROLE.header, t('teamSelect.roster'));
    line++;
    grid.put(
        col,
        line,
        ROLE.textDim,
        `${padRight(t('col.name'), TEAM_DETAIL_NAME_WIDTH)} ${padRight(t('col.pos'), TEAM_DETAIL_POS_WIDTH)} ${padLeft(t('col.ovr'), TEAM_DETAIL_OVR_WIDTH)}`,
    );
    line++;

    for (let i = 0; i < players.length; i++) {
        const player = players[i] as Player;
        const playerLine = `${padRight(shortPlayerName(player), TEAM_DETAIL_NAME_WIDTH)} ${padRight(player.position, TEAM_DETAIL_POS_WIDTH)} ${padLeft(String(overallRating(player.attributes)), TEAM_DETAIL_OVR_WIDTH)}`;
        grid.put(col, line + i, ROLE.text, playerLine);
    }
}

/** Foreign-player cap line for NBL clubs. */
export function foreignCapLine(state: GameState, teamId: string): string {
    const cap = foreignCapStatus(state, teamId);
    return t('teamDetail.foreigners', { count: cap.count, max: cap.max });
}

/** Tier and country line for European-only clubs. */
export function europeanClubLine(teamId: string): string {
    const teamDef = resolveTeamDef(teamId);
    const tier = 'tier' in teamDef ? teamDef.tier : 3;
    const country = resolveTeamCountry(teamId);
    return t('teamDetail.clubInfo', { tier, country });
}
