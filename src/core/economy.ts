import type { BclConfig } from '../config/bcl';
import type { EconomyConfig, FacilityKey } from '../config/economy';
import type { FecConfig } from '../config/fec';
import { leagueConfig } from '../config/league';
import { difficultyModifiers, resolveDifficulty } from './difficulty';
import { computeNblStandings } from './league/standings';
import type { LeagueConfig, TeamDef } from '../config/league';
import type { BclPhase, CompetitionState, FecPhase, Fixture, GameState, LedgerEntry, NblPlayoffFinish, SponsorDeal, SponsorOffer, TeamFinance, TeamId } from './model/types';
import { ATTRIBUTE_KEYS } from './model/types';
import type { Rng } from './rng';

/** Starting season budget for a club, scaled by its league tier (1..5). */
export function startingBudgetForTeam(teamDef: TeamDef, economy: EconomyConfig): number {
    const tier = Math.max(1, Math.min(5, Math.round(teamDef.tier)));
    return economy.startingBudgetByTier[tier - 1] ?? economy.startingBudget;
}

/** Per-round upkeep for facility levels (arena + training + academy). */
export function facilityMaintenancePerRound(
    facilities: { arena: number; training: number; academy: number },
    economy: EconomyConfig,
): number {
    const table = economy.facilities.maintenancePerLevelPerRound;
    let total = 0;
    for (const level of Object.values(facilities)) {
        total += table[level] ?? table[table.length - 1] ?? 10_000;
    }
    return total;
}

/** Default AI upkeep assuming level-1 facilities. */
export function aiFacilityMaintenancePerRound(economy: EconomyConfig): number {
    const levelOne = economy.facilities.maintenancePerLevelPerRound[1] ?? 10_000;
    return levelOne * 3;
}

/** User club tier (1..5) for economy scaling. */
export function userTeamTier(state: GameState): number {
    return teamTier(state.userTeamId, leagueConfig);
}

/** Club tier (1..5) from league config. */
export function teamTier(teamId: TeamId, league: LeagueConfig): number {
    const def = league.teams.find((t) => t.id === teamId);
    return Math.max(1, Math.min(5, Math.round(def?.tier ?? 3)));
}

/** Weekly NBL league-share payment for a club tier; top-4 clubs earn a bonus. */
export function leagueSharePerRound(
    teamId: TeamId,
    economy: EconomyConfig,
    league: LeagueConfig,
    state?: GameState,
): number {
    const tier = teamTier(teamId, league);
    let share = economy.leagueSharePerRoundByTier[tier - 1] ?? 0;
    if (state && (economy.leagueShareTop4Bonus ?? 0) > 0) {
        const standings = computeNblStandings(state);
        const rank = standings.findIndex((row) => row.teamId === teamId) + 1;
        if (rank > 0 && rank <= 4) {
            share = Math.round(share * (1 + economy.leagueShareTop4Bonus));
        }
    }
    return share;
}

/** Initialize AI NBL club finances (excludes user team). */
export function createNblFinances(league: LeagueConfig, economy: EconomyConfig, userTeamId: TeamId): Record<TeamId, TeamFinance> {
    const finances: Record<TeamId, TeamFinance> = {};
    for (const teamDef of league.teams) {
        if (teamDef.id === userTeamId) {
            continue;
        }
        const tier = teamTier(teamDef.id, league);
        finances[teamDef.id] = {
            budget: startingBudgetForTeam(teamDef, economy),
            fanSupport: economy.fanSupport.start,
            sponsorTier: tier,
            facilities: { arena: 1, training: 1, academy: 1 },
            roundsSinceFacilityUpgrade: 0,
        };
    }
    return finances;
}

export function aiTeamFinance(state: GameState, teamId: TeamId): TeamFinance | null {
    return state.nblFinances[teamId] ?? null;
}

export function teamSeasonWageBill(state: GameState, teamId: TeamId, economy: EconomyConfig): number {
    const team = state.teams[teamId];
    if (!team) {
        return 0;
    }
    return team.playerIds.reduce((sum, id) => sum + playerSalary(state, id, economy), 0);
}

/** Round a sponsor signing fee to the configured step (25k CZK). */
export function roundSponsorSigningBonus(amount: number, economy: EconomyConfig): number {
    const step = economy.sponsors.signingBonusRoundStep;
    return Math.round(amount / step) * step;
}

