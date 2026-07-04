import type { AppContext } from '../app/Screen';
import { leagueConfig } from '../config/league';
import { seasonRounds } from '../core/game';
import { t, teamDisplayName } from '../i18n';
import { formatMoney } from './format';
import { ROLE } from './theme';
import type { TextGrid } from './text';

/**
 * Shared screen chrome: title bar on top (screen title left, season/round and
 * user team right) and a hint bar at the bottom.
 */
export function drawChrome(ctx: AppContext, title: string, hints: string[]): void {
    const grid: TextGrid = ctx.grid;
    grid.fillCells(0, 0, grid.cols, 1, ROLE.panel);
    grid.put(1, 0, ROLE.header, title);

    const session = ctx.session;
    if (session) {
        const teamDef = leagueConfig.teams.find((td) => td.id === session.state.userTeamId);
        const rounds = seasonRounds(session.state, ctx.config);
        const right = [
            teamDef ? teamDisplayName(teamDef) : session.state.userTeamId,
            t('common.season', { year: session.state.seasonYear }),
            t('common.round', { round: Math.min(session.state.currentRound, rounds) }),
            formatMoney(session.state.club.budget),
            t('chrome.fans', { n: Math.round(session.state.club.fanSupport) }),
        ].join('  ');
        grid.putRight(grid.cols - 1, 0, ROLE.text, right);
    }

    grid.fillCells(0, grid.rows - 1, grid.cols, 1, ROLE.panel);
    grid.put(1, grid.rows - 1, ROLE.textDim, hints.join('   '));
}
