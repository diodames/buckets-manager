import type { ExternalOffersConfig } from '../config/externalOffers';
import type { MarketConfig } from '../config/market';
import { stageMovement, type StagedMovement } from './offseasonMovements';
import { aggregatePlayerSeasonStats, allSeasonFixtures, breakthroughRatio } from './playerStats';
import type { GameState, Player, PlayerId, TeamId } from './model/types';
import { overallRating, POSITIONS } from './model/types';
import type { Rng } from './rng';
import { isCzech } from './contracts';

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function isYouthProspect(state: GameState, playerId: PlayerId): boolean {
    return state.market.youthProspects.some((p) => p.player.id === playerId);
}

function isStarter(state: GameState, player: Player): boolean {
    const team = player.teamId ? state.teams[player.teamId] : null;
    return team ? Object.values(team.tactics.starters).includes(player.id) : false;
}

function teamGamesPlayed(state: GameState, teamId: TeamId): number {
    let count = 0;
    for (const fixture of allSeasonFixtures(state)) {
        if (!fixture.result) {
            continue;
        }
        if (fixture.homeTeamId === teamId || fixture.awayTeamId === teamId) {
            count++;
        }
    }
    return count;
}

function blockedDepthCount(state: GameState, player: Player): number {
    if (!player.teamId) {
        return 0;
    }
    const team = state.teams[player.teamId];
    if (!team) {
        return 0;
    }
    const overall = overallRating(player.attributes);
    let blocked = 0;
    for (const id of team.playerIds) {
        if (id === player.id) {
            continue;
        }
        const teammate = state.players[id];
        if (!teammate || teammate.position !== player.position) {
            continue;
        }
        if (overallRating(teammate.attributes) >= overall - 3 && teammate.age <= player.age - 2) {
            blocked++;
        }
    }
    return blocked;
}

function performanceShield(
    state: GameState,
    player: Player,
    market: MarketConfig,
    externalOffers: ExternalOffersConfig,
): number {
    const cfg = market.retirement;
    let shield = 0;
    if (player.teamId && isStarter(state, player)) {
        shield += 0.12;
    }
    const stats = aggregatePlayerSeasonStats(state, player.id);
    const overall = overallRating(player.attributes);
    const ratio = stats.games >= externalOffers.minGames
        ? breakthroughRatio(stats.gameScore, overall, externalOffers)
        : 0;
    if (ratio >= 1.0) {
        shield += 0.1;
    }
    if (player.teamId) {
        const teamGames = teamGamesPlayed(state, player.teamId);
        if (teamGames > 0 && stats.games / teamGames >= cfg.starterShareProtection) {
            shield += 0.08;
        }
    }
    return shield;
}

function gamesShare(state: GameState, player: Player): number {
    if (!player.teamId) {
        return 0;
    }
    const teamGames = teamGamesPlayed(state, player.teamId);
    if (teamGames <= 0) {
        return 0;
    }
    return aggregatePlayerSeasonStats(state, player.id).games / teamGames;
}

/** Probability a player retires this offseason (0..0.95). */
export function careerRetireScore(
    state: GameState,
    player: Player,
    market: MarketConfig,
    externalOffers: ExternalOffersConfig,
): number {
    const cfg = market.retirement;
    const shield = performanceShield(state, player, market, externalOffers);

    if (player.age >= cfg.mandatoryAge) {
        if (shield >= 0.2) {
            return clamp(0.55 - shield * 0.5, 0.35, 0.55);
        }
        return 0.95;
    }

    if (player.age < cfg.minutesCheckMinAge && player.teamId !== null) {
        return 0;
    }

    let score = 0;

    if (player.teamId === null) {
        if (player.age >= cfg.faRetireMinAge) {
            score += cfg.baseRetireChance + Math.max(0, player.age - cfg.faRetireMinAge) * cfg.chancePerYearOver;
        }
    } else {
        if (player.age >= cfg.voluntaryMinAge) {
            score += cfg.baseRetireChance + (player.age - cfg.voluntaryMinAge) * cfg.chancePerYearOver;
            if (isCzech(player) && isStarter(state, player)) {
                score -= 0.05;
            }
        }

        if (player.age >= cfg.minutesCheckMinAge) {
            const stats = aggregatePlayerSeasonStats(state, player.id);
            const share = gamesShare(state, player);
            const starter = isStarter(state, player);
            if (stats.games >= cfg.minGamesForShare) {
                if (!starter && share < cfg.lowGamesShare) {
                    score += 0.15;
                }
                if (starter && share >= cfg.starterShareProtection) {
                    score -= 0.2;
                }
            }
            if (blockedDepthCount(state, player) >= cfg.blockedDepthCount) {
                score += 0.12;
            }
        }
    }

    score -= shield;

    if (player.morale <= 35) {
        score += cfg.moraleRetireBoost;
    }

    return clamp(score, 0, 0.95);
}

