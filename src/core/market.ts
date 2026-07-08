import type { BalanceConfig } from '../config/balance';
import type { EconomyConfig } from '../config/economy';
import type { ExternalOffersConfig } from '../config/externalOffers';
import { externalOffersConfig } from '../config/externalOffers';
import { leagueConfig } from '../config/league';
import type { MarketConfig } from '../config/market';
import type { NamePools } from '../config/names';
import { seasonMarketForYear } from '../config/seasonSignings';
import {
    youthAcademyProspectById,
    youthAcademyProspectsForTeam,
    type YouthAcademyProspectDef,
} from '../config/youthAcademy';
import { generateFreeAgents } from './league/generate';
import { totalRounds } from './league/schedule';
import { effectiveFacilityLevel, interpolateFacilityValue, aiCanAffordTransferFee, aiCanSignFreeAgent, creditAiBudget, debitAiBudget } from './economy';
import { canAffordContract, financeWarningTier } from './cashflow';
import { generateName } from './namegen';
import { advanceSeasonMarket, aiSigningBoost } from './seasonMarket';
import {
    completeExternalRetention,
    externalRetentionScore,
    findExternalOffer,
    requiredExternalRetentionSalary,
    tickExternalOffers,
} from './breakthrough';
import {
    type AiRenewalResult,
    canClubSignElite,
    clubBclPrestigeMessageKey,
    contractDemandPrestigeMult,
    isCzech,
    negotiationPrestigeBonus,
    playerSeasonBreakthrough,
    runSmartAiContractRenewals,
    teamTableRank,
    walkAwayIntent,
} from './contracts';
import { stageMovement, type StagedMovement } from './offseasonMovements';
import type {
    FixedYouthArrival,
    GameState, NegotiationState, Player, PlayerId, Position, TeamId, YouthProspect,
} from './model/types';
import { ATTRIBUTE_KEYS, overallRating, POSITIONS } from './model/types';
import { hashString, type Rng } from './rng';

// ---------- salaries, demand, transfer value ----------

export function baseSalary(overall: number, economy: EconomyConfig): number {
    return Math.max(economy.salary.min, Math.round(economy.salary.base + (overall - 50) * economy.salary.perPoint));
}

function factorByAge(table: readonly { maxAge: number; factor: number }[], age: number): number {
    return table.find((row) => age <= row.maxAge)?.factor ?? 1;
}

/** League position of the user team, 1-based; cheap standing proxy by wins. */
function userTablePosition(state: GameState): number {
    const wins = new Map<TeamId, number>();
    for (const f of state.fixtures) {
        if (!f.result) {
            continue;
        }
        const winner = f.result.homeScore > f.result.awayScore ? f.homeTeamId : f.awayTeamId;
        wins.set(winner, (wins.get(winner) ?? 0) + 1);
    }
    const sorted = [...Object.keys(state.teams)].sort((a, b) => (wins.get(b) ?? 0) - (wins.get(a) ?? 0));
    return sorted.indexOf(state.userTeamId) + 1;
}

/** M2: what the player considers a fair salary. */
export function contractDemand(_state: GameState, player: Player, market: MarketConfig, economy: EconomyConfig): number {
    const c = market.contracts;
    const marketSalary = baseSalary(overallRating(player.attributes), economy);
    const ageF = factorByAge(c.ageFactor, player.age);
    // Unhappy players want danger money; happy ones give a discount.
    const happinessF =
        player.morale >= 80 ? c.happinessMin : player.morale <= 30 ? c.happinessMax : c.happinessMin + ((80 - player.morale) / 50) * (c.happinessMax - c.happinessMin);
    let demand = marketSalary * ageF * happinessF;
    if (player.teamId === null) {
        demand *= c.freeAgentDemandMult;
    }
    return Math.round(demand / 10_000) * 10_000;
}

/** M6: cash value of a player on the transfer market. */
export function transferValue(player: Player, market: MarketConfig, economy: EconomyConfig): number {
    const tCfg = market.transfers;
    const overall = overallRating(player.attributes);
    const salary = player.contract?.salary ?? baseSalary(overall, economy);
    const ageV = factorByAge(tCfg.ageValue, player.age);
    const potV = Math.min(tCfg.potentialCap, 1 + (player.potential - overall) / 50);
    const contractV = (player.contract?.yearsLeft ?? 1) >= 2 ? tCfg.contractValue.multi : tCfg.contractValue.finalYear;
    return Math.round((salary * tCfg.salaryMult * ageV * potV * contractV) / 50_000) * 50_000;
}

export function isMarketOpen(state: GameState, market: MarketConfig): boolean {
    const seasonEnd = totalRounds(Object.keys(state.teams).length, leagueConfig.roundRobinLegs);
    const deadline = Math.min(market.transfers.deadlineRound, seasonEnd);
    return state.currentRound <= deadline;
}

// ---------- team needs (M14) ----------

export interface PositionNeed {
    position: Position;
    depth: number;
    need: number;
    surplus: number;
}

export function teamNeeds(state: GameState, teamId: TeamId, market: MarketConfig): PositionNeed[] {
    const overalls = Object.values(state.players)
        .filter((p) => p.teamId !== null)
        .map((p) => overallRating(p.attributes))
        .sort((a, b) => a - b);
    const median = overalls[Math.floor(overalls.length / 2)] ?? 55;
    const team = state.teams[teamId];
    const roster = (team?.playerIds ?? []).map((id) => state.players[id]).filter((p): p is Player => p !== undefined);
    return POSITIONS.map((position) => {
        const depth = roster.filter(
            (p) => p.position === position && overallRating(p.attributes) >= median - market.ai.depthOverallOffset,
        ).length;
        return { position, depth, need: 2 - depth, surplus: depth - market.ai.surplusDepth };
    });
}

// ---------- contract negotiation (M3) ----------

export interface NegotiationResult {
    status:
        | 'accepted'
        | 'rejected'
        | 'finalRejected'
        | 'locked'
        | 'rosterFull'
        | 'wageBudgetExceeded'
        | 'projectedDeficit';
    // Salary the player hints at / firmly demands after a rejection.
    hintSalary: number | null;
    negotiationRound: number;
}

