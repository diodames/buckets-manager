import type { EconomyConfig } from '../config/economy';
import type { LeagueConfig } from '../config/league';
import {
    arenaCapacity,
    computeGateReceipts,
    derbyGateIncomeMult,
    nblPlayoffPrizeAmount,
    playerSalary,
    realArenaCapacity,
} from './economy';
import { totalRounds } from './league/schedule';
import type { GameState, PlayerId, TeamId } from './model/types';
import { seriesDecided, winsNeeded } from './playoffs';

export type FinanceWarningTier = 'green' | 'yellow' | 'red';

export interface WeeklyPayroll {
    salaries: number;
    maintenance: number;
    total: number;
}

export interface SeasonCashflowProjection {
    weeklyBurn: number;
    weeklySalaries: number;
    weeklyMaintenance: number;
    remainingEconomyWeeks: number;
    remainingHomeGames: number;
    projectedIncome: number;
    projectedExpenses: number;
    projectedEndBalance: number;
    runwayWeeks: number;
    seasonWageBill: number;
    maxWageBill: number;
    wageBudgetRemaining: number;
    warningTier: FinanceWarningTier;
}

export type ContractAffordabilityReason = 'wageBudgetExceeded' | 'projectedDeficit';

export interface ContractAffordability {
    ok: boolean;
    reason?: ContractAffordabilityReason;
}

function seasonRoundCount(state: GameState, league: LeagueConfig): number {
    return totalRounds(Object.keys(state.teams).length, league.roundRobinLegs);
}

function userFixtures(
    state: GameState,
    userId: TeamId,
    league: LeagueConfig,
): Array<{ playedHome: boolean; played: boolean; opponentTeamId: TeamId; isNbl: boolean }> {
    const entries: Array<{ playedHome: boolean; played: boolean; opponentTeamId: TeamId; isNbl: boolean }> = [];
    for (const fixture of state.fixtures) {
        if (fixture.competitionId && fixture.competitionId !== 'nbl') {
            continue;
        }
        if (fixture.homeTeamId !== userId && fixture.awayTeamId !== userId) {
            continue;
        }
        entries.push({
            playedHome: fixture.homeTeamId === userId,
            played: fixture.result !== null,
            opponentTeamId: fixture.homeTeamId === userId ? fixture.awayTeamId : fixture.homeTeamId,
            isNbl: true,
        });
    }
    const bcl = state.competitions.bcl;
    if (bcl && state.bclQualified) {
        for (const fixture of bcl.fixtures) {
            if (fixture.homeTeamId !== userId && fixture.awayTeamId !== userId) {
                continue;
            }
            entries.push({
                playedHome: fixture.homeTeamId === userId,
                played: fixture.result !== null,
                opponentTeamId: fixture.homeTeamId === userId ? fixture.awayTeamId : fixture.homeTeamId,
                isNbl: false,
            });
        }
    }
    if (state.playoffs) {
        for (const series of state.playoffs.series) {
            if (series.homeTeamId !== userId && series.awayTeamId !== userId) {
                continue;
            }
            const opponentTeamId = series.homeTeamId === userId ? series.awayTeamId : series.homeTeamId;
            const played = series.homeWins + series.awayWins;
            for (let i = 0; i < played; i++) {
                entries.push({ playedHome: i % 2 === 0, played: true, opponentTeamId, isNbl: false });
            }
            if (!seriesDecided(series, league)) {
                const needed = winsNeeded(series.stage, league);
                const maxGames = needed * 2 - 1;
                const remaining = Math.max(0, maxGames - played);
                for (let i = 0; i < remaining; i++) {
                    entries.push({
                        playedHome: (played + i) % 2 === 0,
                        played: false,
                        opponentTeamId,
                        isNbl: false,
                    });
                }
            }
        }
    }
    return entries;
}

/** Total user match weeks used to prorate weekly salary deductions. */
export function payrollWeeksForSeason(state: GameState, league: LeagueConfig): number {
    const regular = seasonRoundCount(state, league);
    const weeks = userFixtures(state, state.userTeamId, league).length;
    return Math.max(regular, weeks, 1);
}

