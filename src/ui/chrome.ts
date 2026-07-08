import type { AppContext } from '../app/Screen';
import { leagueConfig } from '../config/league';
import { financeWarningTier, projectSeasonCashflow } from '../core/cashflow';
import { seasonRounds } from '../core/game';
import type { GameState } from '../core/model/types';
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
        const warning = financeWarningTier(session.state, ctx.config.economy, ctx.config.league);
        const budgetRole = warning === 'red' ? ROLE.danger : warning === 'yellow' ? ROLE.warning : ROLE.text;
        const rightParts = [
            teamDef ? teamDisplayName(teamDef) : session.state.userTeamId,
            t('common.season', { year: session.state.seasonYear }),
            t('common.round', { round: Math.min(session.state.currentRound, rounds) }),
            formatMoney(session.state.club.budget),
            t('chrome.fans', { n: Math.round(session.state.club.fanSupport) }),
        ];
        if (warning === 'yellow') {
            rightParts.push(t('chrome.warningYellow'));
        } else if (warning === 'red') {
            rightParts.push(t('chrome.warningRed'));
        }
        grid.putRight(grid.cols - 1, 0, budgetRole, rightParts.join('  '));
    }

    drawChromeFooter(grid, hints);
}

/** Bottom hint bar; call again after screen content so the footer stays visible. */
export function drawChromeFooter(grid: TextGrid, hints: string[]): void {
    grid.fillCells(0, grid.rows - 1, grid.cols, 1, ROLE.panel);
    grid.put(1, grid.rows - 1, ROLE.textDim, hints.join('   '));
}

/** Finance warning line for dashboard and finances screens. */
export function financeWarningMessage(state: GameState, ctx: AppContext): string | null {
    const tier = financeWarningTier(state, ctx.config.economy, ctx.config.league);
    if (tier === 'red') {
        return t('finance.warningRed');
    }
    if (tier === 'yellow') {
        return t('finance.warningYellow');
    }
    return null;
}

/** Projected cashflow snapshot for UI panels. */
export function financeProjection(ctx: AppContext) {
    const session = ctx.session;
    if (!session) {
        return null;
    }
    return projectSeasonCashflow(session.state, ctx.config.economy, ctx.config.league);
}
