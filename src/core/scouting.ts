import type { EconomyConfig } from '../config/economy';
import type { SeasonSigningDef } from '../config/seasonSignings';
import { seasonMarketForYear } from '../config/seasonSignings';
import type { GameConfig } from './game';
import { userTeamTier, aiCanSignFreeAgent } from './economy';
import { baseSalary } from './market';
import { aiSigningBoost } from './seasonMarket';
import type { FreeAgentScoutReport, GameState, Player, PlayerId } from './model/types';
import { overallRating } from './model/types';
import type { Rng } from './rng';

function openingFreeAgentIds(state: GameState): PlayerId[] {
    const marketCfg = seasonMarketForYear(state.seasonYear);
    const ids: PlayerId[] = [];
    for (const player of Object.values(state.players)) {
        if (player.teamId !== null || player.contract !== null) {
            continue;
        }
        if (state.market.pendingFreeAgents.some((p) => p.player.id === player.id)) {
            continue;
        }
        if (player.id.startsWith('FA-')) {
            ids.push(player.id);
            continue;
        }
        if (player.id.startsWith('SM-')) {
            if (!marketCfg) {
                ids.push(player.id);
                continue;
            }
            const timed = marketCfg.timedSignings.find((s) =>
                signingPlayerId(state.seasonYear, s) === player.id && s.availableFromRound > 1);
            if (!timed) {
                ids.push(player.id);
            }
        }
    }
    return ids.sort((a, b) => {
        const pa = state.players[a];
        const pb = state.players[b];
        return (pa?.lastName ?? '').localeCompare(pb?.lastName ?? '');
    });
}