/** Scale an ambition profile signing bonus by club tier before payment. */
export function scaledSponsorSigningBonus(signingBonus: number, teamTier: number, economy: EconomyConfig): number {
    const tier = Math.max(1, Math.min(5, Math.round(teamTier)));
    const s = economy.sponsors;
    const scaled = signingBonus * (s.signingBonusTierBase + s.signingBonusTierStep * tier);
    return roundSponsorSigningBonus(scaled, economy);
}

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
    if (player.contract) {
        return player.contract.salary;
    }
    const overall = ATTRIBUTE_KEYS.reduce((s, k) => s + player.attributes[k], 0) / ATTRIBUTE_KEYS.length;
    const ovr = Math.round(overall);
    let perPoint: number = economy.salary.perPoint;
    if (ovr > 80) {
        perPoint = economy.salary.perPointElite;
    } else if (ovr > 70) {
        perPoint = economy.salary.perPointMid;
    }
    return Math.max(economy.salary.min, Math.round(economy.salary.base + (ovr - 50) * perPoint));
}

export function arenaCapacity(state: GameState, economy: EconomyConfig, realCapacity: number | null): number {
    const level = effectiveFacilityLevel(state, 'arena', economy);
    if (realCapacity) {
        const scale = interpolateFacilityValue(economy.facilities.arenaCapacityScale, level);
        return Math.round(realCapacity * scale);
    }
    return Math.round(interpolateFacilityValue(economy.facilities.arenaCapacityByLevel, level));
}

/** Interpolate a per-level table using a fractional facility level (1..5). */
export function interpolateFacilityValue(values: readonly number[], effectiveLevel: number): number {
    const clamped = Math.max(1, Math.min(values.length, effectiveLevel));
    const lowIdx = Math.floor(clamped) - 1;
    const highIdx = Math.ceil(clamped) - 1;
    const frac = clamped - Math.floor(clamped);
    const low = values[lowIdx] ?? values[0] ?? 0;
    const high = values[highIdx] ?? low;
    return low * (1 - frac) + high * frac;
}

/** Progress of an in-flight upgrade, 0 at start and 1 when complete. */
export function facilityProjectProgress(state: GameState, key: FacilityKey): number | null {
    const project = state.club.facilityProjects[key];
    if (!project) {
        return null;
    }
    const duration = project.completesRound - project.startedRound;
    if (duration <= 0) {
        return 1;
    }
    return Math.max(0, Math.min(1, (state.currentRound - project.startedRound) / duration));
}

/** Effective facility level; ramps gradually while an upgrade is in progress. */
export function effectiveFacilityLevel(state: GameState, key: FacilityKey, _economy: EconomyConfig): number {
    const base = state.club.facilities[key];
    const project = state.club.facilityProjects[key];
    if (!project) {
        return base;
    }
    const progress = facilityProjectProgress(state, key) ?? 0;
    return (project.targetLevel - 1) + progress;
}

/** Rounds remaining until an in-progress upgrade finishes (0 when done this round). */
export function facilityProjectRoundsLeft(state: GameState, key: FacilityKey): number | null {
    const project = state.club.facilityProjects[key];
    if (!project) {
        return null;
    }
    return Math.max(0, project.completesRound - state.currentRound);
}

/** Complete facility projects whose construction time has elapsed. */
export function tickFacilityProjects(state: GameState): FacilityKey[] {
    const completed: FacilityKey[] = [];
    for (const key of ['arena', 'training', 'academy'] as FacilityKey[]) {
        const project = state.club.facilityProjects[key];
        if (!project || state.currentRound < project.completesRound) {
            continue;
        }
        state.club.facilities[key] = project.targetLevel;
        delete state.club.facilityProjects[key];
        completed.push(key);
    }
    return completed;
}

/** Training development multiplier from the effective training facility level. */
export function trainingDevMultiplier(state: GameState, economy: EconomyConfig): number {
    return interpolateFacilityValue(economy.facilities.trainingDevMultiplier, effectiveFacilityLevel(state, 'training', economy));
}

/** Fair ticket price fans will tolerate at the current support level. */
export function fairTicketPrice(fanSupport: number, economy: EconomyConfig): number {
    const t = economy.tickets;
    return Math.round(t.referencePrice * (t.fairPriceBase + t.fairPriceSupportWeight * (fanSupport / 100)));
}

/** Base attendance share from fan support only (no ticket price effect). */
export function baseAttendanceRate(fanSupport: number, economy: EconomyConfig): number {
    const t = economy.tickets;
    const baseDemand = t.baseAttendance + (fanSupport / 100) * t.fanSupportWeight;
    return Math.max(t.minAttendance, Math.min(t.maxAttendance, baseDemand));
}

export interface GateReceipts {
    capacity: number;
    attendanceRate: number;
    ticketsSold: number;
    ticketIncome: number;
    fairPrice: number;
}

function priceDemandMultiplier(priceRatio: number, economy: EconomyConfig): number {
    const t = economy.tickets;
    if (priceRatio >= t.plateauMin && priceRatio <= t.plateauMax) {
        return 1;
    }
    if (priceRatio <= 1) {
        return 1 + (1 - priceRatio) * t.discountBoost;
    }
    return 1 / priceRatio ** t.priceElasticity;
}

