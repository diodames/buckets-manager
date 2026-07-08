import type { ExternalOffersConfig } from '../config/externalOffers';
import type { EconomyConfig } from '../config/economy';
import type { MarketConfig } from '../config/market';
import type { GameConfig } from './game';
import {
    baseSalary, contractDemand, transferValue,
} from './market';
import {
    aggregatePlayerSeasonStats,
    breakthroughRatio,
} from './playerStats';
import type {
    ExternalOffer, ExternalOfferTier, GameState, Player,
} from './model/types';
import { overallRating } from './model/types';
import type { Rng } from './rng';
import type { PlayerSeasonStats } from './playerStats';

export type { PlayerSeasonStats } from './playerStats';
export { aggregatePlayerSeasonStats, breakthroughRatio, allSeasonFixtures, expectedGameScore } from './playerStats';

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, step: number): number {
    return Math.round(value / step) * step;
}

export function computeTransferFee(
    state: GameState,
    player: Player,
    tier: ExternalOfferTier,
    ratio: number,
    market: MarketConfig,
    economy: EconomyConfig,
    cfg: ExternalOffersConfig,
): number {
    const baseFee = transferValue(player, market, economy, state);
    const severity = clamp(ratio - cfg.fee.severityBase, 0, cfg.fee.severityMax);
    const mult = tier === 'euroleague'
        ? cfg.fee.euroBase + severity * cfg.fee.euroSeverityScale
        : cfg.fee.bclBase + severity * cfg.fee.bclSeverityScale;
    return roundTo(baseFee * mult, cfg.fee.roundTo);
}

export function computeSalaryOffer(
    state: GameState,
    player: Player,
    tier: ExternalOfferTier,
    market: MarketConfig,
    economy: EconomyConfig,
    cfg: ExternalOffersConfig,
): number {
    const overall = overallRating(player.attributes);
    const nblFair = contractDemand(state, player, market, economy);
    const base = baseSalary(overall, economy);
    if (tier === 'euroleague') {
        return Math.min(cfg.salary.euroCap, Math.max(nblFair * cfg.salary.euroDemandMult, base * cfg.salary.euroBaseMult));
    }
    return Math.min(cfg.salary.bclCap, Math.max(nblFair * cfg.salary.bclDemandMult, base * cfg.salary.bclBaseMult));
}

interface Candidate {
    player: Player;
    stats: PlayerSeasonStats;
    ratio: number;
    tier: ExternalOfferTier;
}

function tierForPlayer(player: Player, ratio: number, cfg: ExternalOffersConfig): ExternalOfferTier | null {
    const overall = overallRating(player.attributes);
    const euro = cfg.euroleague;
    if (
        ratio >= euro.minRatio
        && overall >= euro.minOverall
        && player.age <= euro.maxAge
        && player.potential > overall + euro.minPotentialGap
    ) {
        return 'euroleague';
    }
    const bcl = cfg.bcl;
    if (ratio >= bcl.minRatio && overall >= bcl.minOverall && player.age <= bcl.maxAge) {
        return 'bcl';
    }
    return null;
}

function pickClub(tier: ExternalOfferTier, cfg: ExternalOffersConfig, rng: Rng): { name: string; city: string } {
    const pool = tier === 'euroleague' ? cfg.euroleagueClubPool : cfg.bclClubPool;
    return rng.pick([...pool]);
}

function buildOffer(
    state: GameState,
    candidate: Candidate,
    config: GameConfig,
    rng: Rng,
): ExternalOffer {
    const { player, stats, ratio, tier } = candidate;
    const club = pickClub(tier, config.externalOffers, rng);
    const contractYears: 2 | 3 = tier === 'euroleague'
        ? (rng.chance(0.65) ? 3 : 2)
        : config.externalOffers.bclContractYears;
    return {
        id: `ext-${state.seasonYear}-${player.id}-${rng.int(0, 99_999)}`,
        playerId: player.id,
        tier,
        clubName: club.name,
        clubCity: club.city,
        transferFee: computeTransferFee(state, player, tier, ratio, config.market, config.economy, config.externalOffers),
        salaryOffer: computeSalaryOffer(state, player, tier, config.market, config.economy, config.externalOffers),
        contractYears,
        breakthroughRatio: ratio,
        seasonPpg: stats.ppg,
        seasonGameScore: stats.gameScore,
        seasonYear: state.seasonYear,
        expiresRound: config.externalOffers.expiresRound,
        status: 'pending',
    };
}