function isStarter(state: GameState, player: Player): boolean {
    const team = player.teamId ? state.teams[player.teamId] : null;
    return team ? Object.values(team.tactics.starters).includes(player.id) : false;
}

export interface NegotiationTermsContext {
    agreedTransferFee?: number;
}

/** Demand adjusted per negotiation mode (post-transfer terms carry leverage). */
function demandFor(
    state: GameState,
    player: Player,
    mode: NegotiationState['mode'],
    market: MarketConfig,
    economy: EconomyConfig,
    terms: NegotiationTermsContext = {},
): number {
    let demand = contractDemand(state, player, market, economy);
    const signingTeamId = mode === 'freeAgent' || mode === 'renew' || mode === 'transferTerms'
        ? state.userTeamId
        : player.teamId;
    if (signingTeamId) {
        demand = Math.round(demand * contractDemandPrestigeMult(state, signingTeamId, player, market, externalOffersConfig));
    }
    if (mode === 'transferTerms') {
        demand = Math.round(demand * market.transfers.postTransferDemandMult);
        const { ratio } = playerSeasonBreakthrough(state, player.id, externalOffersConfig);
        if (
            !canClubSignElite(state, state.userTeamId, player, ratio, market, externalOffersConfig)
            && isElitePlayerForTerms(player, ratio, market)
        ) {
            demand = Math.round(demand * market.aiRenewal.eliteTransferTermsMult);
        }
        const fee = terms.agreedTransferFee ?? 0;
        if (fee > 0) {
            const value = transferValue(player, market, economy);
            if (fee >= value) {
                demand = Math.round(demand * market.transfers.transferFeeCommitmentMult);
            }
        }
    }
    return demand;
}

/** Salary demand shown in negotiation UI and used in negotiateOffer. */
export function negotiationDemand(
    state: GameState,
    player: Player,
    mode: NegotiationState['mode'],
    market: MarketConfig,
    economy: EconomyConfig,
    terms: NegotiationTermsContext = {},
): number {
    return demandFor(state, player, mode, market, economy, terms);
}

export { clubBclPrestigeMessageKey };

function isElitePlayerForTerms(player: Player, ratio: number, market: MarketConfig): boolean {
    return overallRating(player.attributes) >= market.aiRenewal.bclOnlyMinOverall
        || ratio >= externalOffersConfig.bcl.minRatio;
}

/** All non-money components of the acceptance score (M3). */
function baseScore(
    state: GameState,
    player: Player,
    offer: { years: number },
    market: MarketConfig,
    mode?: NegotiationState['mode'],
): number {
    const c = market.contracts;
    const minutesShare = isStarter(state, player) ? 0.7 : 0.35;
    let score = 50;
    if (mode === 'transferTerms') {
        score += market.transfers.transferTermsAcceptBonus;
    }
    score += c.playingTimeWeight * (minutesShare - 0.5) * 2;
    score += (player.morale - 50) / 5;
    // Table position only matters once the season has taken shape.
    const played = state.fixtures.filter((f) => f.result).length;
    const teamCount = Object.keys(state.teams).length;
    if (played >= teamCount) {
        const position = userTablePosition(state);
        if (position <= 4) {
            score += c.topTableBonus;
        } else if (position > teamCount - 4) {
            score -= c.bottomTablePenalty;
        }
    }
    if (offer.years >= 2 && player.age <= 27) {
        score += c.longDealYoungBonus;
    }
    if (offer.years >= 2 && player.age >= 32) {
        score -= c.longDealOldPenalty;
    }
    if (player.teamId === state.userTeamId) {
        const intent = walkAwayIntent(state, player, state.userTeamId, market, externalOffersConfig);
        if (intent > market.aiRenewal.userRenewalIntentThreshold) {
            score -= market.aiRenewal.userRenewalIntentPenalty;
        }
    }
    score += negotiationPrestigeBonus(state, state.userTeamId, player, market, externalOffersConfig);
    return score;
}

function acceptanceScore(
    state: GameState,
    player: Player,
    offer: { salary: number; years: number },
    demand: number,
    market: MarketConfig,
    mode: NegotiationState['mode'],
): number {
    // Money can persuade up to double the fair demand.
    const moneyRatio = Math.max(-1, Math.min(1, (offer.salary - demand) / demand));
    return baseScore(state, player, offer, market, mode) + market.contracts.moneyWeight * moneyRatio;
}

/**
 * The salary at which the player would accept the given deal length — the
 * inverse of acceptanceScore. Used for truthful agent hints, so an offer at
 * the hinted amount really closes the deal.
 */
export function requiredSalary(
    state: GameState,
    player: Player,
    years: number,
    mode: NegotiationState['mode'],
    market: MarketConfig,
    economy: EconomyConfig,
    terms: NegotiationTermsContext = {},
): number {
    const c = market.contracts;
    const demand = demandFor(state, player, mode, market, economy, terms);
    const neededRatio = (c.acceptThreshold - baseScore(state, player, { years }, market, mode)) / c.moneyWeight;
    const ratio = Math.max(-0.5, Math.min(1, neededRatio));
    return Math.ceil((demand * (1 + ratio)) / 10_000) * 10_000;
}

function findNegotiation(state: GameState, playerId: PlayerId): NegotiationState | null {
    return state.market.negotiations.find((n) => n.playerId === playerId) ?? null;
}

export type RenewalBlockReason = 'notExpiring' | 'tooEarly' | 'locked';

export interface RenewalStatus {
    canRenew: boolean;
    reason?: RenewalBlockReason;
    lockedUntilRound?: number;
}