/** True when two NBL teams share a configured regional derby. */
export function isDerbyMatch(teamA: TeamId, teamB: TeamId, economy: EconomyConfig): boolean {
    const [a, b] = teamA < teamB ? [teamA, teamB] : [teamB, teamA];
    return economy.derbies.pairs.some(([x, y]) => x === a && y === b);
}

/** Gate income multiplier for a home derby (1 when not a derby). */
export function derbyGateIncomeMult(homeTeamId: TeamId, awayTeamId: TeamId, economy: EconomyConfig): number {
    return isDerbyMatch(homeTeamId, awayTeamId, economy) ? economy.derbies.incomeMult : 1;
}

/** Project gate receipts from arena capacity, fan support, and ticket price. */
export function computeGateReceipts(
    fanSupport: number,
    ticketPrice: number,
    capacity: number,
    economy: EconomyConfig,
): GateReceipts {
    const t = economy.tickets;
    const fairPrice = fairTicketPrice(fanSupport, economy);
    const baseDemand = baseAttendanceRate(fanSupport, economy);
    const priceRatio = ticketPrice / fairPrice;
    const demandMultiplier = priceDemandMultiplier(priceRatio, economy);
    const attendanceRate = Math.max(
        t.minAttendance,
        Math.min(t.maxAttendance, baseDemand * demandMultiplier),
    );
    const ticketsSold = Math.round(capacity * attendanceRate);
    const ticketIncome = Math.round(ticketsSold * ticketPrice * t.incomeScale);
    return { capacity, attendanceRate, ticketsSold, ticketIncome, fairPrice };
}

/** Scale base home-court shooting boost by normalized attendance. */
export function homeCourtAdvantageFromAttendance(
    attendanceRate: number,
    economy: EconomyConfig,
    baseAdvantage: number,
): number {
    const t = economy.tickets;
    const range = t.maxAttendance - t.minAttendance;
    const normalized = range > 0 ? (attendanceRate - t.minAttendance) / range : 1;
    const clamped = Math.max(0, Math.min(1, normalized));
    const mult = t.homeAdvantageMinMult + (1 - t.homeAdvantageMinMult) * clamped;
    const scale = economy.tickets.homeAdvantageAttendanceScale ?? 1;
    return baseAdvantage * mult * scale;
}

/** Home shooting boost for a fixture; scales with user attendance when user is home. */
export function homeCourtAdvantage(
    state: GameState,
    homeTeamId: TeamId,
    economy: EconomyConfig,
    league: LeagueConfig,
    baseAdvantage: number,
    ticketPriceOverride?: number,
): number {
    if (homeTeamId !== state.userTeamId) {
        return baseAdvantage;
    }
    const t = economy.tickets;
    const attendanceRate = t.homeAdvantageFromPrice
        ? computeGateReceipts(
            state.club.fanSupport,
            ticketPriceOverride ?? state.club.ticketPrice,
            arenaCapacity(state, economy, realArenaCapacity(league, homeTeamId)),
            economy,
        ).attendanceRate
        : baseAttendanceRate(state.club.fanSupport, economy);
    return homeCourtAdvantageFromAttendance(attendanceRate, economy, baseAdvantage);
}

/** Format home advantage as a display percentage (e.g. 1.3 for +1.3%). */
export function homeAdvantageDisplayPct(advantage: number): number {
    return Math.round(advantage * 1000) / 10;
}

/** Clamp and round a ticket price to valid bounds. */
export function clampTicketPrice(price: number, economy: EconomyConfig): number {
    const t = economy.tickets;
    const clamped = Math.max(t.minPrice, Math.min(t.maxPrice, price));
    const steps = Math.round((clamped - t.minPrice) / t.priceStep);
    return t.minPrice + steps * t.priceStep;
}

/** Set the club ticket price, clamped to config bounds. */
export function setTicketPrice(state: GameState, price: number, economy: EconomyConfig): number {
    const clamped = clampTicketPrice(price, economy);
    state.club.ticketPrice = clamped;
    return clamped;
}

export function facilityUpgradeCost(state: GameState, key: FacilityKey, economy: EconomyConfig): number | null {
    if (state.club.facilityProjects[key]) {
        return null;
    }
    const level = state.club.facilities[key];
    if (level >= economy.facilities.maxLevel) {
        return null;
    }
    return economy.facilities.upgradeCost[key][level] ?? null;
}