export function seasonWageBill(state: GameState, economy: EconomyConfig, playerIds?: readonly string[]): number {
    const team = state.teams[state.userTeamId];
    const ids = playerIds ?? team?.playerIds ?? [];
    return ids.reduce((sum, id) => sum + playerSalary(state, id, economy), 0);
}

export function weeklyPayroll(state: GameState, economy: EconomyConfig, league: LeagueConfig): WeeklyPayroll {
    const payrollWeeks = payrollWeeksForSeason(state, league);
    const salaries = Math.round(seasonWageBill(state, economy) / payrollWeeks);
    const levels = Object.values(state.club.facilities).reduce((a, b) => a + b, 0);
    const maintenance = levels * economy.facilities.maintenancePerLevelPerRound;
    return { salaries, maintenance, total: salaries + maintenance };
}

function sponsorIncomePerWeek(state: GameState, economy: EconomyConfig): number {
    const s = economy.sponsors;
    let income = 0;
    for (const deal of state.club.sponsors) {
        const mult = s.relationMinMult + (s.relationMaxMult - s.relationMinMult) * (deal.relationship / 100);
        income += Math.round(deal.perRound * mult);
    }
    return income;
}

function projectedSeasonIncome(state: GameState, economy: EconomyConfig, league: LeagueConfig): number {
    const userId = state.userTeamId;
    const realCap = realArenaCapacity(league, userId);
    const capacity = arenaCapacity(state, economy, realCap);
    const gate = computeGateReceipts(state.club.fanSupport, state.club.ticketPrice, capacity, economy);

    let ticketIncome = 0;
    let remainingWeeks = 0;
    for (const entry of userFixtures(state, userId, league)) {
        if (entry.played) {
            continue;
        }
        remainingWeeks++;
        if (entry.playedHome) {
            const derbyMult = entry.isNbl
                ? derbyGateIncomeMult(userId, entry.opponentTeamId, economy)
                : 1;
            ticketIncome += Math.round(gate.ticketIncome * derbyMult);
        }
    }

    const sponsorIncome = remainingWeeks * sponsorIncomePerWeek(state, economy);
    const conservativePrize = state.nblPrizePaid ? 0 : nblPlayoffPrizeAmount('playoffs', economy);
    return ticketIncome + sponsorIncome + conservativePrize;
}

export function maxAllowedWageBill(state: GameState, economy: EconomyConfig, league: LeagueConfig): number {
    const payroll = weeklyPayroll(state, economy, league);
    const remainingEconomyWeeks = userFixtures(state, state.userTeamId, league).filter((f) => !f.played).length;
    const projectedEndBalance = state.club.budget
        + projectedSeasonIncome(state, economy, league)
        - remainingEconomyWeeks * payroll.total;
    const current = seasonWageBill(state, economy);
    const headroom = Math.max(0, projectedEndBalance - economy.financial.minEndBalance);
    return current + headroom;
}

export function projectSeasonCashflow(
    state: GameState,
    economy: EconomyConfig,
    league: LeagueConfig,
): SeasonCashflowProjection {
    const payroll = weeklyPayroll(state, economy, league);
    const userId = state.userTeamId;
    const fixtures = userFixtures(state, userId, league);
    const remainingEconomyWeeks = fixtures.filter((f) => !f.played).length;
    const remainingHomeGames = fixtures.filter((f) => !f.played && f.playedHome).length;
    const projectedIncome = projectedSeasonIncome(state, economy, league);
    const projectedExpenses = remainingEconomyWeeks * payroll.total;
    const projectedEndBalance = state.club.budget + projectedIncome - projectedExpenses;
    const netAwayBurn = Math.max(1, payroll.total - sponsorIncomePerWeek(state, economy));
    const runwayWeeks = state.club.budget / netAwayBurn;
    const seasonWage = seasonWageBill(state, economy);
    const headroom = Math.max(0, projectedEndBalance - economy.financial.minEndBalance);
    const maxWageBill = seasonWage + headroom;

    return {
        weeklyBurn: payroll.total,
        weeklySalaries: payroll.salaries,
        weeklyMaintenance: payroll.maintenance,
        remainingEconomyWeeks,
        remainingHomeGames,
        projectedIncome,
        projectedExpenses,
        projectedEndBalance,
        runwayWeeks,
        seasonWageBill: seasonWage,
        maxWageBill,
        wageBudgetRemaining: maxWageBill - seasonWage,
        warningTier: financeWarningTier(state, economy, league, projectedEndBalance, payroll.total, runwayWeeks),
    };
}