function signingPlayerId(seasonYear: number, def: SeasonSigningDef): string {
    const slug = `${def.lastName}-${def.firstName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `SM-${seasonYear}-${slug}`;
}

function scoutDefForPlayer(state: GameState, playerId: PlayerId): SeasonSigningDef | null {
    const marketCfg = seasonMarketForYear(state.seasonYear);
    if (!marketCfg || !playerId.startsWith('SM-')) {
        return null;
    }
    const all = [...marketCfg.openingFreeAgents, ...marketCfg.timedSignings.filter((s) => s.availableFromRound <= 1)];
    return all.find((s) => signingPlayerId(state.seasonYear, s) === playerId) ?? null;
}

function overallToStars(overall: number): number {
    if (overall >= 82) {
        return 5;
    }
    if (overall >= 76) {
        return 4;
    }
    if (overall >= 70) {
        return 3;
    }
    if (overall >= 64) {
        return 2.5;
    }
    return 2;
}

function buildScoutBand(player: Player, def: SeasonSigningDef | null, rng: Rng): Pick<
    FreeAgentScoutReport,
    'overallMin' | 'overallMax' | 'starMin' | 'starMax'
> {
    const ovr = overallRating(player.attributes);
    let spread = def?.scoutTier === 'headline' ? 3 : def?.scoutTier === 'veteran' ? 5 : 8;
    spread += rng.int(0, 2);
    const min = Math.max(50, ovr - spread);
    const max = Math.min(99, ovr + spread);
    const star = overallToStars(ovr);
    return {
        overallMin: min,
        overallMax: max,
        starMin: Math.max(1, star - 0.5),
        starMax: Math.min(5, star + 0.5),
    };
}

export function scoutingBudgetTotal(state: GameState, economy: EconomyConfig): number {
    const tier = userTeamTier(state);
    const base = economy.scouting.baseBudgetByTier[tier - 1] ?? economy.scouting.baseBudgetByTier[2]!;
    let bonus = 0;
    if (state.bclQualified) {
        bonus += economy.scouting.bclBonus;
    } else if (state.fecQualified) {
        bonus += economy.scouting.fecBonus;
    }
    const discount = (state.club.facilities.academy - 1) * economy.scouting.academyDiscountPerLevel;
    return Math.max(100_000, base + bonus - discount);
}

/** Seed scout reports for opening free agents at offseason rollover. */
export function initializeScouting(state: GameState, config: GameConfig, rng: Rng): void {
    state.market.scoutingComplete = false;
    state.market.scoutedFreeAgents = {};
    state.market.scoutingBudgetTotal = scoutingBudgetTotal(state, config.economy);
    state.market.scoutingBudget = state.market.scoutingBudgetTotal;

    for (const playerId of openingFreeAgentIds(state)) {
        const player = state.players[playerId];
        if (!player) {
            continue;
        }
        const def = scoutDefForPlayer(state, playerId);
        const band = buildScoutBand(player, def, rng.fork(`scout-init:${playerId}`));
        state.market.scoutedFreeAgents[playerId] = {
            playerId,
            ...band,
            revealed: false,
            tier: 'rumour',
            ...(state.market.signingHints[playerId]
                ? { linkedTeamId: state.market.signingHints[playerId] }
                : {}),
        };
    }
}

export function scoutedPlayerIds(state: GameState): PlayerId[] {
    return Object.keys(state.market.scoutedFreeAgents);
}

export function canScoutPlayer(state: GameState, playerId: PlayerId): boolean {
    return state.market.scoutedFreeAgents[playerId] !== undefined;
}

export function requestQuickReport(
    state: GameState,
    playerId: PlayerId,
    economy: EconomyConfig,
): boolean {
    const report = state.market.scoutedFreeAgents[playerId];
    if (!report || report.tier !== 'rumour') {
        return false;
    }
    if (state.market.scoutingBudget < economy.scouting.quickReportCost) {
        return false;
    }
    const player = state.players[playerId];
    if (!player) {
        return false;
    }
    state.market.scoutingBudget -= economy.scouting.quickReportCost;
    const ovr = overallRating(player.attributes);
    report.overallMin = Math.max(50, ovr - 4);
    report.overallMax = Math.min(99, ovr + 4);
    report.tier = 'quick';
    return true;
}

export function requestDeepReport(
    state: GameState,
    playerId: PlayerId,
    economy: EconomyConfig,
): boolean {
    const report = state.market.scoutedFreeAgents[playerId];
    if (!report || report.tier === 'deep') {
        return false;
    }
    if (report.tier === 'rumour' && state.market.scoutingBudget < economy.scouting.quickReportCost + economy.scouting.deepReportCost) {
        return false;
    }
    if (state.market.scoutingBudget < economy.scouting.deepReportCost) {
        return false;
    }
    const player = state.players[playerId];
    if (!player) {
        return false;
    }
    if (report.tier === 'rumour') {
        state.market.scoutingBudget -= economy.scouting.quickReportCost;
    }
    state.market.scoutingBudget -= economy.scouting.deepReportCost;
    const ovr = overallRating(player.attributes);
    report.overallMin = Math.max(50, ovr - 1);
    report.overallMax = Math.min(99, ovr + 1);
    report.revealed = true;
    report.tier = 'deep';
    return true;
}

export function completeScoutingPhase(state: GameState): void {
    state.market.scoutingComplete = true;
}

/** AI clubs sign 0-2 opening free agents during scouting weeks. */
export function runScoutingAiSignings(state: GameState, config: GameConfig, rng: Rng): number {
    let signed = 0;
    const candidates = openingFreeAgentIds(state)
        .map((id) => state.players[id])
        .filter((p): p is Player => p !== undefined)
        .sort((a, b) => {
            const boostA = Math.max(
                ...config.league.teams.map((t) => aiSigningBoost(state, a.id, t.id)),
            );
            const boostB = Math.max(
                ...config.league.teams.map((t) => aiSigningBoost(state, b.id, t.id)),
            );
            return overallRating(b.attributes) + boostB - (overallRating(a.attributes) + boostA);
        });

    for (const teamDef of config.league.teams) {
        if (teamDef.id === state.userTeamId) {
            continue;
        }
        if (!rng.chance(0.35)) {
            continue;
        }
        const team = state.teams[teamDef.id];
        if (!team || team.playerIds.length >= config.market.roster.maxPlayers) {
            continue;
        }
        for (const player of candidates) {
            if (player.teamId !== null) {
                continue;
            }
            const salary = baseSalary(overallRating(player.attributes), config.economy);
            if (!aiCanSignFreeAgent(state, teamDef.id, salary, config.economy, config.league)) {
                continue;
            }
            const hint = state.market.signingHints[player.id];
            if (hint && hint !== teamDef.id && !rng.chance(0.4)) {
                continue;
            }
            player.teamId = teamDef.id;
            player.contract = { salary, yearsLeft: rng.int(1, 2) };
            team.playerIds.push(player.id);
            delete state.market.scoutedFreeAgents[player.id];
            signed++;
            break;
        }
        if (signed >= 2) {
            break;
        }
    }
    return signed;
}

export function displayedOverall(state: GameState, player: Player): number {
    const report = state.market.scoutedFreeAgents[player.id];
    if (!report || report.revealed) {
        return overallRating(player.attributes);
    }
    return Math.round((report.overallMin + report.overallMax) / 2);
}

export function canNegotiateScoutedFreeAgent(state: GameState, playerId: PlayerId): boolean {
    if (state.market.scoutingComplete) {
        return true;
    }
    const report = state.market.scoutedFreeAgents[playerId];
    return report !== undefined && report.tier !== 'rumour';
}