/** Pays for and starts a facility upgrade. Benefits ramp over several rounds. */
export function upgradeFacility(state: GameState, key: FacilityKey, economy: EconomyConfig): boolean {
    const cost = facilityUpgradeCost(state, key, economy);
    if (cost === null || state.club.budget < cost) {
        return false;
    }
    const targetLevel = state.club.facilities[key] + 1;
    const rounds = economy.facilities.upgradeRounds[key][targetLevel - 1] ?? 4;
    state.club.facilityProjects[key] = {
        targetLevel,
        startedRound: state.currentRound,
        completesRound: state.currentRound + rounds,
    };
    pushLedger(state, economy, { round: state.currentRound, kind: 'upgrade', amount: -cost });
    return true;
}

export interface RoundEconomyResult {
    ticketIncome: number;
    sponsorIncome: number;
    leagueShare: number;
    europeanIncome: number;
    europeanExpenses: number;
    salaries: number;
    maintenance: number;
}

/**
 * Books one round of the user club's economy. `playedHome` toggles gate
 * receipts; wins drive fan support and sponsor relationships.
 */
export function roundEconomyTick(
    state: GameState,
    input: {
        playedHome: boolean;
        opponentTeamId?: TeamId;
        won: boolean;
        margin: number;
        realArenaCapacity: number | null;
        totalRounds: number;
    },
    economy: EconomyConfig,
    league: LeagueConfig,
    rng: Rng,
): RoundEconomyResult {
    const club = state.club;

    // Fan support drift from match result.
    const fans = economy.fanSupport;
    let drift = input.won ? fans.winDrift : fans.lossDrift;
    if (input.won && input.margin >= 15) {
        drift += fans.blowoutBonus;
    }

    // Gate receipts for home games.
    let ticketIncome = 0;
    if (input.playedHome) {
        const t = economy.tickets;
        const capacity = arenaCapacity(state, economy, input.realArenaCapacity);
        const gate = computeGateReceipts(club.fanSupport, club.ticketPrice, capacity, economy);
        const derbyMult = input.opponentTeamId
            ? derbyGateIncomeMult(state.userTeamId, input.opponentTeamId, economy)
            : 1;
        ticketIncome = Math.round(gate.ticketIncome * derbyMult);
        const incomeMult = difficultyModifiers(resolveDifficulty(state.difficulty)).userIncomeMult;
        ticketIncome = Math.round(ticketIncome * incomeMult);
        pushLedger(state, economy, { round: state.currentRound, kind: 'tickets', amount: ticketIncome });

        // Subtle fan drift from pricing relative to fair price.
        const fairPrice = gate.fairPrice;
        if (club.ticketPrice > fairPrice * t.overpriceBand) {
            drift += t.overpriceFanDrift;
        } else if (club.ticketPrice < fairPrice * t.underpriceBand) {
            drift += t.underpriceFanDrift;
        }
    }

    club.fanSupport = Math.max(fans.min, Math.min(fans.max, club.fanSupport + drift));

    // Sponsor payments and relationship drift.
    const s = economy.sponsors;
    let sponsorIncome = 0;
    for (const deal of club.sponsors) {
        deal.relationship = Math.max(0, Math.min(100, deal.relationship + (input.won ? s.winDrift : s.lossDrift)));
        const mult = s.relationMinMult + (s.relationMaxMult - s.relationMinMult) * (deal.relationship / 100);
        sponsorIncome += Math.round(deal.perRound * mult);
    }
    const incomeMult = difficultyModifiers(resolveDifficulty(state.difficulty)).userIncomeMult;
    sponsorIncome = Math.round(sponsorIncome * incomeMult);
    if (sponsorIncome > 0) {
        pushLedger(state, economy, { round: state.currentRound, kind: 'sponsors', amount: sponsorIncome });
    }
    club.sponsors = club.sponsors.filter((deal) => deal.relationship >= s.terminateBelow);

    const leagueShare = Math.round(leagueSharePerRound(state.userTeamId, economy, league, state) * incomeMult);
    if (leagueShare > 0) {
        pushLedger(state, economy, { round: state.currentRound, kind: 'leagueShare', amount: leagueShare });
    }

    // Salaries and maintenance.
    const team = state.teams[state.userTeamId];
    const salaries = team
        ? Math.round(team.playerIds.reduce((sum, id) => sum + playerSalary(state, id, economy), 0) / input.totalRounds)
        : 0;
    if (salaries > 0) {
        pushLedger(state, economy, { round: state.currentRound, kind: 'salaries', amount: -salaries });
    }
    const maintenance = facilityMaintenancePerRound(club.facilities, economy);
    pushLedger(state, economy, { round: state.currentRound, kind: 'maintenance', amount: -maintenance });

    // New sponsor offers for free slots.
    generateSponsorOffers(state, economy, rng);
    club.sponsorOffers = club.sponsorOffers.filter((o) => o.expiresRound >= state.currentRound);

    return { ticketIncome, sponsorIncome, leagueShare, europeanIncome: 0, europeanExpenses: 0, salaries, maintenance };
}