/** Whether the user can open renewal talks for an own-squad player, and why not. */
export function renewalStatus(state: GameState, player: Player, market: MarketConfig): RenewalStatus {
    if ((player.contract?.yearsLeft ?? 0) > 1) {
        return { canRenew: false, reason: 'notExpiring' };
    }
    const lockedUntil = state.market.negotiationLocks[player.id] ?? 0;
    if (state.currentRound < lockedUntil) {
        return { canRenew: false, reason: 'locked', lockedUntilRound: lockedUntil };
    }
    if (state.currentRound < market.contracts.renewalsOpenFromRound) {
        return { canRenew: false, reason: 'tooEarly' };
    }
    return { canRenew: true };
}

export function canNegotiate(state: GameState, player: Player, market: MarketConfig): boolean {
    const lockedUntil = state.market.negotiationLocks[player.id] ?? 0;
    if (state.currentRound < lockedUntil) {
        return false;
    }
    if (player.teamId === state.userTeamId) {
        return renewalStatus(state, player, market).canRenew;
    }
    if (player.teamId === null) {
        const { ratio } = playerSeasonBreakthrough(state, player.id, externalOffersConfig);
        return canClubSignElite(state, state.userTeamId, player, ratio, market, externalOffersConfig);
    }
    return false;
}

/**
 * One negotiation round (M3): evaluates the offer, applies the contract on
 * success, reveals hints on rejection, and locks talks after the final round.
 */
export function negotiateOffer(
    state: GameState,
    playerId: PlayerId,
    offer: { salary: number; years: number },
    mode: NegotiationState['mode'],
    market: MarketConfig,
    economy: EconomyConfig,
    options?: { externalOffers?: ExternalOffersConfig; agreedTransferFee?: number },
): NegotiationResult {
    const c = market.contracts;
    const player = state.players[playerId];
    if (!player) {
        throw new Error(`negotiateOffer: unknown player '${playerId}'`);
    }
    const lockedUntil = state.market.negotiationLocks[playerId] ?? 0;
    if (state.currentRound < lockedUntil) {
        return { status: 'locked', hintSalary: null, negotiationRound: 0 };
    }
    let negotiation = findNegotiation(state, playerId);
    if (!negotiation) {
        const created: NegotiationState = {
            playerId,
            round: 1,
            hintSalary: null,
            mode,
        };
        if (options?.agreedTransferFee !== undefined) {
            created.agreedTransferFee = options.agreedTransferFee;
        }
        state.market.negotiations.push(created);
        negotiation = created;
    } else if (options?.agreedTransferFee !== undefined && negotiation.agreedTransferFee === undefined) {
        negotiation.agreedTransferFee = options.agreedTransferFee;
    }
    const terms: NegotiationTermsContext = negotiation.agreedTransferFee !== undefined
        ? { agreedTransferFee: negotiation.agreedTransferFee }
        : {};
    const demand = demandFor(state, player, mode, market, economy, terms);

    if (mode === 'freeAgent') {
        const { ratio } = playerSeasonBreakthrough(state, player.id, externalOffersConfig);
        if (!canClubSignElite(state, state.userTeamId, player, ratio, market, externalOffersConfig)) {
            return { status: 'rejected', hintSalary: null, negotiationRound: negotiation.round };
        }
    }

    if (mode === 'externalRetention') {
        const extCfg = options?.externalOffers;
        const extOfferId = negotiation.externalOfferId;
        const extOffer = extOfferId ? findExternalOffer(state, extOfferId) : undefined;
        if (!extCfg || !extOffer) {
            return { status: 'rejected', hintSalary: null, negotiationRound: negotiation.round };
        }
        const score = externalRetentionScore(state, player, extOffer, offer.salary, offer.years, market, economy, extCfg);
        if (score >= extCfg.retention.acceptThreshold) {
            const affordability = canAffordContract(state, economy, leagueConfig, offer.salary, player.id, {
                skipWageBudget: true,
            });
            if (!affordability.ok) {
                return {
                    status: affordability.reason === 'wageBudgetExceeded' ? 'wageBudgetExceeded' : 'projectedDeficit',
                    hintSalary: null,
                    negotiationRound: negotiation.round,
                };
            }
            if (completeExternalRetention(state, extOffer.id, offer.salary, offer.years, extCfg)) {
                state.market.negotiations = state.market.negotiations.filter((n) => n.playerId !== playerId);
                return { status: 'accepted', hintSalary: null, negotiationRound: negotiation.round };
            }
            return { status: 'rejected', hintSalary: null, negotiationRound: negotiation.round };
        }
        if (negotiation.round >= c.maxRounds) {
            state.market.negotiations = state.market.negotiations.filter((n) => n.playerId !== playerId);
            state.market.negotiationLocks[playerId] = state.currentRound + c.lockRounds;
            player.morale = Math.max(0, player.morale - c.lockMoralePenalty);
            return { status: 'finalRejected', hintSalary: null, negotiationRound: c.maxRounds };
        }
        const required = requiredExternalRetentionSalary(state, player, extOffer, offer.years, market, economy, extCfg);
        const hint = negotiation.round === 1 ? Math.ceil(required / 100_000) * 100_000 : required;
        negotiation.round++;
        negotiation.hintSalary = hint;
        return { status: 'rejected', hintSalary: hint, negotiationRound: negotiation.round - 1 };
    }

    const score = acceptanceScore(state, player, offer, demand, market, mode);

    if (score >= c.acceptThreshold) {
        const userTeam = state.teams[state.userTeamId];
        if (!userTeam || (mode !== 'renew' && userTeam.playerIds.length >= market.roster.maxPlayers)) {
            return { status: 'rosterFull', hintSalary: null, negotiationRound: negotiation.round };
        }
        const replacesPlayerId = mode === 'renew' || mode === 'transferTerms'
            ? player.id
            : undefined;
        const affordability = canAffordContract(state, economy, leagueConfig, offer.salary, replacesPlayerId);
        if (!affordability.ok) {
            return {
                status: affordability.reason === 'wageBudgetExceeded' ? 'wageBudgetExceeded' : 'projectedDeficit',
                hintSalary: null,
                negotiationRound: negotiation.round,
            };
        }
        if (mode === 'freeAgent') {
            player.teamId = state.userTeamId;
            userTeam.playerIds.push(player.id);
        }
        // 'transferTerms' only fixes the contract; executePurchase moves the
        // player once the fee is actually paid.
        player.contract = { salary: offer.salary, yearsLeft: offer.years };
        player.morale = Math.min(100, player.morale + 5);
        state.market.negotiations = state.market.negotiations.filter((n) => n.playerId !== playerId);
        return { status: 'accepted', hintSalary: null, negotiationRound: negotiation.round };
    }

    if (negotiation.round >= c.maxRounds) {
        state.market.negotiations = state.market.negotiations.filter((n) => n.playerId !== playerId);
        state.market.negotiationLocks[playerId] = state.currentRound + c.lockRounds;
        player.morale = Math.max(0, player.morale - c.lockMoralePenalty);
        return { status: 'finalRejected', hintSalary: null, negotiationRound: c.maxRounds };
    }

    // Truthful hints: the amount that actually clears the acceptance bar for
    // the offered deal length. Round 1 is vague (rounded up), round 2 firm.
    const required = requiredSalary(state, player, offer.years, mode, market, economy, terms);
    // Round 1 hints vaguely above the mark; round 2 states the exact minimum.
    const hint = negotiation.round === 1 ? Math.ceil(required / 100_000) * 100_000 : required;
    negotiation.round++;
    negotiation.hintSalary = hint;
    return { status: 'rejected', hintSalary: hint, negotiationRound: negotiation.round - 1 };
}

