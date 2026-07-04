import { leagueConfig, type TeamDef } from '../config/league';
import type { Fixture, Player } from '../core/model/types';
import { teamDisplayName } from '../i18n';

export function teamDef(teamId: string): TeamDef {
    const def = leagueConfig.teams.find((t) => t.id === teamId);
    if (!def) {
        throw new Error(`teamDef: unknown team '${teamId}'`);
    }
    return def;
}

export function teamName(teamId: string): string {
    return teamDisplayName(teamDef(teamId));
}

export function playerName(player: Player): string {
    return `${player.firstName} ${player.lastName}`;
}

export function shortPlayerName(player: Player): string {
    return `${player.firstName.charAt(0)}. ${player.lastName}`;
}

export function formatMoney(amount: number): string {
    const millions = amount / 1_000_000;
    if (Math.abs(millions) >= 1) {
        return `${millions.toFixed(1)}M`;
    }
    return `${Math.round(amount / 1000)}k`;
}

/** "PRG 84:79 BRN" or "PRG  -:-  BRN" for unplayed fixtures. */
export function fixtureLine(fixture: Fixture): string {
    const score = fixture.result ? `${fixture.result.homeScore}:${fixture.result.awayScore}` : '-:-';
    return `${teamDef(fixture.homeTeamId).abbr.padEnd(4)}${score.padStart(7)}  ${teamDef(fixture.awayTeamId).abbr}`;
}