function europeanComp(state: GameState, competitionId: 'bcl' | 'fec'): CompetitionState | null {
    return state.competitions[competitionId] ?? null;
}

function trackEuropeanWeeklyPaid(state: GameState, competitionId: 'bcl' | 'fec', amount: number): void {
    if (amount <= 0) {
        return;
    }
    const comp = europeanComp(state, competitionId);
    if (comp) {
        comp.weeklyPrizePaidTotal = (comp.weeklyPrizePaidTotal ?? 0) + amount;
    }
}

function isBclKnockoutPhase(phase: BclPhase): boolean {
    return phase === 'roundOf16' || phase === 'quarterFinals' || phase === 'finalFour';
}

function isFecKnockoutPhase(phase: FecPhase): boolean {
    return phase === 'quarterFinals' || phase === 'semiFinals' || phase === 'finals';
}

/** Books BCL/FEC match fees, participation, travel, and knockout win bonuses for one user fixture. */
export function europeanEconomyTicks(
    state: GameState,
    fixture: Fixture,
    economy: EconomyConfig,
    bcl: BclConfig,
    fec: FecConfig,
    round: number,
): { income: number; expenses: number } {
    const competitionId = fixture.competitionId;
    if (competitionId !== 'bcl' && competitionId !== 'fec') {
        return { income: 0, expenses: 0 };
    }
    if (fixture.homeTeamId !== state.userTeamId && fixture.awayTeamId !== state.userTeamId) {
        return { income: 0, expenses: 0 };
    }
    const comp = europeanComp(state, competitionId);
    if (!comp) {
        return { income: 0, expenses: 0 };
    }

    const ee = economy.european;
    const isBcl = competitionId === 'bcl';
    const isHome = fixture.homeTeamId === state.userTeamId;
    let income = 0;
    let expenses = 0;

    const participation = isBcl ? ee.weeklyParticipation.bcl : ee.weeklyParticipation.fec;
    pushLedger(state, economy, { round, kind: 'europeanParticipation', amount: participation });
    income += participation;

    const matchFee = isBcl ? ee.matchFee.bcl : ee.matchFee.fec;
    const feeKind = isBcl ? 'bclMatchFee' as const : 'fecMatchFee' as const;
    pushLedger(state, economy, { round, kind: feeKind, amount: matchFee });
    income += matchFee;

    if (!isHome) {
        const travel = isBcl ? ee.travelCost.bcl : ee.travelCost.fec;
        const travelKind = isBcl ? 'bclTravel' as const : 'fecTravel' as const;
        pushLedger(state, economy, { round, kind: travelKind, amount: -travel });
        expenses += travel;
    }

    if (fixture.result) {
        const userScore = isHome ? fixture.result.homeScore : fixture.result.awayScore;
        const oppScore = isHome ? fixture.result.awayScore : fixture.result.homeScore;
        if (userScore > oppScore) {
            const winBonus = isBcl
                ? (comp.phase === 'roundOf16' ? bcl.prizes.roundOf16Win : bcl.prizes.playoffWin)
                : fec.prizes.playoffWin;
            const inKnockout = isBcl
                ? isBclKnockoutPhase(comp.phase as BclPhase)
                : isFecKnockoutPhase(comp.phase as FecPhase);
            if (inKnockout && winBonus > 0) {
                const bonusKind = isBcl ? 'bclWinBonus' as const : 'fecWinBonus' as const;
                pushLedger(state, economy, { round, kind: bonusKind, amount: winBonus });
                income += winBonus;
            }
        }
    }

    trackEuropeanWeeklyPaid(state, competitionId, income);
    return { income, expenses };
}

export interface AiRoundEconomyInput {
    playedHome: boolean;
    opponentTeamId?: TeamId;
    won: boolean;
    margin: number;
    realArenaCapacity: number | null;
    totalRounds: number;
}

/** Books one round of an AI NBL club's economy (no ledger). */
export function aiRoundEconomyTick(
    state: GameState,
    teamId: TeamId,
    input: AiRoundEconomyInput,
    economy: EconomyConfig,
    league: LeagueConfig,
): void {
    const finance = state.nblFinances[teamId];
    if (!finance) {
        return;
    }

    const fans = economy.fanSupport;
    let drift = input.won ? fans.winDrift : fans.lossDrift;
    if (input.won && input.margin >= 15) {
        drift += fans.blowoutBonus;
    }

    let ticketIncome = 0;
    if (input.playedHome) {
        const capacity = input.realArenaCapacity
            ? Math.round(input.realArenaCapacity * interpolateFacilityValue(economy.facilities.arenaCapacityScale, 1))
            : interpolateFacilityValue(economy.facilities.arenaCapacityByLevel, 1);
        const gate = computeGateReceipts(
            finance.fanSupport,
            economy.tickets.defaultPrice,
            capacity,
            economy,
        );
        const derbyMult = input.opponentTeamId
            ? derbyGateIncomeMult(teamId, input.opponentTeamId, economy)
            : 1;
        ticketIncome = Math.round(gate.ticketIncome * derbyMult);
    }

    finance.fanSupport = Math.max(fans.min, Math.min(fans.max, finance.fanSupport + drift));

    const sponsorPerRound = economy.sponsors.perRoundByTier[finance.sponsorTier - 1] ?? 0;
    const leagueShare = leagueSharePerRound(teamId, economy, league);
    const team = state.teams[teamId];
    const salaries = team
        ? Math.round(team.playerIds.reduce((sum, id) => sum + playerSalary(state, id, economy), 0) / input.totalRounds)
        : 0;
    const maintenance = aiFacilityMaintenancePerRound(economy);

    finance.budget += ticketIncome + sponsorPerRound + leagueShare - salaries - maintenance;
}