/** Removes a retired player from the world (not FA, not abroad). */
export function retirePlayer(state: GameState, player: Player, market: MarketConfig): void {
    const cfg = market.retirement;
    const userTeam = state.teams[state.userTeamId];
    const wasUserStarter = Boolean(
        userTeam
        && player.teamId === state.userTeamId
        && Object.values(userTeam.tactics.starters).includes(player.id),
    );

    state.market.youthProspects = state.market.youthProspects.filter((p) => p.player.id !== player.id);

    const team = player.teamId ? state.teams[player.teamId] : null;
    if (team) {
        team.playerIds = team.playerIds.filter((id) => id !== player.id);
        for (const position of POSITIONS) {
            if (team.tactics.starters[position] === player.id) {
                const replacement = team.playerIds
                    .map((id) => state.players[id])
                    .filter((p): p is Player => p !== undefined)
                    .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes))[0];
                if (replacement) {
                    team.tactics.starters[position] = replacement.id;
                }
            }
        }
    }

    state.market.listings = state.market.listings.filter((l) => l.playerId !== player.id);
    state.market.incomingOffers = state.market.incomingOffers.filter((o) => o.playerId !== player.id);
    state.market.negotiations = state.market.negotiations.filter((n) => n.playerId !== player.id);
    delete state.players[player.id];

    if (wasUserStarter && userTeam) {
        state.club.fanSupport = Math.max(0, state.club.fanSupport - cfg.fanSupportPenalty);
        for (const id of userTeam.playerIds) {
            const teammate = state.players[id];
            if (teammate) {
                teammate.morale = Math.max(0, teammate.morale - cfg.teammateMoralePenalty);
            }
        }
    }
}

export interface RetirementResult {
    playersRetired: number;
    userRetirements: string[];
    staged: StagedMovement[];
}

/** Offseason career endings driven by age and playing-time outlook. */
export function evaluateCareerRetirements(
    state: GameState,
    market: MarketConfig,
    externalOffers: ExternalOffersConfig,
    rng: Rng,
): RetirementResult {
    const cfg = market.retirement;
    const userRetirements: string[] = [];
    const stagedMovements: StagedMovement[] = [];
    const toRetire: Player[] = [];

    for (const player of Object.values(state.players)) {
        if (isYouthProspect(state, player.id)) {
            continue;
        }
        if (player.teamId === null) {
            if (player.age < cfg.faRetireMinAge || state.market.signingHints[player.id]) {
                continue;
            }
        }

        const score = careerRetireScore(state, player, market, externalOffers);
        if (score <= 0) {
            continue;
        }
        if (player.age >= cfg.mandatoryAge && score >= 0.9) {
            toRetire.push(player);
            continue;
        }
        if (rng.chance(score)) {
            toRetire.push(player);
        }
    }

    for (const player of toRetire) {
        const onUser = player.teamId === state.userTeamId;
        stagedMovements.push(stageMovement(state, player, 'retired'));
        retirePlayer(state, player, market);
        if (onUser && userRetirements.length < 3) {
            userRetirements.push(`${player.firstName} ${player.lastName} (${player.age})`);
        }
    }

    return {
        playersRetired: toRetire.length,
        userRetirements,
        staged: stagedMovements,
    };
}