// ---------- listings, offers, bids (M7-M10) ----------

function pushLedger(state: GameState, economy: EconomyConfig, kind: 'transferIn' | 'transferOut' | 'buyout', amount: number): void {
    state.club.ledger.push({ round: state.currentRound, kind, amount });
    if (state.club.ledger.length > economy.ledgerCapacity) {
        state.club.ledger.splice(0, state.club.ledger.length - economy.ledgerCapacity);
    }
    state.club.budget += amount;
}

/** Removes a player from a team's roster and patches the starters map. */
function removeFromTeam(state: GameState, player: Player): void {
    const team = player.teamId ? state.teams[player.teamId] : null;
    if (!team) {
        return;
    }
    team.playerIds = team.playerIds.filter((id) => id !== player.id);
    for (const position of POSITIONS) {
        if (team.tactics.starters[position] === player.id) {
            const replacement = team.playerIds
                .map((id) => state.players[id])
                .filter((p): p is Player => p !== undefined && !Object.values(team.tactics.starters).includes(p.id))
                .sort(
                    (a, b) =>
                        (b.position === position ? 1000 : 0) + overallRating(b.attributes) -
                        ((a.position === position ? 1000 : 0) + overallRating(a.attributes)),
                )[0];
            if (replacement) {
                team.tactics.starters[position] = replacement.id;
            }
        }
    }
    player.teamId = null;
}

export function listPlayer(state: GameState, playerId: PlayerId, askingPrice: number | null, market: MarketConfig): boolean {
    const player = state.players[playerId];
    if (!player || player.teamId !== state.userTeamId || state.market.listings.some((l) => l.playerId === playerId)) {
        return false;
    }
    state.market.listings.push({ playerId, askingPrice, listedRound: state.currentRound });
    player.morale = Math.max(0, player.morale - market.transfers.listingMoralePenalty);
    return true;
}

export function unlistPlayer(state: GameState, playerId: PlayerId): void {
    state.market.listings = state.market.listings.filter((l) => l.playerId !== playerId);
    state.market.incomingOffers = state.market.incomingOffers.filter((o) => o.playerId !== playerId);
}

/** Sells a user player to the offering AI club. */
export function acceptTransferOffer(state: GameState, offerId: string, economy: EconomyConfig): boolean {
    const offer = state.market.incomingOffers.find((o) => o.id === offerId);
    const player = offer ? state.players[offer.playerId] : null;
    if (!offer || !player || player.teamId !== state.userTeamId) {
        return false;
    }
    const userTeam = state.teams[state.userTeamId];
    if ((userTeam?.playerIds.length ?? 0) <= 10) {
        return false; // roster minimum (NBL rule)
    }
    if (!aiCanAffordTransferFee(state, offer.fromTeamId, offer.amount)) {
        return false;
    }
    removeFromTeam(state, player);
    const buyer = state.teams[offer.fromTeamId];
    if (buyer) {
        player.teamId = offer.fromTeamId;
        buyer.playerIds.push(player.id);
    }
    debitAiBudget(state, offer.fromTeamId, offer.amount);
    pushLedger(state, economy, 'transferIn', offer.amount);
    unlistPlayer(state, player.id);
    return true;
}

export function rejectTransferOffer(state: GameState, offerId: string, market: MarketConfig, economy: EconomyConfig): void {
    const offer = state.market.incomingOffers.find((o) => o.id === offerId);
    if (offer) {
        const player = state.players[offer.playerId];
        // Turning down a big unsolicited bid stings the player (M10).
        if (player && offer.amount >= transferValue(player, market, economy) * market.transfers.unsolicitedFactorMin) {
            player.morale = Math.max(0, player.morale - market.transfers.rejectedBigBidMorale);
        }
    }
    state.market.incomingOffers = state.market.incomingOffers.filter((o) => o.id !== offerId);
}

/** M7: one counter per offer; the AI accepts up to its ceiling. */
export function counterTransferOffer(
    state: GameState,
    offerId: string,
    counterAmount: number,
    market: MarketConfig,
    economy: EconomyConfig,
): 'accepted' | 'withdrawn' | 'invalid' {
    const offer = state.market.incomingOffers.find((o) => o.id === offerId);
    const player = offer ? state.players[offer.playerId] : null;
    if (!offer || !player || offer.countered) {
        return 'invalid';
    }
    offer.countered = true;
    const ceiling = transferValue(player, market, economy) * market.transfers.aiCounterCeiling;
    if (counterAmount <= ceiling) {
        offer.amount = counterAmount;
        return 'accepted';
    }
    state.market.incomingOffers = state.market.incomingOffers.filter((o) => o.id !== offerId);
    return 'withdrawn';
}