export function creditAiBudget(state: GameState, teamId: TeamId, amount: number): void {
    const finance = state.nblFinances[teamId];
    if (finance && amount > 0) {
        finance.budget += amount;
    }
}

export function debitAiBudget(state: GameState, teamId: TeamId, amount: number): boolean {
    const finance = state.nblFinances[teamId];
    if (!finance || amount > finance.budget) {
        return false;
    }
    finance.budget -= amount;
    return true;
}

export function aiCanAffordTransferFee(state: GameState, teamId: TeamId, amount: number, maxSpendPct = 1): boolean {
    const finance = state.nblFinances[teamId];
    if (!finance) {
        return true;
    }
    const maxSpend = Math.round(finance.budget * maxSpendPct);
    return finance.budget >= amount && amount <= maxSpend;
}

/** AI club is under cash pressure and may sell at a discount (M15). */
export function aiIsCashStrapped(
    state: GameState,
    teamId: TeamId,
    economy: EconomyConfig,
    league: LeagueConfig,
    runwayWeeks: number,
): boolean {
    const finance = state.nblFinances[teamId];
    if (!finance) {
        return false;
    }
    const payrollWeeks = Math.max(22, league.teams.length - 1);
    const weeklySalaries = Math.round(teamSeasonWageBill(state, teamId, economy) / payrollWeeks);
    const weeklyBurn = weeklySalaries + aiFacilityMaintenancePerRound(economy);
    return finance.budget < weeklyBurn * runwayWeeks;
}

/** Rough wage cap for AI free-agent signings (M15-lite). */
export function aiMaxWageBill(state: GameState, teamId: TeamId, economy: EconomyConfig, league: LeagueConfig): number {
    const finance = state.nblFinances[teamId];
    if (!finance) {
        return Number.POSITIVE_INFINITY;
    }
    const teamDef = league.teams.find((t) => t.id === teamId);
    const starting = teamDef ? startingBudgetForTeam(teamDef, economy) : economy.startingBudget;
    const sponsor = economy.sponsors.perRoundByTier[finance.sponsorTier - 1] ?? 0;
    const share = leagueSharePerRound(teamId, economy, league);
    const tier = teamTier(teamId, league);
    const gate = economy.aiGateEstimatePerRoundByTier[tier - 1] ?? 45_000;
    const payrollWeeks = Math.max(22, league.teams.length - 1);
    const projectedIncome = payrollWeeks * (sponsor + share + gate) + 500_000;
    return (starting + projectedIncome) * economy.financial.wageBudgetPct;
}

export function aiCanSignFreeAgent(
    state: GameState,
    teamId: TeamId,
    salary: number,
    economy: EconomyConfig,
    league: LeagueConfig,
): boolean {
    const finance = state.nblFinances[teamId];
    if (!finance) {
        return true;
    }
    const payrollWeeks = Math.max(22, league.teams.length - 1);
    const weeklySalary = Math.round(salary / payrollWeeks);
    if (finance.budget < weeklySalary * 4) {
        return false;
    }
    const newWageBill = teamSeasonWageBill(state, teamId, economy) + salary;
    return newWageBill <= aiMaxWageBill(state, teamId, economy, league);
}

