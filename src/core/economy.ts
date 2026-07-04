import type { EconomyConfig, FacilityKey } from '../config/economy';
import type { LeagueConfig } from '../config/league';
import type { GameState, LedgerEntry, SponsorDeal, SponsorOffer } from './model/types';
import { ATTRIBUTE_KEYS } from './model/types';
import type { Rng } from './rng';

function pushLedger(state: GameState, economy: EconomyConfig, entry: LedgerEntry): void {
    state.club.ledger.push(entry);
    if (state.club.ledger.length > economy.ledgerCapacity) {
        state.club.ledger.splice(0, state.club.ledger.length - economy.ledgerCapacity);
    }
    state.club.budget += entry.amount;
}

export function playerSalary(state: GameState, playerId: string, economy: EconomyConfig): number {
    const player = state.players[playerId];
    if (!player) {
        return 0;
    }
    const overall = ATTRIBUTE_KEYS.reduce((s, k) => s + player.attributes[k], 0) / ATTRIBUTE_KEYS.length;
    return Math.max(economy.salary.min, Math.round(economy.salary.base + (overall - 50) * economy.salary.perPoint));
}

export function arenaCapacity(state: GameState, economy: EconomyConfig, realCapacity: number | null): number {
    const level = state.club.facilities.arena;
    if (realCapacity) {
        const scale = economy.facilities.arenaCapacityScale[level - 1] ?? 1;
        return Math.round(realCapacity * scale);
    }
    return economy.facilities.arenaCapacityByLevel[level - 1] ?? 1500;
}

export function facilityUpgradeCost(state: GameState, key: FacilityKey, economy: EconomyConfig): number | null {
    const level = state.club.facilities[key];
    if (level >= economy.facilities.maxLevel) {
        return null;
    }
    return economy.facilities.upgradeCost[key][level] ?? null;
}

/** Pays for and applies a facility upgrade. Returns false when not affordable. */
export function upgradeFacility(state: GameState, key: FacilityKey, economy: EconomyConfig): boolean {
    const cost = facilityUpgradeCost(state, key, economy);
    if (cost === null || state.club.budget < cost) {
        return false;
    }
    state.club.facilities[key]++;
    pushLedger(state, economy, { round: state.currentRound, kind: 'upgrade', amount: -cost });
    return true;
}

export interface RoundEconomyResult {
    ticketIncome: number;
    sponsorIncome: number;
    salaries: number;
    maintenance: number;
}

/**
 * Books one round of the user club's economy. `playedHome` toggles gate
 * receipts; wins drive fan support and sponsor relationships.
 */
export function roundEconomyTick(
    state: GameState,
    input: { playedHome: boolean; won: boolean; margin: number; realArenaCapacity: number | null; totalRounds: number },
    economy: EconomyConfig,
    rng: Rng,
): RoundEconomyResult {
    const club = state.club;

    // Fan support drift.
    const fans = economy.fanSupport;
    let drift = input.won ? fans.winDrift : fans.lossDrift;
    if (input.won && input.margin >= 15) {
        drift += fans.blowoutBonus;
    }
    club.fanSupport = Math.max(fans.min, Math.min(fans.max, club.fanSupport + drift));

    // Gate receipts for home games.
    let ticketIncome = 0;
    if (input.playedHome) {
        const t = economy.tickets;
        const attendanceRate = Math.max(
            t.minAttendance,
            Math.min(t.maxAttendance, t.baseAttendance + (club.fanSupport / 100) * t.fanSupportWeight),
        );
        const capacity = arenaCapacity(state, economy, input.realArenaCapacity);
        ticketIncome = Math.round(capacity * attendanceRate * t.price);
        pushLedger(state, economy, { round: state.currentRound, kind: 'tickets', amount: ticketIncome });
    }

    // Sponsor payments and relationship drift.
    const s = economy.sponsors;
    let sponsorIncome = 0;
    for (const deal of club.sponsors) {
        deal.relationship = Math.max(0, Math.min(100, deal.relationship + (input.won ? s.winDrift : s.lossDrift)));
        const mult = s.relationMinMult + (s.relationMaxMult - s.relationMinMult) * (deal.relationship / 100);
        sponsorIncome += Math.round(deal.perRound * mult);
    }
    if (sponsorIncome > 0) {
        pushLedger(state, economy, { round: state.currentRound, kind: 'sponsors', amount: sponsorIncome });
    }
    club.sponsors = club.sponsors.filter((deal) => deal.relationship >= s.terminateBelow);

    // Salaries and maintenance.
    const team = state.teams[state.userTeamId];
    const salaries = team
        ? Math.round(team.playerIds.reduce((sum, id) => sum + playerSalary(state, id, economy), 0) / input.totalRounds)
        : 0;
    if (salaries > 0) {
        pushLedger(state, economy, { round: state.currentRound, kind: 'salaries', amount: -salaries });
    }
    const levels = Object.values(club.facilities).reduce((a, b) => a + b, 0);
    const maintenance = levels * economy.facilities.maintenancePerLevelPerRound;
    pushLedger(state, economy, { round: state.currentRound, kind: 'maintenance', amount: -maintenance });

    // New sponsor offers for free slots.
    generateSponsorOffers(state, economy, rng);
    club.sponsorOffers = club.sponsorOffers.filter((o) => o.expiresRound >= state.currentRound);

    return { ticketIncome, sponsorIncome, salaries, maintenance };
}