export interface BidResult {
    status: 'agreed' | 'rejected' | 'counter' | 'notForSale' | 'marketClosed' | 'cantAfford';
    counterAmount: number | null;
}

/** M8: bid on an AI club's player. On 'agreed', personal terms follow. */
export function bidOnPlayer(state: GameState, playerId: PlayerId, amount: number, market: MarketConfig, economy: EconomyConfig): BidResult {
    const player = state.players[playerId];
    if (!player || player.teamId === null || player.teamId === state.userTeamId) {
        return { status: 'rejected', counterAmount: null };
    }
    if (!isMarketOpen(state, market)) {
        return { status: 'marketClosed', counterAmount: null };
    }
    if (amount > state.club.budget) {
        return { status: 'cantAfford', counterAmount: null };
    }
    const tCfg = market.transfers;
    const needs = teamNeeds(state, player.teamId, market);
    const positionNeed = needs.find((n) => n.position === player.position);
    const surplus = (positionNeed?.surplus ?? 0) > 0;
    const starter = isStarter(state, player);
    // Sellers guard starters when their squad ranks among the league's best.
    const avgOverall = (teamId: TeamId): number => {
        const roster = (state.teams[teamId]?.playerIds ?? [])
            .map((id) => state.players[id])
            .filter((p): p is Player => p !== undefined);
        return roster.reduce((s, p) => s + overallRating(p.attributes), 0) / Math.max(1, roster.length);
    };
    const sellerRank = Object.keys(state.teams)
        .sort((a, b) => avgOverall(b) - avgOverall(a))
        .indexOf(player.teamId);
    const contender = sellerRank >= 0 && sellerRank < 3;
    let sellF: number = surplus ? tCfg.sellFactorSurplus : starter && contender ? tCfg.sellFactorCore : tCfg.sellFactorNormal;
    const tableRank = teamTableRank(state, player.teamId);
    const czechCore = isCzech(player) && starter && tableRank <= 4;
    if (czechCore) {
        sellF = Math.max(sellF, tCfg.sellFactorCzechCore);
    }
    const price = transferValue(player, market, economy) * sellF;
    if (starter && sellF >= tCfg.sellFactorCore && amount < price) {
        return { status: 'notForSale', counterAmount: null };
    }
    if (amount >= price) {
        return { status: 'agreed', counterAmount: null };
    }
    if (amount >= price * 0.8) {
        return { status: 'counter', counterAmount: Math.round(price / 50_000) * 50_000 };
    }
    return { status: 'rejected', counterAmount: null };
}

/** Completes a purchase after agreed fee + personal terms: pays and moves the player. */
export function executePurchase(state: GameState, playerId: PlayerId, fee: number, market: MarketConfig, economy: EconomyConfig): boolean {
    const player = state.players[playerId];
    const userTeam = state.teams[state.userTeamId];
    const sellerId = player?.teamId ?? null;
    if (!player || !userTeam || fee > state.club.budget || userTeam.playerIds.length >= market.roster.maxPlayers) {
        return false;
    }
    removeFromTeam(state, player);
    player.teamId = state.userTeamId;
    userTeam.playerIds.push(player.id);
    pushLedger(state, economy, 'transferOut', -fee);
    if (sellerId && sellerId !== state.userTeamId) {
        creditAiBudget(state, sellerId, fee);
    }
    return true;
}

// ---------- market tick (M7, M10, M5-AI, expiry) ----------

