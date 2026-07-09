import type { ExternalOffersConfig } from '../config/externalOffers';
import { leagueConfig } from '../config/league';
import type { MarketConfig } from '../config/market';
import { CZECH_NBL_IDS } from './bcl/index';
import { computeNblStandings } from './league/standings';
import { stageMovement, type StagedMovement } from './offseasonMovements';
import {
    breakthroughRatio,
    aggregatePlayerSeasonStats,
} from './playerStats';
import type { GameState, Player, PlayerId, TeamId } from './model/types';
import { overallRating, POSITIONS } from './model/types';
import type { Rng } from './rng';

export type BclPrestigeTier = 'active' | 'confirmed' | 'projected' | 'none';

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function isCzech(player: Player): boolean {
    return player.nationality === 'CZE';
}

/** 1-based NBL finish rank; falls back to inverse team tier in season 1. */
export function teamTableRank(state: GameState, teamId: TeamId): number {
    const stored = state.lastSeasonStandings[teamId];
    if (stored !== undefined) {
        return stored;
    }
    const def = leagueConfig.teams.find((t) => t.id === teamId);
    const tier = def?.tier ?? 3;
    return Math.max(1, 13 - tier);
}

export function playerSeasonBreakthrough(
    state: GameState,
    playerId: PlayerId,
    externalOffers: ExternalOffersConfig,
): { ratio: number; games: number } {
    const stats = aggregatePlayerSeasonStats(state, playerId);
    const player = state.players[playerId];
    if (!player || stats.games < externalOffers.minGames) {
        return { ratio: 0, games: stats.games };
    }
    const overall = overallRating(player.attributes);
    return {
        ratio: breakthroughRatio(stats.gameScore, overall, externalOffers),
        games: stats.games,
    };
}

/** 1-based live NBL table rank from played fixtures; null for non-NBL clubs. */
export function liveNblRank(state: GameState, teamId: TeamId): number | null {
    if (!CZECH_NBL_IDS.includes(teamId)) {
        return null;
    }
    const standings = computeNblStandings(state);
    const idx = standings.findIndex((row) => row.teamId === teamId);
    return idx >= 0 ? idx + 1 : null;
}

/** Team is listed in the current BCL group stage or knockout fixture list. */
export function isTeamInActiveBclCompetition(state: GameState, teamId: TeamId): boolean {
    const bcl = state.competitions.bcl;
    if (!bcl || bcl.phase === 'complete') {
        return false;
    }
    for (const group of bcl.groups ?? []) {
        if (group.teamIds.includes(teamId)) {
            return true;
        }
    }
    for (const fixture of bcl.fixtures ?? []) {
        if (fixture.homeTeamId === teamId || fixture.awayTeamId === teamId) {
            return true;
        }
    }
    return false;
}

/** In the hunt for a Czech BCL spot via the NBL playoff picture. */
export function isProjectedBclQualifier(state: GameState, teamId: TeamId, market: MarketConfig): boolean {
    if (!CZECH_NBL_IDS.includes(teamId)) {
        return false;
    }
    const prestige = market.aiRenewal.bclPrestige;
    const standings = computeNblStandings(state);
    const row = standings.find((r) => r.teamId === teamId);
    if (!row || row.played < prestige.minGamesForProjection) {
        return false;
    }
    const rank = liveNblRank(state, teamId);
    if (rank === null) {
        return false;
    }
    return rank <= leagueConfig.playoffs.teams + prestige.projectedRankCushion;
}

export function clubBclPrestigeTier(state: GameState, teamId: TeamId, market: MarketConfig): BclPrestigeTier {
    if (isTeamInActiveBclCompetition(state, teamId)) {
        return 'active';
    }
    if (isTeamBclQualified(state, teamId, market.aiRenewal.bclQualifiers)) {
        return 'confirmed';
    }
    if (isProjectedBclQualifier(state, teamId, market)) {
        return 'projected';
    }
    return 'none';
}

/** i18n key suffix under nego.bcl.* when the European project matters for this deal. */
export function clubBclPrestigeMessageKey(
    state: GameState,
    teamId: TeamId,
    player: Player,
    market: MarketConfig,
    externalOffers: ExternalOffersConfig,
): string | null {
    const { ratio } = playerSeasonBreakthrough(state, player.id, externalOffers);
    const ambition = playerBclAmbition(player, ratio, market, externalOffers);
    if (ambition < 0.35) {
        return null;
    }
    const tier = clubBclPrestigeTier(state, teamId, market);
    if (tier === 'active') {
        return 'nego.bcl.active';
    }
    if (tier === 'confirmed') {
        return 'nego.bcl.confirmed';
    }
    if (tier === 'projected') {
        return 'nego.bcl.projected';
    }
    if (ambition >= 0.55 && CZECH_NBL_IDS.includes(teamId)) {
        return 'nego.bcl.none';
    }
    return null;
}