export function financeWarningTier(
    state: GameState,
    economy: EconomyConfig,
    league: LeagueConfig,
    projectedEndBalance?: number,
    weeklyBurn?: number,
    runwayWeeks?: number,
): FinanceWarningTier {
    const projection = projectedEndBalance === undefined
        ? projectSeasonCashflow(state, economy, league)
        : null;
    const endBalance = projectedEndBalance ?? projection!.projectedEndBalance;
    const burn = weeklyBurn ?? projection!.weeklyBurn;
    const runway = runwayWeeks ?? projection!.runwayWeeks;
    const minEnd = economy.financial.minEndBalance;

    if (state.club.budget < burn) {
        return 'red';
    }
    if (endBalance < minEnd || state.club.budget < burn * 2 || runway < economy.financial.lowCashRunwayWeeks) {
        return 'yellow';
    }
    return 'green';
}

function wageBillWithSalary(
    state: GameState,
    economy: EconomyConfig,
    newSalary: number,
    replacesPlayerId?: PlayerId,
): number {
    const team = state.teams[state.userTeamId];
    if (!team) {
        return newSalary;
    }
    let total = seasonWageBill(state, economy);
    if (replacesPlayerId) {
        total -= playerSalary(state, replacesPlayerId, economy);
    }
    return total + newSalary;
}

export function canAffordContract(
    state: GameState,
    economy: EconomyConfig,
    league: LeagueConfig,
    newSalary: number,
    replacesPlayerId?: PlayerId,
    options?: { skipWageBudget?: boolean },
): ContractAffordability {
    const newWageBill = wageBillWithSalary(state, economy, newSalary, replacesPlayerId);
    const maxWage = maxAllowedWageBill(state, economy, league);
    if (!options?.skipWageBudget && newWageBill > maxWage) {
        return { ok: false, reason: 'wageBudgetExceeded' };
    }

    const payroll = weeklyPayroll(state, economy, league);
    const payrollWeeks = payrollWeeksForSeason(state, league);
    const salaryDelta = newSalary - (replacesPlayerId ? playerSalary(state, replacesPlayerId, economy) : 0);
    const weeklyDelta = Math.round(salaryDelta / payrollWeeks);
    const remainingWeeks = userFixtures(state, state.userTeamId, league).filter((f) => !f.played).length;
    const projectedEndBalance = state.club.budget
        + projectedSeasonIncome(state, economy, league)
        - remainingWeeks * (payroll.total + weeklyDelta);

    if (projectedEndBalance < economy.financial.minEndBalance) {
        return { ok: false, reason: 'projectedDeficit' };
    }
    return { ok: true };
}

export interface ContractCashflowPreview {
    newWageBill: number;
    maxWageBill: number;
    projectedEndBalance: number;
    affordability: ContractAffordability;
}

export function contractCashflowPreview(
    state: GameState,
    economy: EconomyConfig,
    league: LeagueConfig,
    newSalary: number,
    replacesPlayerId?: PlayerId,
): ContractCashflowPreview {
    const newWageBill = wageBillWithSalary(state, economy, newSalary, replacesPlayerId);
    const maxWageBill = maxAllowedWageBill(state, economy, league);
    const affordability = canAffordContract(state, economy, league, newSalary, replacesPlayerId);
    const payroll = weeklyPayroll(state, economy, league);
    const payrollWeeks = payrollWeeksForSeason(state, league);
    const salaryDelta = newSalary - (replacesPlayerId ? playerSalary(state, replacesPlayerId, economy) : 0);
    const weeklyDelta = Math.round(salaryDelta / payrollWeeks);
    const remainingWeeks = userFixtures(state, state.userTeamId, league).filter((f) => !f.played).length;
    const projectedEndBalance = state.club.budget
        + projectedSeasonIncome(state, economy, league)
        - remainingWeeks * (payroll.total + weeklyDelta);
    return { newWageBill, maxWageBill, projectedEndBalance, affordability };
}