export function marketTick(state: GameState, market: MarketConfig, economy: EconomyConfig, rng: Rng, externalOffers?: ExternalOffersConfig): void {
    const round = state.currentRound;
    const tCfg = market.transfers;

    advanceSeasonMarket(state, round, seasonMarketForYear(state.seasonYear));

    // Expire offers. Youth prospects do NOT expire: promising talents can be
    // invited to the first team at any point of the season.
    state.market.incomingOffers = state.market.incomingOffers.filter((o) => o.expiresRound >= round);

    if (isMarketOpen(state, market)) {
        // AI offers for listed players: interest scales with how attractive
        // the player is (overall vs league median, potential headroom, age),
        // so stars draw bids within a round or two while journeymen may wait.
        const medianOverall = (() => {
            const overalls = Object.values(state.players)
                .filter((p) => p.teamId !== null)
                .map((p) => overallRating(p.attributes))
                .sort((a, b) => a - b);
            return overalls[Math.floor(overalls.length / 2)] ?? 55;
        })();
        for (const listing of state.market.listings) {
            const player = state.players[listing.playerId];
            if (!player || player.teamId !== state.userTeamId) {
                continue;
            }
            if (state.market.incomingOffers.some((o) => o.playerId === listing.playerId)) {
                continue;
            }
            const overall = overallRating(player.attributes);
            const quality = (overall - medianOverall) / 20; // ~ -1 .. +1
            const upside = Math.max(0, player.potential - overall) / 25; // 0 .. ~1
            const youth = player.age <= 24 ? 0.15 : player.age >= 32 ? -0.2 : 0;
            const interest = Math.max(0.08, Math.min(0.95, tCfg.offerChancePerRound + quality * 0.35 + upside * 0.3 + youth));
            if (!rng.chance(interest)) {
                continue;
            }
            const factor = tCfg.offerFactorMin + rng.next() * (tCfg.offerFactorMax - tCfg.offerFactorMin);
            const baseAmount = Math.round((transferValue(player, market, economy) * factor) / 50_000) * 50_000;
            const buyers = Object.keys(state.teams).filter((id) => id !== state.userTeamId);
            const affordableBuyers = buyers.filter((id) => aiCanAffordTransferFee(state, id, baseAmount));
            if (affordableBuyers.length === 0) {
                continue;
            }
            const buyer = rng.pick(affordableBuyers);
            const needs = teamNeeds(state, buyer, market);
            const needF = (needs.find((n) => n.position === player.position)?.need ?? 0) > 0 ? tCfg.needFactorMax : 1;
            const amount = Math.round((transferValue(player, market, economy) * factor * needF) / 50_000) * 50_000;
            const floor = listing.askingPrice !== null ? listing.askingPrice * 0.8 : 0;
            if (amount >= floor) {
                state.market.incomingOffers.push({
                    id: `off-${round}-${rng.int(0, 99_999)}`,
                    playerId: player.id,
                    fromTeamId: buyer,
                    amount: Math.max(amount, Math.min(listing.askingPrice ?? amount, amount * 1.05)),
                    expiresRound: round + tCfg.offerTtlRounds,
                    countered: false,
                });
            }
        }

        // Unsolicited bids for the user's best unlisted players (M10).
        if (
            !state.market.unsolicitedBidUsed
            && !state.market.incomingOffers.some((o) => o.id.startsWith('uns-'))
            && rng.chance(tCfg.unsolicitedChancePerRound)
        ) {
            const userTeam = state.teams[state.userTeamId];
            const stars = (userTeam?.playerIds ?? [])
                .map((id) => state.players[id])
                .filter((p): p is Player => p !== undefined && !state.market.listings.some((l) => l.playerId === p.id))
                .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes))
                .slice(0, 3);
            if (stars.length > 0) {
                const target = rng.pick(stars);
                const factor = tCfg.unsolicitedFactorMin + rng.next() * (tCfg.unsolicitedFactorMax - tCfg.unsolicitedFactorMin);
                const amount = Math.round((transferValue(target, market, economy) * factor) / 50_000) * 50_000;
                const affordableBuyers = Object.keys(state.teams).filter(
                    (id) => id !== state.userTeamId && aiCanAffordTransferFee(state, id, amount),
                );
                if (affordableBuyers.length > 0) {
                    state.market.incomingOffers.push({
                        id: `uns-${round}-${rng.int(0, 99_999)}`,
                        playerId: target.id,
                        fromTeamId: rng.pick(affordableBuyers),
                        amount,
                        expiresRound: round + tCfg.offerTtlRounds,
                        countered: false,
                    });
                    state.market.unsolicitedBidUsed = true;
                }
            }
        }
    }

    // AI clubs pick up free agents to fill short rosters (M5/M15-lite).
    if (round % market.ai.evaluateEveryRounds === 0) {
        const extCfg = externalOffers ?? externalOffersConfig;
        const freeAgents = Object.values(state.players).filter((p) => p.teamId === null && !isYouthProspect(state, p.id));
        for (const teamId of Object.keys(state.teams)) {
            if (teamId === state.userTeamId) {
                continue;
            }
            const team = state.teams[teamId];
            if (!team || team.playerIds.length >= 12 || freeAgents.length === 0) {
                continue;
            }
            const needs = teamNeeds(state, teamId, market);
            const needed = needs.filter((n) => n.need > 0).map((n) => n.position);
            const pool = freeAgents.filter((p) => {
                if (needed.length > 0 && !needed.includes(p.position)) {
                    return false;
                }
                const { ratio } = playerSeasonBreakthrough(state, p.id, extCfg);
                return canClubSignElite(state, teamId, p, ratio, market, extCfg);
            });
            const signing = pool.sort(
                (a, b) =>
                    overallRating(b.attributes) +
                    aiSigningBoost(state, b.id, teamId) -
                    (overallRating(a.attributes) + aiSigningBoost(state, a.id, teamId)),
            )[0];
            if (signing) {
                const salary = baseSalary(overallRating(signing.attributes), economy);
                if (!aiCanSignFreeAgent(state, teamId, salary, economy, leagueConfig)) {
                    continue;
                }
                signing.teamId = teamId;
                signing.contract = { salary, yearsLeft: 1 };
                team.playerIds.push(signing.id);
                freeAgents.splice(freeAgents.indexOf(signing), 1);
            }
        }
    }

    if (externalOffers) {
        tickExternalOffers(state, economy, externalOffers, market);
    }
}

function isYouthProspect(state: GameState, playerId: PlayerId): boolean {
    return state.market.youthProspects.some((p) => p.player.id === playerId);
}

function remainingYouthSeasonCapacity(state: GameState, market: MarketConfig): number {
    const arrived = state.market.youthArrivalsThisSeason ?? 0;
    return Math.max(0, market.youth.maxProspectsPerSeason - arrived);
}

function recordYouthArrivals(state: GameState, count: number): void {
    state.market.youthArrivalsThisSeason = (state.market.youthArrivalsThisSeason ?? 0) + count;
}

function youthProspectPresentation(
    player: Player,
    market: MarketConfig,
    academyLevel: number,
    decideByRound: number,
    fixed?: YouthAcademyProspectDef,
): YouthProspect {
    const y = market.youth;
    const band = interpolateFacilityValue(y.starBandByLevel, academyLevel);
    const trueStars = 1 + ((player.potential - 40) / 59) * 4;
    return {
        player,
        starMin: fixed?.starMin ?? Math.max(1, Math.round((trueStars - band / 2) * 2) / 2),
        starMax: fixed?.starMax ?? Math.min(5, Math.round((trueStars + band / 2) * 2) / 2),
        quoteIndex: fixed?.quoteIndex ?? hashString(player.id) % y.coachQuotes,
        decideByRound,
        academySeasons: 0,
    };
}