/**
 * End-of-season scan: at most one bid (best breakout) for the user roster.
 * Called only from startNextSeason after the campaign ends.
 */
export function evaluateBreakthroughOffers(state: GameState, config: GameConfig, rng: Rng): ExternalOffer[] {
    const cfg = config.externalOffers;
    const userTeam = state.teams[state.userTeamId];
    if (!userTeam) {
        state.market.externalOffers = [];
        return [];
    }

    const candidates: Candidate[] = [];
    for (const playerId of userTeam.playerIds) {
        const player = state.players[playerId];
        if (!player?.contract) {
            continue;
        }
        const stats = aggregatePlayerSeasonStats(state, playerId);
        if (stats.games < cfg.minGames) {
            continue;
        }
        const overall = overallRating(player.attributes);
        const ratio = breakthroughRatio(stats.gameScore, overall, cfg);
        const tier = tierForPlayer(player, ratio, cfg);
        if (tier) {
            candidates.push({ player, stats, ratio, tier });
        }
    }

    candidates.sort((a, b) => b.ratio - a.ratio);

    const offers: ExternalOffer[] = [];
    const best = candidates[0];
    if (best) {
        offers.push(buildOffer(state, best, config, rng.fork('breakthrough-offer')));
    }

    state.market.externalOffers = offers;
    return offers;
}

export function pendingExternalOffers(state: GameState): ExternalOffer[] {
    return state.market.externalOffers.filter((o) => o.status === 'pending');
}

export function findExternalOffer(state: GameState, offerId: string): ExternalOffer | undefined {
    return state.market.externalOffers.find((o) => o.id === offerId);
}

function pushLedger(state: GameState, economy: EconomyConfig, amount: number): void {
    state.club.ledger.push({ round: state.currentRound, kind: 'transferIn', amount });
    if (state.club.ledger.length > economy.ledgerCapacity) {
        state.club.ledger.splice(0, state.club.ledger.length - economy.ledgerCapacity);
    }
    state.club.budget += amount;
}

export function removePlayerAbroad(state: GameState, player: Player, market: MarketConfig, cfg: ExternalOffersConfig): void {
    const userTeam = state.teams[state.userTeamId];
    if (!userTeam) {
        return;
    }
    const wasStarter = Object.values(userTeam.tactics.starters).includes(player.id);
    userTeam.playerIds = userTeam.playerIds.filter((id) => id !== player.id);
    for (const position of Object.keys(userTeam.tactics.starters) as Array<keyof typeof userTeam.tactics.starters>) {
        if (userTeam.tactics.starters[position] === player.id) {
            const replacement = userTeam.playerIds
                .map((id) => state.players[id])
                .filter((p): p is Player => p !== undefined)
                .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes))[0];
            if (replacement) {
                userTeam.tactics.starters[position] = replacement.id;
            }
        }
    }
    state.market.listings = state.market.listings.filter((l) => l.playerId !== player.id);
    state.market.incomingOffers = state.market.incomingOffers.filter((o) => o.playerId !== player.id);
    state.market.negotiations = state.market.negotiations.filter((n) => n.playerId !== player.id);
    delete state.players[player.id];
    state.club.fanSupport = Math.max(0, state.club.fanSupport - cfg.departFanSupportPenalty);
    const moraleHit = wasStarter ? cfg.departTeamMoralePenalty + 2 : cfg.departTeamMoralePenalty;
    for (const id of userTeam.playerIds) {
        const teammate = state.players[id];
        if (teammate) {
            teammate.morale = Math.max(0, teammate.morale - moraleHit);
        }
    }
    void market;
}

/** User accepts the transfer fee; player leaves for the foreign club. */
export function acceptExternalOffer(state: GameState, offerId: string, economy: EconomyConfig, cfg: ExternalOffersConfig, market: MarketConfig): boolean {
    const offer = findExternalOffer(state, offerId);
    const player = offer ? state.players[offer.playerId] : undefined;
    if (!offer || offer.status !== 'pending' || !player || player.teamId !== state.userTeamId) {
        return false;
    }
    pushLedger(state, economy, offer.transferFee);
    removePlayerAbroad(state, player, market, cfg);
    offer.status = 'accepted';
    return true;
}