/** Derive the user team's NBL playoff finish from bracket state. */
export function userNblPlayoffFinish(state: GameState): NblPlayoffFinish {
    const playoffs = state.playoffs;
    if (!playoffs) {
        return 'missed';
    }
    const userId = state.userTeamId;
    if (playoffs.championTeamId === userId) {
        return 'champion';
    }
    const thirdPlace = playoffs.thirdPlaceSeries;
    if (thirdPlace && (thirdPlace.homeTeamId === userId || thirdPlace.awayTeamId === userId)) {
        if (playoffs.thirdPlaceTeamId === userId) {
            return 'thirdPlace';
        }
        if (playoffs.thirdPlaceTeamId) {
            return 'fourthPlace';
        }
    }
    const seed = playoffs.seeds[userId];
    if (seed === undefined || seed > 8) {
        return 'missed';
    }
    // Find deepest stage the user reached.
    const userSeries = playoffs.series
        .filter((s) => s.homeTeamId === userId || s.awayTeamId === userId)
        .sort((a, b) => b.stage - a.stage);
    const deepest = userSeries[0];
    if (!deepest) {
        return 'playoffs';
    }
    const won = deepest.homeWins > deepest.awayWins
        ? deepest.homeTeamId === userId
        : deepest.awayWins > deepest.homeWins && deepest.awayTeamId === userId;
    if (deepest.stage === 2) {
        return won ? 'champion' : 'finalist';
    }
    if (deepest.stage === 1) {
        return won ? 'finalist' : 'semifinal';
    }
    if (deepest.stage === 0) {
        return won ? 'semifinal' : 'quarterfinal';
    }
    return 'playoffs';
}

export function nblPlayoffPrizeAmount(finish: NblPlayoffFinish, economy: EconomyConfig): number {
    const p = economy.playoffPrizes;
    switch (finish) {
        case 'champion':
            return p.champion;
        case 'finalist':
            return p.finalist;
        case 'thirdPlace':
            return p.thirdPlace;
        case 'fourthPlace':
            return p.fourthPlace;
        case 'semifinal':
            return p.semifinal;
        case 'quarterfinal':
            return p.quarterfinal;
        case 'playoffs':
            return p.playoffs;
        default:
            return 0;
    }
}

export function nblLeaguePrizeAmount(rank: number, economy: EconomyConfig): number {
    const table = economy.leaguePrizesByRank;
    const row = table.find((r) => rank <= r.maxRank) ?? table[table.length - 1];
    return row?.prize ?? 0;
}

/** Pay NBL regular-season table prize money at season end. */
export function payNblLeaguePrize(state: GameState, economy: EconomyConfig): { rank: number | null; amount: number } {
    const rank = state.lastSeasonStandings[state.userTeamId] ?? null;
    if (rank === null) {
        return { rank: null, amount: 0 };
    }
    const amount = nblLeaguePrizeAmount(rank, economy);
    if (amount > 0) {
        pushLedger(state, economy, { round: state.currentRound, kind: 'leaguePrize', amount });
    }
    return { rank, amount };
}

/** Pay NBL playoff prize money once per season. */
export function payNblPlayoffPrize(state: GameState, economy: EconomyConfig): number {
    if (state.nblPrizePaid) {
        return 0;
    }
    const finish = userNblPlayoffFinish(state);
    const amount = nblPlayoffPrizeAmount(finish, economy);
    if (amount > 0) {
        pushLedger(state, economy, { round: state.currentRound, kind: 'bonus', amount });
    }
    state.nblPrizePaid = true;
    return amount;
}

/** Sponsor tier range from NBL finishing rank and optional BCL bonus. */
export function sponsorTierRange(
    rank: number,
    economy: EconomyConfig,
    bclBonus: boolean,
): { tierMin: number; tierMax: number } {
    const table = economy.sponsors.interestByRank;
    const row = table.find((r) => rank <= r.maxRank) ?? table[table.length - 1] as { tierMin: number; tierMax: number };
    let tierMin = row.tierMin;
    let tierMax = row.tierMax;
    if (bclBonus) {
        tierMin = Math.min(5, tierMin + economy.sponsors.bclTierBonus);
        tierMax = Math.min(5, tierMax + economy.sponsors.bclTierBonus);
    }
    return { tierMin, tierMax };
}

/** Decrement sponsor seasons and remove expired deals. Returns true if a deal expired. */
export function rolloverSponsors(state: GameState): boolean {
    for (const deal of state.club.sponsors) {
        deal.seasonsRemaining--;
    }
    const before = state.club.sponsors.length;
    state.club.sponsors = state.club.sponsors.filter((d) => d.seasonsRemaining > 0);
    return state.club.sponsors.length < before;
}

export interface SponsorSeasonEndResult {
    bonusPaid: number;
    targetMet: boolean;
    promisedMaxRank: number | null;
    actualRank: number | null;
}

/** Whether an ambition sponsor target was met at season end. */
export function sponsorAmbitionTargetMet(state: GameState, promisedMaxRank: number): boolean {
    if (promisedMaxRank <= 1) {
        return state.playoffs?.championTeamId === state.userTeamId;
    }
    const actualRank = state.lastSeasonStandings[state.userTeamId];
    return actualRank !== undefined && actualRank <= promisedMaxRank;
}