function fixedYouthNameKey(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`;
}

function fixedYouthAlreadyPresent(state: GameState, playerId: PlayerId): boolean {
    const player = state.players[playerId];
    if (player) {
        if (player.teamId !== null) {
            return true;
        }
        return state.market.youthProspects.some((p) => p.player.id === playerId);
    }
    return state.market.youthProspects.some((p) => p.player.id === playerId);
}

function addFixedYouthProspect(state: GameState, market: MarketConfig, economy: EconomyConfig, def: YouthAcademyProspectDef): YouthProspect | null {
    if (fixedYouthAlreadyPresent(state, def.id)) {
        return null;
    }
    if (remainingYouthSeasonCapacity(state, market) <= 0) {
        return null;
    }
    const y = market.youth;
    const player: Player = {
        id: def.id,
        firstName: def.firstName,
        lastName: def.lastName,
        nationality: 'CZE',
        age: Math.max(16, state.seasonYear - def.born),
        heightCm: def.heightCm,
        position: def.position,
        attributes: { ...def.attributes },
        potential: def.potential,
        fatigue: 0,
        morale: 75,
        injury: null,
        teamId: null,
        contract: null,
    };
    state.players[player.id] = player;
    const prospect = youthProspectPresentation(
        player,
        market,
        effectiveFacilityLevel(state, 'academy', economy),
        state.currentRound + y.decisionRounds,
        def,
    );
    state.market.youthProspects.push(prospect);
    recordYouthArrivals(state, 1);
    return prospect;
}

function unreleasedFixedYouthProspects(state: GameState, teamId: TeamId): YouthAcademyProspectDef[] {
    return youthAcademyProspectsForTeam(teamId).filter((def) => !fixedYouthAlreadyPresent(state, def.id));
}

/** Queues the next unreleased real academy talents for this season (paced, not all at once). */
export function scheduleFixedYouthProspects(
    state: GameState,
    teamId: TeamId,
    rng: Rng,
    deadlineRound: number,
    market: MarketConfig,
): FixedYouthArrival[] {
    const limit = Math.min(
        market.youth.fixedProspectsPerSeason,
        remainingYouthSeasonCapacity(state, market),
    );
    const due = unreleasedFixedYouthProspects(state, teamId).slice(0, limit);
    const arrivals = due.map((def) => ({
        playerId: def.id,
        arriveRound: rng.int(1, deadlineRound),
    }));
    state.market.pendingFixedYouthArrivals = arrivals;
    return arrivals;
}

/** Surfaces scheduled real academy talents whose arrival round has been reached. */
export function releaseFixedYouthProspects(
    state: GameState,
    market: MarketConfig,
    economy: EconomyConfig,
    completedRound: number,
): YouthProspect[] {
    const deadline = market.youth.fixedAcademyDeadlineRound;
    const due = state.market.pendingFixedYouthArrivals.filter(
        (arrival) => arrival.arriveRound <= completedRound || completedRound >= deadline,
    );
    const added: YouthProspect[] = [];
    const releasedIds = new Set<PlayerId>();
    for (const arrival of due) {
        if (releasedIds.has(arrival.playerId)) {
            continue;
        }
        const def = youthAcademyProspectById(arrival.playerId);
        if (!def || def.teamId !== state.userTeamId) {
            continue;
        }
        const prospect = addFixedYouthProspect(state, market, economy, def);
        if (prospect) {
            added.push(prospect);
        }
        releasedIds.add(arrival.playerId);
    }
    state.market.pendingFixedYouthArrivals = state.market.pendingFixedYouthArrivals.filter(
        (arrival) => !releasedIds.has(arrival.playerId),
    );
    return added;
}

// ---------- youth intake (M11-M13) ----------

export function runYouthIntake(
    state: GameState,
    market: MarketConfig,
    economy: EconomyConfig,
    pools: NamePools,
    rng: Rng,
    options?: { count?: number; markDone?: boolean },
): YouthProspect[] {
    const y = market.youth;
    const academyLevel = effectiveFacilityLevel(state, 'academy', economy);
    const requested = options?.count ?? 1 + Math.floor(academyLevel / 2);
    const count = Math.min(requested, remainingYouthSeasonCapacity(state, market));
    const band = interpolateFacilityValue(y.starBandByLevel, academyLevel);
    const reservedNames = new Set(
        youthAcademyProspectsForTeam(state.userTeamId).map((p) => fixedYouthNameKey(p.firstName, p.lastName)),
    );
    const used = new Set<string>([
        ...Object.values(state.players).map((p) => `${p.firstName} ${p.lastName}`),
        ...reservedNames,
    ]);
    const prospects: YouthProspect[] = [];
    for (let i = 0; i < count; i++) {
        const name = generateName(rng, pools, used);
        const position = rng.pick(POSITIONS);
        const potential = Math.min(99, y.potentialBase + academyLevel * y.potentialPerAcademyLevel + rng.int(0, y.potentialRandom));
        const share = y.overallShareMin + rng.next() * (y.overallShareMax - y.overallShareMin);
        const targetOverall = Math.max(25, Math.round(potential * share));
        const attributes = {} as Player['attributes'];
        for (const key of ATTRIBUTE_KEYS) {
            attributes[key] = Math.max(1, Math.min(99, targetOverall + rng.int(-8, 8)));
        }
        const player: Player = {
            id: `YTH-${state.seasonYear}-${state.market.youthProspects.length + prospects.length + 1}`,
            firstName: name.firstName,
            lastName: name.lastName,
            nationality: 'CZE',
            age: rng.int(y.ageMin, y.ageMax),
            heightCm: rng.int(185, 210),
            position,
            attributes,
            potential,
            fatigue: 0,
            morale: 75,
            injury: null,
            teamId: null,
            contract: null,
        };
        // Star presentation: potential mapped to 1..5 stars, blurred by band.
        const trueStars = 1 + ((potential - 40) / 59) * 4;
        const starMin = Math.max(1, Math.round((trueStars - band / 2) * 2) / 2);
        const starMax = Math.min(5, Math.round((trueStars + band / 2) * 2) / 2);
        prospects.push({
            player,
            starMin,
            starMax,
            quoteIndex: rng.int(0, y.coachQuotes - 1),
            decideByRound: state.currentRound + y.decisionRounds,
            academySeasons: 0,
        });
        state.players[player.id] = player;
    }
    state.market.youthProspects.push(...prospects);
    recordYouthArrivals(state, prospects.length);
    if (options?.markDone !== false) {
        state.market.youthIntakeDone = true;
    }
    void economy;
    return prospects;
}

/** Players brought up from the club's own academy carry the YTH id prefix. */
export function isAcademyPlayer(player: Player): boolean {
    return player.id.startsWith('YTH-');
}

/**
 * Sends a signed academy talent back to the junior team: he leaves the
 * roster and contract and reappears among the prospects (invitable again).
 */
export function returnYouthToAcademy(state: GameState, playerId: PlayerId, market: MarketConfig, economy: EconomyConfig): boolean {
    const player = state.players[playerId];
    const userTeam = state.teams[state.userTeamId];
    if (!player || !userTeam || player.teamId !== state.userTeamId || !isAcademyPlayer(player)) {
        return false;
    }
    if (userTeam.playerIds.length <= market.roster.minPlayers) {
        return false;
    }
    removeFromTeam(state, player);
    player.contract = null;
    player.morale = Math.max(0, player.morale - market.youth.returnMoralePenalty);
    unlistPlayer(state, playerId);

    // Rebuild the scout presentation from the current academy level.
    const fixed = youthAcademyProspectById(player.id);
    state.market.youthProspects.push(
        youthProspectPresentation(player, market, effectiveFacilityLevel(state, 'academy', economy), state.currentRound, fixed),
    );
    return true;
}

/** Buyout cost for terminating a contract early. */
export function contractBuyout(player: Player, market: MarketConfig): number {
    const contract = player.contract;
    if (!contract) {
        return 0;
    }
    return Math.round((contract.salary * contract.yearsLeft * market.contracts.buyoutFactor) / 10_000) * 10_000;
}

/**
 * Terminates a player's contract: pays the buyout, drops him to the
 * free-agent pool, and dents the locker-room morale.
 */
export function releasePlayer(
    state: GameState,
    playerId: PlayerId,
    market: MarketConfig,
    economy: EconomyConfig,
): 'released' | 'rosterMin' | 'cantAfford' | 'invalid' {
    const player = state.players[playerId];
    const userTeam = state.teams[state.userTeamId];
    if (!player || !userTeam || player.teamId !== state.userTeamId) {
        return 'invalid';
    }
    if (userTeam.playerIds.length <= market.roster.minPlayers) {
        return 'rosterMin';
    }
    const buyout = contractBuyout(player, market);
    if (buyout > state.club.budget) {
        return 'cantAfford';
    }
    removeFromTeam(state, player);
    unlistPlayer(state, playerId);
    player.contract = null;
    player.morale = Math.max(0, player.morale - 15);
    if (buyout > 0) {
        pushLedger(state, economy, 'buyout', -buyout);
    }
    for (const id of userTeam.playerIds) {
        const mate = state.players[id];
        if (mate) {
            mate.morale = Math.max(0, mate.morale - market.contracts.releaseTeamMorale);
        }
    }
    return 'released';
}

export function signYouth(
    state: GameState,
    prospectPlayerId: PlayerId,
    market: MarketConfig,
    economy: EconomyConfig,
): 'signed' | 'rosterFull' | 'wageBudgetExceeded' | 'projectedDeficit' | 'invalid' {
    const prospect = state.market.youthProspects.find((p) => p.player.id === prospectPlayerId);
    const userTeam = state.teams[state.userTeamId];
    if (!prospect || !userTeam) {
        return 'invalid';
    }
    if (userTeam.playerIds.length >= market.roster.maxPlayers) {
        return 'rosterFull';
    }
    if (financeWarningTier(state, economy, leagueConfig) === 'red') {
        return 'projectedDeficit';
    }
    prospect.player.teamId = state.userTeamId;
    prospect.player.contract = { salary: market.youth.salary, yearsLeft: market.youth.years };
    userTeam.playerIds.push(prospect.player.id);
    state.market.youthProspects = state.market.youthProspects.filter((p) => p.player.id !== prospectPlayerId);
    return 'signed';
}

export function releaseYouth(state: GameState, prospectPlayerId: PlayerId): void {
    state.market.youthProspects = state.market.youthProspects.filter((p) => p.player.id !== prospectPlayerId);
    delete state.players[prospectPlayerId];
}

export function releaseExpiredPlayer(state: GameState, player: Player): void {
    removeFromTeam(state, player);
    player.contract = null;
    unlistPlayer(state, player.id);
}

export interface YouthGraduateResult {
    count: number;
    staged: StagedMovement[];
}

/** Unsigned academy prospects who exceed maxUnsignedSeasons enter the FA pool at rollover. */
export function graduateUnsignedYouthProspects(state: GameState, maxUnsignedSeasons: number): YouthGraduateResult {
    const remaining: YouthProspect[] = [];
    const staged: StagedMovement[] = [];
    for (const prospect of state.market.youthProspects) {
        const player = prospect.player;
        if (player.teamId !== null) {
            remaining.push(prospect);
            continue;
        }
        prospect.academySeasons++;
        if (prospect.academySeasons >= maxUnsignedSeasons) {
            staged.push(stageMovement(state, player, 'freeAgent', 'youthGraduate'));
            player.contract = null;
            unlistPlayer(state, player.id);
            continue;
        }
        remaining.push(prospect);
    }
    state.market.youthProspects = remaining;
    return { count: staged.length, staged };
}

/** Top up the free-agent pool with generated journeymen. */
export function replenishFreeAgents(
    state: GameState,
    targetCount: number,
    pools: NamePools,
    balance: BalanceConfig,
    rng: Rng,
): number {
    const current = Object.values(state.players).filter(
        (p) => p.teamId === null && p.contract === null && !isYouthProspect(state, p.id),
    ).length;
    const needed = Math.max(0, targetCount - current);
    let added = 0;
    for (let i = 0; i < needed; i++) {
        const [agent] = generateFreeAgents(rng.fork(`fa:${i}`), 1, pools, balance);
        if (!agent) {
            continue;
        }
        agent.id = `FA-${state.seasonYear}-${Object.keys(state.players).length + added + 1}`;
        state.players[agent.id] = agent;
        added++;
    }
    return added;
}

/** AI clubs auto-renew expiring contracts with importance- and nationality-aware logic. */
export function runAiContractRenewals(state: GameState, market: MarketConfig, economy: EconomyConfig, rng: Rng): AiRenewalResult {
    return runSmartAiContractRenewals(state, market, economy, externalOffersConfig, contractDemand, rng);
}