/** How much this player cares about Champions League exposure (0..1). */
export function playerBclAmbition(
    player: Player,
    ratio: number,
    market: MarketConfig,
    externalOffers: ExternalOffersConfig,
): number {
    const cfg = market.aiRenewal.bclPrestige;
    const overall = overallRating(player.attributes);
    let weight = 0.3;
    if (!isCzech(player)) {
        weight += 0.4;
    }
    if (player.age <= 27) {
        weight += 0.12;
    }
    if (player.age >= cfg.ambitiousMaxAge) {
        weight -= 0.2;
    }
    if (overall >= cfg.ambitiousMinOverall) {
        weight += 0.15;
    }
    if (isElitePlayer(player, ratio, market, externalOffers)) {
        weight += 0.2;
    }
    if (player.potential > overall + 6 && player.age <= 26) {
        weight += 0.1;
    }
    if (isCzech(player) && player.age >= 28 && overall < cfg.ambitiousMinOverall + 4) {
        weight -= 0.15;
    }
    return clamp(weight, 0.1, 1);
}

function prestigeAcceptBonus(tier: BclPrestigeTier, market: MarketConfig): number {
    const p = market.aiRenewal.bclPrestige;
    switch (tier) {
        case 'active':
            return p.activeSeasonAcceptBonus;
        case 'confirmed':
            return p.confirmedAcceptBonus;
        case 'projected':
            return p.projectedAcceptBonus;
        default:
            return -p.noBclAcceptPenalty;
    }
}

/** Non-money negotiation bonus/penalty from BCL project appeal. */
export function negotiationPrestigeBonus(
    state: GameState,
    teamId: TeamId,
    player: Player,
    market: MarketConfig,
    externalOffers: ExternalOffersConfig,
): number {
    const { ratio } = playerSeasonBreakthrough(state, player.id, externalOffers);
    const ambition = playerBclAmbition(player, ratio, market, externalOffers);
    if (ambition <= 0) {
        return 0;
    }
    const tier = clubBclPrestigeTier(state, teamId, market);
    return prestigeAcceptBonus(tier, market) * ambition;
}

function walkAwayPrestigeAdjustment(
    state: GameState,
    player: Player,
    teamId: TeamId,
    market: MarketConfig,
    externalOffers: ExternalOffersConfig,
): number {
    const { ratio } = playerSeasonBreakthrough(state, player.id, externalOffers);
    const ambition = playerBclAmbition(player, ratio, market, externalOffers);
    if (ambition <= 0) {
        return 0;
    }
    const p = market.aiRenewal.bclPrestige;
    const tier = clubBclPrestigeTier(state, teamId, market);
    switch (tier) {
        case 'active':
            return p.walkAwayReductionActive * ambition;
        case 'confirmed':
            return p.walkAwayReductionConfirmed * ambition;
        case 'projected':
            return p.walkAwayReductionProjected * ambition;
        default:
            return -p.walkAwayIncreaseNoBcl * ambition;
    }
}

function aiRenewPrestigeBonus(
    state: GameState,
    teamId: TeamId,
    player: Player,
    market: MarketConfig,
    externalOffers: ExternalOffersConfig,
): number {
    const { ratio } = playerSeasonBreakthrough(state, player.id, externalOffers);
    const ambition = playerBclAmbition(player, ratio, market, externalOffers);
    if (ambition <= 0) {
        return 0;
    }
    const p = market.aiRenewal.bclPrestige;
    const tier = clubBclPrestigeTier(state, teamId, market);
    switch (tier) {
        case 'active':
            return p.aiRenewBonusActive * ambition;
        case 'confirmed':
            return p.aiRenewBonusConfirmed * ambition;
        case 'projected':
            return p.aiRenewBonusProjected * ambition;
        default:
            return -p.aiRenewPenaltyNoBcl * ambition;
    }
}

/** Scale salary demand for signings/renewals based on BCL project fit. */
export function contractDemandPrestigeMult(
    state: GameState,
    teamId: TeamId,
    player: Player,
    market: MarketConfig,
    externalOffers: ExternalOffersConfig,
): number {
    const { ratio } = playerSeasonBreakthrough(state, player.id, externalOffers);
    const ambition = playerBclAmbition(player, ratio, market, externalOffers);
    if (ambition <= 0) {
        return 1;
    }
    const p = market.aiRenewal.bclPrestige;
    const tier = clubBclPrestigeTier(state, teamId, market);
    switch (tier) {
        case 'active':
            return 1 - (1 - p.demandDiscountActive) * ambition;
        case 'confirmed':
            return 1 - (1 - p.demandDiscountConfirmed) * ambition;
        case 'projected':
            return 1 - (1 - p.demandDiscountConfirmed) * ambition * 0.5;
        default:
            return 1 + (p.demandPremiumNoBcl - 1) * ambition;
    }
}