/** Pay success bonuses and set renewal downgrade before sponsor rollover. */
export function settleSponsorSeasonEnd(state: GameState, economy: EconomyConfig): SponsorSeasonEndResult {
    const actualRank = state.lastSeasonStandings[state.userTeamId];
    let bonusPaid = 0;
    let promisedMaxRank: number | null = null;
    let targetMet = true;
    let hadAmbitionDeal = false;
    for (const deal of state.club.sponsors) {
        if (deal.bonusAmount <= 0) {
            continue;
        }
        hadAmbitionDeal = true;
        promisedMaxRank = deal.promisedMaxRank;
        if (sponsorAmbitionTargetMet(state, deal.promisedMaxRank)) {
            bonusPaid += deal.bonusAmount;
            pushLedger(state, economy, { round: state.currentRound, kind: 'sponsorBonus', amount: deal.bonusAmount });
        } else {
            targetMet = false;
        }
    }
    if (hadAmbitionDeal) {
        state.club.sponsorRenewalDowngrade = !targetMet;
    }
    return {
        bonusPaid,
        targetMet,
        promisedMaxRank,
        actualRank: hadAmbitionDeal ? (actualRank ?? null) : null,
    };
}

/** Generate ambition-based sponsor offers; downgraded after a missed target. */
export function generateAmbitionSponsorOffers(state: GameState, economy: EconomyConfig, rng: Rng): void {
    const downgraded = state.club.sponsorRenewalDowngrade;
    const allProfiles = economy.sponsors.ambitionProfiles;
    const profiles = downgraded
        ? allProfiles.filter((profile) => profile.id !== 'bold').slice(0, 2)
        : allProfiles;
    const brands = rng.shuffle([...economy.sponsors.brands]);
    const bclBump = state.bclQualified;
    const fecBump = state.fecQualified && !state.bclQualified;
    state.club.sponsorOffers = [];
    for (let i = 0; i < profiles.length; i++) {
        const profile = profiles[i];
        if (!profile) {
            continue;
        }
        const brandKey = brands[i] ?? brands[0] ?? 'banka';
        let tier = profile.tier;
        if (downgraded) {
            tier = profile.id === 'safe' ? 1 : Math.min(tier, 2);
        }
        if (bclBump) {
            tier = Math.min(5, tier + economy.sponsors.bclTierBonus);
        } else if (fecBump) {
            tier = Math.min(3, tier + economy.sponsors.fecTierBonus);
        }
        let perRound = economy.sponsors.perRoundByTier[tier - 1] ?? 60_000;
        if (bclBump || fecBump) {
            perRound = Math.round(perRound * economy.sponsors.europePerRoundMult);
        }
        state.club.sponsorOffers.push({
            id: `offer-ambition-${state.seasonYear}-${profile.id}`,
            brandKey,
            tier,
            perRound,
            seasons: economy.sponsors.offerSeasonsMax,
            expiresRound: 99,
            promisedMaxRank: profile.promisedMaxRank,
            bonusAmount: profile.bonusAmount,
            signingBonus: scaledSponsorSigningBonus(profile.signingBonus, userTeamTier(state), economy),
            ambitionId: profile.id,
        });
    }
}

/** @deprecated Use generateAmbitionSponsorOffers; kept for import compatibility. */
export function generateOffseasonSponsorOffers(state: GameState, economy: EconomyConfig, rng: Rng): void {
    generateAmbitionSponsorOffers(state, economy, rng);
}

function generateSponsorOffers(state: GameState, economy: EconomyConfig, rng: Rng): void {
    const s = economy.sponsors;
    const club = state.club;
    const freeSlots = s.slots - club.sponsors.length;
    if (freeSlots <= 0 || club.sponsorOffers.length >= freeSlots || !rng.chance(s.offerChancePerRound)) {
        return;
    }
    const rank = state.lastSeasonStandings[state.userTeamId] ?? Math.ceil(club.fanSupport / 10);
    const { tierMin, tierMax } = sponsorTierRange(rank, economy, state.bclQualified);
    const tier = rng.int(tierMin, tierMax);
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
        promisedMaxRank: 12,
        bonusAmount: 0,
        signingBonus: 0,
        ambitionId: 'safe',
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
    if (offer.signingBonus > 0) {
        pushLedger(state, economy, { round: state.currentRound, kind: 'sponsorSigning', amount: offer.signingBonus });
    }
    const deal: SponsorDeal = {
        id: offer.id,
        brandKey: offer.brandKey,
        tier: offer.tier,
        perRound: offer.perRound,
        seasonsRemaining: offer.seasons,
        relationship: economy.sponsors.startRelationship,
        promisedMaxRank: offer.promisedMaxRank,
        bonusAmount: offer.bonusAmount,
        signingBonus: offer.signingBonus,
    };
    club.sponsors.push(deal);
    if (club.sponsors.length >= economy.sponsors.slots) {
        club.sponsorOffers = [];
    }
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
