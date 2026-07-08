import { bclConfig } from '../config/bcl';
import { fecConfig } from '../config/fec';
import { leagueConfig, type TeamDef } from '../config/league';
import type { Fixture, Player } from '../core/model/types';
import { resolveTeamDef } from '../core/teams';
import { teamDisplayName, t } from '../i18n';

export function teamDef(teamId: string): TeamDef {
    return resolveTeamDef(teamId) as TeamDef;
}

export function teamName(teamId: string): string {
    try {
        return teamDisplayName(resolveTeamDef(teamId));
    } catch {
        const bcl = bclConfig.teams.find((t) => t.id === teamId || t.nblTeamId === teamId);
        const fec = fecConfig.teams.find((t) => t.id === teamId || t.nblTeamId === teamId);
        return bcl?.shortName ?? fec?.shortName ?? teamId;
    }
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

/** Human-readable sponsor ambition target from promised max NBL rank. */
export function sponsorTargetLabel(promisedMaxRank: number): string {
    if (promisedMaxRank <= 1) {
        return t('sponsor.targetChampion');
    }
    if (promisedMaxRank === leagueConfig.playoffs.teams) {
        return t('sponsor.targetPlayoffs');
    }
    return t('sponsor.targetTopN', { n: promisedMaxRank });
}

/** "PRG 84:79 BRN" or "PRG  -:-  BRN" for unplayed fixtures. */
export function fixtureLine(fixture: Fixture): string {
    const score = fixture.result ? `${fixture.result.homeScore}:${fixture.result.awayScore}` : '-:-';
    let homeAbbr: string;
    let awayAbbr: string;
    try {
        homeAbbr = teamDef(fixture.homeTeamId).abbr;
        awayAbbr = teamDef(fixture.awayTeamId).abbr;
    } catch {
        homeAbbr = fixture.homeTeamId.slice(0, 4);
        awayAbbr = fixture.awayTeamId.slice(0, 4);
    }
    return `${homeAbbr.padEnd(4)}${score.padStart(7)}  ${awayAbbr}`;
}

export function competitionLabel(competitionId?: string): string {
    if (competitionId === 'bcl') {
        return 'BCL';
    }
    if (competitionId === 'fec') {
        return 'FEC';
    }
    return 'NBL';
}