export function walkAwayIntent(
    state: GameState,
    player: Player,
    teamId: TeamId,
    market: MarketConfig,
    externalOffers: ExternalOffersConfig,
): number {
    const cfg = market.aiRenewal;
    const { ratio, games } = playerSeasonBreakthrough(state, player.id, externalOffers);
    if (games < cfg.minGames) {
        return 0;
    }
    const teamCount = Object.keys(state.teams).filter((id) => CZECH_NBL_IDS.includes(id)).length || 12;
    const rank = teamTableRank(state, teamId);
    const bottomHalf = rank >= Math.min(cfg.bottomHalfRank, teamCount);
    const overperf = clamp(ratio - 1, 0, 0.5);
    const teamUnderperf = bottomHalf ? 0.25 : 0;
    const base = overperf + teamUnderperf;
    const prestigeAdj = walkAwayPrestigeAdjustment(state, player, teamId, market, externalOffers);
    return clamp(base - prestigeAdj, 0, cfg.walkAwayIntentCap);
}

function isStarterOnTeam(state: GameState, player: Player, teamId: TeamId): boolean {
    const team = state.teams[teamId];
    return team ? Object.values(team.tactics.starters).includes(player.id) : false;
}

/** How much the club wants to keep this player (0..1 scale for bonuses). */
export function playerImportance(state: GameState, player: Player, teamId: TeamId): number {
    const team = state.teams[teamId];
    if (!team) {
        return 0;
    }
    const roster = team.playerIds
        .map((id) => state.players[id])
        .filter((p): p is Player => p !== undefined);
    const overall = overallRating(player.attributes);
    const avgOverall = roster.reduce((s, p) => s + overallRating(p.attributes), 0) / Math.max(1, roster.length);
    const rankOnTeam = [...roster]
        .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes))
        .findIndex((p) => p.id === player.id);
    let score = 0;
    if (isStarterOnTeam(state, player, teamId)) {
        score += 0.35;
    }
    if (rankOnTeam >= 0 && rankOnTeam < 3) {
        score += 0.25;
    }
    if (overall >= avgOverall + 3) {
        score += 0.15;
    }
    if (isCzech(player)) {
        score += 0.2;
    }
    return clamp(score, 0, 1);
}

export function isCorePlayer(state: GameState, player: Player, teamId: TeamId): boolean {
    return playerImportance(state, player, teamId) >= 0.5;
}

export function isElitePlayer(
    player: Player,
    ratio: number,
    market: MarketConfig,
    externalOffers: ExternalOffersConfig,
): boolean {
    const overall = overallRating(player.attributes);
    return overall >= market.aiRenewal.bclOnlyMinOverall || ratio >= externalOffers.bcl.minRatio;
}

export function bclQualifiedNblTeams(state: GameState, count: number): TeamId[] {
    if (state.lastBclQualifierIds.length > 0) {
        return state.lastBclQualifierIds.slice(0, count);
    }
    if (Object.keys(state.lastSeasonStandings).length > 0) {
        return [];
    }
    const czechTeams = CZECH_NBL_IDS.filter((id) => state.teams[id]);
    // Season-start fallback before any completed NBL season exists.
    return [...czechTeams]
        .sort((a, b) => {
            const tierA = leagueConfig.teams.find((t) => t.id === a)?.tier ?? 3;
            const tierB = leagueConfig.teams.find((t) => t.id === b)?.tier ?? 3;
            return tierB - tierA;
        })
        .slice(0, count);
}

export function isTeamBclQualified(state: GameState, teamId: TeamId, count: number): boolean {
    if (teamId === state.userTeamId && state.bclQualified) {
        return true;
    }
    if (state.lastBclQualifierIds.length > 0) {
        return state.lastBclQualifierIds.includes(teamId);
    }
    return bclQualifiedNblTeams(state, count).includes(teamId);
}

export function canClubSignElite(
    state: GameState,
    teamId: TeamId,
    player: Player,
    ratio: number,
    market: MarketConfig,
    externalOffers: ExternalOffersConfig,
): boolean {
    if (!isElitePlayer(player, ratio, market, externalOffers)) {
        return true;
    }
    return isTeamBclQualified(state, teamId, market.aiRenewal.bclQualifiers);
}

/** Removes a player from an AI (or any) club without transfer fee — leaves abroad. */
export function removePlayerAbroadNoFee(state: GameState, player: Player): void {
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
}

export interface AiRenewalResult {
    renewed: number;
    walkedAbroad: number;
    walkedToFa: number;
    abroadStaged: StagedMovement[];
    nonRenewalPlayerIds: PlayerId[];
}