/** User rejects the bid; player morale drops and Euroleague bids may still force a move. */
export function rejectExternalOffer(state: GameState, offerId: string, cfg: ExternalOffersConfig, rng: Rng): void {
    const offer = findExternalOffer(state, offerId);
    const player = offer ? state.players[offer.playerId] : undefined;
    if (!offer || offer.status !== 'pending' || !player) {
        return;
    }
    offer.status = 'rejected';
    player.morale = Math.max(0, player.morale - cfg.rejectMoralePenalty);
    if (offer.tier === 'euroleague' && rng.chance(cfg.euroRejectForceDepartureChance)) {
        offer.mayForceDeparture = true;
    }
}

/** Called when retention negotiation succeeds. */
export function completeExternalRetention(state: GameState, offerId: string, salary: number, years: number, cfg: ExternalOffersConfig): boolean {
    const offer = findExternalOffer(state, offerId);
    const player = offer ? state.players[offer.playerId] : undefined;
    if (!offer || offer.status !== 'pending' || !player || player.teamId !== state.userTeamId) {
        return false;
    }
    player.contract = { salary, yearsLeft: years };
    player.morale = Math.max(0, player.morale - cfg.retainMoralePenalty);
    offer.status = 'retained';
    return true;
}

/** Expire unanswered or forced-departure offers at the deadline round. */
export function tickExternalOffers(state: GameState, economy: EconomyConfig, cfg: ExternalOffersConfig, market: MarketConfig): void {
    for (const offer of state.market.externalOffers) {
        if (state.currentRound <= offer.expiresRound) {
            continue;
        }
        const player = state.players[offer.playerId];
        if (!player || player.teamId !== state.userTeamId) {
            continue;
        }
        if (offer.status === 'pending') {
            offer.status = 'departed';
            removePlayerAbroad(state, player, market, cfg);
        } else if (offer.status === 'rejected' && offer.mayForceDeparture) {
            offer.status = 'departed';
            removePlayerAbroad(state, player, market, cfg);
        }
    }
    void economy;
}

/** Opens an external-retention negotiation on the market state. */
export function beginExternalRetention(state: GameState, offerId: string, market: MarketConfig): boolean {
    const offer = findExternalOffer(state, offerId);
    const player = offer ? state.players[offer.playerId] : undefined;
    if (!offer || offer.status !== 'pending' || !player) {
        return false;
    }
    state.market.negotiations = state.market.negotiations.filter((n) => n.playerId !== player.id);
    state.market.negotiations.push({
        playerId: player.id,
        round: 1,
        hintSalary: null,
        mode: 'externalRetention',
        externalOfferId: offerId,
    });
    void market;
    return true;
}

export function externalRetentionScore(
    state: GameState,
    player: Player,
    offer: ExternalOffer,
    salaryOffer: number,
    years: number,
    market: MarketConfig,
    economy: EconomyConfig,
    cfg: ExternalOffersConfig,
): number {
    const ret = cfg.retention;
    const demand = contractDemand(state, player, market, economy);
    const moneyRatio = clamp((salaryOffer - demand) / demand, -1, 1);
    const prestigePenalty = offer.tier === 'euroleague' ? ret.prestigePenaltyEuro : ret.prestigePenaltyBcl;
    let score = 50;
    score += market.contracts.moneyWeight * moneyRatio;
    score -= prestigePenalty;
    score += (player.morale - 50) / 4;
    if (salaryOffer >= offer.salaryOffer * ret.matchThreshold) {
        score += ret.matchBonus;
    }
    if (salaryOffer < offer.salaryOffer * ret.underpayThreshold) {
        score -= ret.underpayPenalty;
    }
    if (years >= 2 && player.age <= 27) {
        score += market.contracts.longDealYoungBonus;
    }
    return score;
}

export function requiredExternalRetentionSalary(
    state: GameState,
    player: Player,
    offer: ExternalOffer,
    years: number,
    market: MarketConfig,
    economy: EconomyConfig,
    cfg: ExternalOffersConfig,
): number {
    const demand = contractDemand(state, player, market, economy);
    const ret = cfg.retention;
    const prestigePenalty = offer.tier === 'euroleague' ? ret.prestigePenaltyEuro : ret.prestigePenaltyBcl;
    let base = 50 - prestigePenalty + (player.morale - 50) / 4;
    if (years >= 2 && player.age <= 27) {
        base += market.contracts.longDealYoungBonus;
    }
    const foreignBonus = ret.matchBonus;
    const neededMoney = ((ret.acceptThreshold - base - foreignBonus) / market.contracts.moneyWeight) * demand + demand;
    const fromForeign = offer.salaryOffer * ret.matchThreshold;
    return Math.ceil(Math.max(neededMoney, fromForeign) / 10_000) * 10_000;
}