function generateSponsorOffers(state: GameState, economy: EconomyConfig, rng: Rng): void {
    const s = economy.sponsors;
    const club = state.club;
    const freeSlots = s.slots - club.sponsors.length;
    if (freeSlots <= 0 || club.sponsorOffers.length >= freeSlots || !rng.chance(s.offerChancePerRound)) {
        return;
    }
    // Offer quality follows fan support.
    const tierBase = 1 + Math.floor((club.fanSupport / 100) * 3);
    const tier = Math.max(1, Math.min(5, tierBase + rng.int(-1, 1)));
    const usedBrands = new Set([...club.sponsors.map((d) => d.brandKey), ...club.sponsorOffers.map((o) => o.brandKey)]);
    const brands = s.brands.filter((b) => !usedBrands.has(b));
    if (brands.length === 0) {
        return;
    }
    club.sponsorOffers.push({
        id: `offer-${state.currentRound}-${rng.int(0, 9999)}`,
        brandKey: rng.pick(brands),
        tier,
        perRound: s.perRoundByTier[tier - 1] ?? 100_000,
        seasons: rng.int(s.offerSeasonsMin, s.offerSeasonsMax),
        expiresRound: state.currentRound + 3,
    });
}

export function acceptSponsorOffer(state: GameState, offerId: string, economy: EconomyConfig): boolean {
    const club = state.club;
    const index = club.sponsorOffers.findIndex((o) => o.id === offerId);
    if (index === -1 || club.sponsors.length >= economy.sponsors.slots) {
        return false;
    }
    const offer = club.sponsorOffers[index] as SponsorOffer;
    club.sponsorOffers.splice(index, 1);
    const deal: SponsorDeal = {
        id: offer.id,
        brandKey: offer.brandKey,
        tier: offer.tier,
        perRound: offer.perRound,
        seasonsRemaining: offer.seasons,
        relationship: economy.sponsors.startRelationship,
    };
    club.sponsors.push(deal);
    return true;
}

export function rejectSponsorOffer(state: GameState, offerId: string): void {
    state.club.sponsorOffers = state.club.sponsorOffers.filter((o) => o.id !== offerId);
}

/** Applies a press-conference (or story) sponsor-relationship delta to all deals. */
export function driftSponsorRelations(state: GameState, delta: number): void {
    for (const deal of state.club.sponsors) {
        deal.relationship = Math.max(0, Math.min(100, deal.relationship + delta));
    }
}

/** Resolve the real arena capacity of a team from league config, if known. */
export function realArenaCapacity(league: LeagueConfig, teamId: string): number | null {
    const def = league.teams.find((t) => t.id === teamId);
    return def && 'arenaCapacity' in def ? ((def as { arenaCapacity?: number | null }).arenaCapacity ?? null) : null;
}