function isProactiveRenewalCandidate(state: GameState, player: Player, teamId: TeamId): boolean {
    return isCorePlayer(state, player, teamId)
        || (isCzech(player) && isStarterOnTeam(state, player, teamId));
}

function renewalContractYears(
    rng: Rng,
    cfg: MarketConfig['aiRenewal'],
    core: boolean,
    czech: boolean,
): number {
    if (czech && core) {
        return rng.int(cfg.coreYearsMin, cfg.coreYearsMax);
    }
    return rng.int(2, 3);
}

/** Smart AI retention: Czech cores renewed, overperformers on bad teams walk away. */
export function runSmartAiContractRenewals(
    state: GameState,
    market: MarketConfig,
    economy: import('../config/economy').EconomyConfig,
    externalOffers: ExternalOffersConfig,
    contractDemand: (state: GameState, player: Player, market: MarketConfig, economy: import('../config/economy').EconomyConfig) => number,
    rng: Rng,
): AiRenewalResult {
    const cfg = market.aiRenewal;
    const result: AiRenewalResult = {
        renewed: 0,
        walkedAbroad: 0,
        walkedToFa: 0,
        abroadStaged: [],
        nonRenewalPlayerIds: [],
    };

    for (const player of Object.values(state.players)) {
        if (!player.teamId || player.teamId === state.userTeamId || !player.contract) {
            continue;
        }

        const yearsLeft = player.contract.yearsLeft;
        if (yearsLeft > 2) {
            continue;
        }
        if (yearsLeft === 2 && !isProactiveRenewalCandidate(state, player, player.teamId)) {
            continue;
        }

        const teamId = player.teamId;
        const intent = walkAwayIntent(state, player, teamId, market, externalOffers);
        const proactive = yearsLeft === 2;

        if (!proactive && intent >= cfg.walkAwayIntentThreshold) {
            if (!isCzech(player) && rng.chance(cfg.foreignAbroadWalkChance)) {
                result.abroadStaged.push(stageMovement(state, player, 'leftAbroad'));
                removePlayerAbroadNoFee(state, player);
                result.walkedAbroad++;
                continue;
            }
            result.nonRenewalPlayerIds.push(player.id);
            result.walkedToFa++;
            continue;
        }

        const core = isCorePlayer(state, player, teamId);
        const { games } = playerSeasonBreakthrough(state, player.id, externalOffers);
        let pAccept: number = cfg.baseRenewChance;
        if (isCzech(player)) {
            pAccept += cfg.czechBonus;
        }
        if (core) {
            pAccept += cfg.coreBonus;
        }
        if (!core && games >= cfg.minGames && playerImportance(state, player, teamId) < 0.5) {
            pAccept += cfg.depthPlayerBonus;
        }
        pAccept += aiRenewPrestigeBonus(state, teamId, player, market, externalOffers);
        pAccept -= intent * 0.5;
        pAccept = clamp(pAccept, cfg.renewAcceptMin, cfg.renewAcceptMax);

        if (!rng.chance(pAccept)) {
            if (!proactive) {
                result.nonRenewalPlayerIds.push(player.id);
                result.walkedToFa++;
            }
            continue;
        }

        const demand = contractDemand(state, player, market, economy);
        const salaryPremium = core ? cfg.starSalaryPremium : 0;
        const salary = Math.round((demand * (1 + salaryPremium)) / 10_000) * 10_000;
        const renewedYears = renewalContractYears(rng, cfg, core, isCzech(player));
        player.contract = { salary, yearsLeft: renewedYears };
        result.renewed++;
    }

    return result;
}

export interface UserWalkawayResult {
    departed: number;
    abroadStaged: StagedMovement[];
}

/** User roster: foreign players may leave abroad at expiry without a fee. */
export function evaluateUserContractWalkaways(
    state: GameState,
    market: MarketConfig,
    externalOffers: ExternalOffersConfig,
    removePlayerAbroad: (state: GameState, player: Player) => void,
    rng: Rng,
): UserWalkawayResult {
    const cfg = market.aiRenewal;
    const userTeam = state.teams[state.userTeamId];
    if (!userTeam) {
        return { departed: 0, abroadStaged: [] };
    }
    let departed = 0;
    const abroadStaged: StagedMovement[] = [];
    for (const playerId of userTeam.playerIds) {
        const player = state.players[playerId];
        if (!player?.contract || player.contract.yearsLeft > 1) {
            continue;
        }
        if (isCzech(player)) {
            continue;
        }
        const intent = walkAwayIntent(state, player, state.userTeamId, market, externalOffers);
        if (intent >= cfg.walkAwayIntentThreshold && rng.chance(cfg.userForeignAbroadWalkChance)) {
            abroadStaged.push(stageMovement(state, player, 'leftAbroad'));
            removePlayerAbroad(state, player);
            departed++;
        }
    }
    return { departed, abroadStaged };
}
