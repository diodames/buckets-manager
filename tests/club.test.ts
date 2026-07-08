import { describe, expect, it } from 'vitest';
import { economyConfig } from '../src/config/economy';
import { leagueConfig } from '../src/config/league';
import { pressConfig } from '../src/config/press';
import { trainingConfig } from '../src/config/training';
import { balanceConfig } from '../src/config/balance';
import {
    canAffordContract,
    contractCashflowPreview,
    payrollWeeksForSeason,
    projectSeasonCashflow,
    seasonWageBill,
} from '../src/core/cashflow';
import { acceptSponsorOffer, arenaCapacity, clampTicketPrice, computeGateReceipts, derbyGateIncomeMult, effectiveFacilityLevel, facilityUpgradeCost, homeCourtAdvantage, isDerbyMatch, roundEconomyTick, setTicketPrice, startingBudgetForTeam, tickFacilityProjects, trainingDevMultiplier, upgradeFacility } from '../src/core/economy';
import { advanceRoundInstant, createNewGame } from '../src/core/game';
import { applyPressChoice, buildPressContext, generatePressConference } from '../src/core/press';
import { createRng } from '../src/core/rng';
import { weeklyTrainingTick } from '../src/core/training';
import { testConfig as config } from './helpers';

describe('economy', () => {
    it('ledger conservation: budget equals starting budget plus all entries', () => {
        const state = createNewGame(config, 100, 'NYM');
        for (let i = 0; i < 8; i++) {
            advanceRoundInstant(state, config);
        }
        const sum = state.club.ledger.reduce((s, e) => s + e.amount, 0);
        const nym = leagueConfig.teams.find((t) => t.id === 'NYM')!;
        const starting = startingBudgetForTeam(nym, config.economy);
        expect(state.club.budget).toBe(starting + sum);
    });

    it('home rounds book ticket income, away rounds do not', () => {
        const state = createNewGame(config, 101, 'NYM');
        const rng = createRng(1);
        const home = roundEconomyTick(state, { playedHome: true, won: true, margin: 5, realArenaCapacity: 1500, totalRounds: 22, opponentTeamId: 'PCE' }, economyConfig, leagueConfig, rng);
        expect(home.ticketIncome).toBeGreaterThan(0);
        const away = roundEconomyTick(state, { playedHome: false, won: false, margin: 5, realArenaCapacity: 1500, totalRounds: 22, opponentTeamId: 'PCE' }, economyConfig, leagueConfig, rng);
        expect(away.ticketIncome).toBe(0);
    });

    it('derby home games boost gate receipts by configured multiplier', () => {
        expect(isDerbyMatch('USK', 'SLA', economyConfig)).toBe(true);
        expect(isDerbyMatch('USK', 'NYM', economyConfig)).toBe(false);
        expect(derbyGateIncomeMult('USK', 'SLA', economyConfig)).toBe(1.25);

        const normalState = createNewGame(config, 109, 'USK');
        const derbyState = createNewGame(config, 110, 'USK');
        const normal = roundEconomyTick(
            normalState,
            { playedHome: true, won: true, margin: 5, realArenaCapacity: 1065, totalRounds: 22, opponentTeamId: 'NYM' },
            economyConfig,
            leagueConfig,
            createRng(2),
        );
        const derby = roundEconomyTick(
            derbyState,
            { playedHome: true, won: true, margin: 5, realArenaCapacity: 1065, totalRounds: 22, opponentTeamId: 'SLA' },
            economyConfig,
            leagueConfig,
            createRng(3),
        );
        expect(derby.ticketIncome).toBe(Math.round(normal.ticketIncome * economyConfig.derbies.incomeMult));
    });

    it('facility upgrades cost money, start construction, and complete over time', () => {
        const state = createNewGame(config, 102, 'NYM');
        state.club.budget = 1_000_000_000;
        const before = state.club.budget;
        const cost = facilityUpgradeCost(state, 'training', economyConfig);
        expect(cost).not.toBeNull();
        expect(upgradeFacility(state, 'training', economyConfig)).toBe(true);
        expect(state.club.facilities.training).toBe(1);
        expect(state.club.facilityProjects.training?.targetLevel).toBe(2);
        expect(state.club.budget).toBe(before - (cost ?? 0));
        expect(facilityUpgradeCost(state, 'training', economyConfig)).toBeNull();

        const project = state.club.facilityProjects.training!;
        state.currentRound = project.startedRound + 2;
        expect(effectiveFacilityLevel(state, 'training', economyConfig)).toBeGreaterThan(1);
        expect(effectiveFacilityLevel(state, 'training', economyConfig)).toBeLessThan(2);

        state.currentRound = project.completesRound;
        tickFacilityProjects(state);
        expect(state.club.facilities.training).toBe(2);
        expect(state.club.facilityProjects.training).toBeUndefined();

        while (facilityUpgradeCost(state, 'training', economyConfig) !== null) {
            upgradeFacility(state, 'training', economyConfig);
            const active = state.club.facilityProjects.training!;
            state.currentRound = active.completesRound;
            tickFacilityProjects(state);
        }
        expect(state.club.facilities.training).toBe(economyConfig.facilities.maxLevel);
        expect(upgradeFacility(state, 'training', economyConfig)).toBe(false);
    });

    it('training benefits ramp during facility construction', () => {
        const state = createNewGame(config, 108, 'NYM');
        state.club.budget = 1_000_000_000;
        const baseMult = trainingDevMultiplier(state, economyConfig);
        upgradeFacility(state, 'training', economyConfig);
        expect(trainingDevMultiplier(state, economyConfig)).toBe(baseMult);
        const project = state.club.facilityProjects.training!;
        state.currentRound = project.startedRound + Math.floor((project.completesRound - project.startedRound) / 2);
        const midMult = trainingDevMultiplier(state, economyConfig);
        expect(midMult).toBeGreaterThan(baseMult);
        state.currentRound = project.completesRound;
        tickFacilityProjects(state);
        expect(trainingDevMultiplier(state, economyConfig)).toBeGreaterThan(midMult);
    });

    it('refuses upgrades the club cannot afford', () => {
        const state = createNewGame(config, 103, 'NYM');
        state.club.budget = 0;
        expect(upgradeFacility(state, 'arena', economyConfig)).toBe(false);
        expect(state.club.facilities.arena).toBe(1);
    });

    it('sponsor offers can be accepted into deals up to the slot cap', () => {
        const state = createNewGame(config, 104, 'NYM');
        state.club.sponsorOffers = [
            { id: 'o1', brandKey: 'pivovar', tier: 2, perRound: 130_000, seasons: 1, expiresRound: 99, promisedMaxRank: 8, bonusAmount: 1_000_000, signingBonus: 0, ambitionId: 'standard' },
        ];
        expect(acceptSponsorOffer(state, 'o1', economyConfig)).toBe(true);
        expect(state.club.sponsors).toHaveLength(1);
        expect(state.club.sponsorOffers).toHaveLength(0);
    });

    it('default ticket price yields realistic home gate for NYM', () => {
        const state = createNewGame(config, 105, 'NYM');
        const capacity = arenaCapacity(state, economyConfig, 1500);
        const gate = computeGateReceipts(state.club.fanSupport, state.club.ticketPrice, capacity, economyConfig);
        expect(gate.ticketIncome).toBeGreaterThan(100_000);
        expect(gate.ticketIncome).toBeLessThan(150_000);
        const rng = createRng(2);
        const home = roundEconomyTick(state, { playedHome: true, won: true, margin: 5, realArenaCapacity: 1500, totalRounds: 22 }, economyConfig, leagueConfig, rng);
        expect(home.ticketIncome).toBe(gate.ticketIncome);
    });

    it('higher ticket price reduces attendance and can lower revenue', () => {
        const capacity = 1500;
        const fanSupport = 50;
        const defaultGate = computeGateReceipts(fanSupport, 220, capacity, economyConfig);
        const expensiveGate = computeGateReceipts(fanSupport, 600, capacity, economyConfig);
        expect(expensiveGate.attendanceRate).toBeLessThan(defaultGate.attendanceRate);
        expect(expensiveGate.ticketsSold).toBeLessThan(defaultGate.ticketsSold);
    });

    it('lower ticket price increases fill rate up to capacity', () => {
        const capacity = 1500;
        const fanSupport = 50;
        const defaultGate = computeGateReceipts(fanSupport, 220, capacity, economyConfig);
        const cheapGate = computeGateReceipts(fanSupport, 80, capacity, economyConfig);
        expect(cheapGate.attendanceRate).toBeGreaterThan(defaultGate.attendanceRate);
        expect(cheapGate.ticketsSold).toBeGreaterThan(defaultGate.ticketsSold);
    });

    it('high fan support tolerates higher prices better than low support', () => {
        const capacity = 1500;
        const price = 400;
        const lowFans = computeGateReceipts(20, price, capacity, economyConfig);
        const highFans = computeGateReceipts(85, price, capacity, economyConfig);
        expect(highFans.attendanceRate).toBeGreaterThan(lowFans.attendanceRate);
        expect(highFans.ticketIncome).toBeGreaterThan(lowFans.ticketIncome);
    });

    it('setTicketPrice clamps to configured bounds and step', () => {
        const state = createNewGame(config, 106, 'NYM');
        expect(clampTicketPrice(50, economyConfig)).toBe(80);
        expect(clampTicketPrice(615, economyConfig)).toBe(600);
        expect(clampTicketPrice(225, economyConfig)).toBe(230);
        expect(setTicketPrice(state, 355, economyConfig)).toBe(360);
        expect(state.club.ticketPrice).toBe(360);
    });

    it('away games earn no ticket income regardless of price', () => {
        const state = createNewGame(config, 107, 'NYM');
        state.club.ticketPrice = 600;
        const rng = createRng(3);
        const away = roundEconomyTick(state, { playedHome: false, won: true, margin: 10, realArenaCapacity: 1500, totalRounds: 22 }, economyConfig, leagueConfig, rng);
        expect(away.ticketIncome).toBe(0);
    });

    it('home court advantage scales with fan support when user is home', () => {
        const state = createNewGame(config, 110, 'NYM');
        const base = balanceConfig.match.homeAdvantage;
        const defaultBoost = homeCourtAdvantage(state, 'NYM', economyConfig, leagueConfig, base);

        state.club.ticketPrice = economyConfig.tickets.maxPrice;
        const expensiveBoost = homeCourtAdvantage(state, 'NYM', economyConfig, leagueConfig, base);
        expect(expensiveBoost).toBe(defaultBoost);

        state.club.ticketPrice = economyConfig.tickets.minPrice;
        const cheapBoost = homeCourtAdvantage(state, 'NYM', economyConfig, leagueConfig, base);
        expect(cheapBoost).toBe(defaultBoost);

        state.club.fanSupport = economyConfig.fanSupport.min;
        const lowFanBoost = homeCourtAdvantage(state, 'NYM', economyConfig, leagueConfig, base);
        expect(lowFanBoost).toBeLessThan(defaultBoost);
        expect(lowFanBoost).toBeGreaterThanOrEqual(base * economyConfig.tickets.homeAdvantageMinMult);

        state.club.fanSupport = economyConfig.fanSupport.max;
        const highFanBoost = homeCourtAdvantage(state, 'NYM', economyConfig, leagueConfig, base);
        expect(highFanBoost).toBeGreaterThan(defaultBoost);
        expect(highFanBoost).toBeLessThanOrEqual(base);
    });

    it('AI home games keep full base home advantage', () => {
        const state = createNewGame(config, 111, 'NYM');
        state.club.ticketPrice = economyConfig.tickets.maxPrice;
        const base = balanceConfig.match.homeAdvantage;
        const aiHome = homeCourtAdvantage(state, 'PCE', economyConfig, leagueConfig, base);
        expect(aiHome).toBe(base);
    });

    it('projected cashflow stays solvent for a default NYM roster', () => {
        const state = createNewGame(config, 112, 'NYM');
        const projection = projectSeasonCashflow(state, economyConfig, leagueConfig);
        expect(projection.seasonWageBill).toBeLessThanOrEqual(projection.maxWageBill);
        expect(projection.wageBudgetRemaining).toBeGreaterThanOrEqual(0);
    });

    it('payroll weeks grow when playoff series are scheduled', () => {
        const state = createNewGame(config, 113, 'NYM');
        const regularWeeks = payrollWeeksForSeason(state, leagueConfig);
        expect(regularWeeks).toBe(22);
        state.playoffs = {
            stage: 0,
            seeds: { NYM: 1 },
            championTeamId: null,
            thirdPlaceSeries: null,
            thirdPlaceTeamId: null,
            series: [{
                id: 'PO0-0',
                stage: 0,
                slot: 0,
                homeTeamId: 'NYM',
                awayTeamId: 'PCE',
                homeWins: 1,
                awayWins: 0,
                games: [],
            }],
        };
        expect(payrollWeeksForSeason(state, leagueConfig)).toBeGreaterThan(regularWeeks);
    });

    it('weekly salary charges over payroll weeks do not exceed the season wage bill', () => {
        const state = createNewGame(config, 114, 'NYM');
        state.playoffs = {
            stage: 0,
            seeds: { NYM: 1 },
            championTeamId: null,
            thirdPlaceSeries: null,
            thirdPlaceTeamId: null,
            series: [{
                id: 'PO0-0',
                stage: 0,
                slot: 0,
                homeTeamId: 'NYM',
                awayTeamId: 'PCE',
                homeWins: 0,
                awayWins: 0,
                games: [],
            }],
        };
        const payrollWeeks = payrollWeeksForSeason(state, leagueConfig);
        const seasonTotal = seasonWageBill(state, economyConfig);
        const rng = createRng(114);
        let charged = 0;
        for (let i = 0; i < payrollWeeks; i++) {
            const tick = roundEconomyTick(
                state,
                { playedHome: false, won: false, margin: 0, realArenaCapacity: 1500, totalRounds: payrollWeeks },
                economyConfig,
                leagueConfig,
                rng,
            );
            charged += tick.salaries;
        }
        expect(charged).toBeLessThanOrEqual(seasonTotal);
        expect(charged).toBeGreaterThanOrEqual(seasonTotal - payrollWeeks);
    });

    it('blocks contracts that exceed affordable wage headroom', () => {
        const state = createNewGame(config, 115, 'NYM');
        const projection = projectSeasonCashflow(state, economyConfig, leagueConfig);
        const excessiveSalary = projection.maxWageBill - seasonWageBill(state, economyConfig) + 1_000_000;
        const result = canAffordContract(state, economyConfig, leagueConfig, excessiveSalary);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('wageBudgetExceeded');
    });

    it('contract preview reflects a proposed salary change', () => {
        const state = createNewGame(config, 116, 'NYM');
        const playerId = state.teams.NYM?.playerIds[0];
        if (!playerId) {
            throw new Error('missing player');
        }
        const preview = contractCashflowPreview(state, economyConfig, leagueConfig, 5_000_000, playerId);
        expect(preview.newWageBill).toBeGreaterThan(seasonWageBill(state, economyConfig));
    });
});

describe('training', () => {
    it('recovers fatigue and rest recovers the most', () => {
        const stateA = createNewGame(config, 200, 'NYM');
        const stateB = createNewGame(config, 200, 'NYM');
        const target = stateA.teams.NYM?.playerIds[0] as string;
        for (const s of [stateA, stateB]) {
            const p = s.players[target];
            if (p) {
                p.fatigue = 80;
            }
        }
        stateA.club.trainingFocus = 'balanced';
        stateB.club.trainingFocus = 'rest';
        weeklyTrainingTick(stateA, { training: trainingConfig, economy: economyConfig }, createRng(1));
        weeklyTrainingTick(stateB, { training: trainingConfig, economy: economyConfig }, createRng(1));
        const fatigueA = stateA.players[target]?.fatigue ?? 0;
        const fatigueB = stateB.players[target]?.fatigue ?? 0;
        expect(fatigueA).toBeLessThan(80);
        expect(fatigueB).toBeLessThan(fatigueA);
    });

    it('develops young players toward potential over many weeks', () => {
        const state = createNewGame(config, 201, 'NYM');
        const young = Object.values(state.players).find((p) => p.age <= 21);
        expect(young).toBeDefined();
        if (!young) {
            return;
        }
        const before = Object.values(young.attributes).reduce((a, b) => a + b, 0);
        const rng = createRng(7);
        for (let week = 0; week < 30; week++) {
            weeklyTrainingTick(state, { training: trainingConfig, economy: economyConfig }, rng.fork(`w${week}`));
        }
        const after = Object.values(young.attributes).reduce((a, b) => a + b, 0);
        expect(after).toBeGreaterThan(before);
    });

    it('counts down injuries until players return', () => {
        const state = createNewGame(config, 202, 'NYM');
        const target = state.teams.NYM?.playerIds[0] as string;
        const player = state.players[target];
        if (!player) {
            throw new Error('missing player');
        }
        player.injury = { roundsOut: 2 };
        weeklyTrainingTick(state, { training: trainingConfig, economy: economyConfig }, createRng(1));
        expect(player.injury).toEqual({ roundsOut: 1 });
        weeklyTrainingTick(state, { training: trainingConfig, economy: economyConfig }, createRng(2));
        expect(player.injury).toBeNull();
    });
});

describe('press conference', () => {
    it('picks a result question and applies chosen effects', () => {
        const state = createNewGame(config, 300, 'NYM');
        advanceRoundInstant(state, config);
        const fixture = state.fixtures.find(
            (f) => f.result && (f.homeTeamId === 'NYM' || f.awayTeamId === 'NYM'),
        );
        if (!fixture?.result) {
            throw new Error('no user fixture played');
        }
        const context = buildPressContext(state, fixture.result, fixture.homeTeamId, null);
        const questions = generatePressConference(context, pressConfig, createRng(1));
        expect(questions.length).toBeGreaterThanOrEqual(1);
        expect(questions.length).toBeLessThanOrEqual(pressConfig.questionsPerConference);
        const question = questions[0];
        if (!question) {
            return;
        }
        const expectedFirst = context.won
            ? context.margin >= pressConfig.blowoutMargin ? 'bigWin' : 'closeWin'
            : context.margin >= pressConfig.blowoutMargin ? 'bigLoss' : 'closeLoss';
        expect(question.def.id).toBe(expectedFirst);

        const fansBefore = state.club.fanSupport;
        const choice = question.def.choices.find((c) => (c.fanSupport ?? 0) !== 0);
        if (choice) {
            const result = applyPressChoice(state, question, choice);
            expect(state.club.fanSupport).toBe(Math.max(5, Math.min(100, fansBefore + result.fanSupport)));
        }
    });

    it('a 3+ streak adds the streak question and variants stay in range', () => {
        const base = { won: true, margin: 5, starId: null, starPoints: 0, injuredId: null };
        const winQs = generatePressConference({ ...base, streak: 3 }, pressConfig, createRng(1));
        expect(winQs.some((q) => q.def.id === 'streakWin')).toBe(true);
        const lossQs = generatePressConference({ ...base, won: false, streak: -4 }, pressConfig, createRng(2));
        expect(lossQs.some((q) => q.def.id === 'streakLoss')).toBe(true);
        for (const q of [...winQs, ...lossQs]) {
            expect([0, 1]).toContain(q.variant);
        }
    });

    it('every press question has both phrasing variants and all choice texts', async () => {
        const { en } = await import('../src/i18n/en');
        for (const def of pressConfig.defs) {
            expect(en, `press.${def.id}.q`).toHaveProperty(`press.${def.id}.q`);
            expect(en, `press.${def.id}.q2`).toHaveProperty(`press.${def.id}.q2`);
            for (const choice of def.choices) {
                expect(en, `press.${def.id}.${choice.id}`).toHaveProperty(`press.${def.id}.${choice.id}`);
            }
        }
    });

    it('press sponsor effects shift active deal relationships', () => {
        const state = createNewGame(config, 301, 'NYM');
        state.club.sponsors.push({ id: 'd1', brandKey: 'banka', tier: 2, perRound: 130_000, seasonsRemaining: 1, relationship: 50, promisedMaxRank: 6, bonusAmount: 0, signingBonus: 0 });
        advanceRoundInstant(state, config);
        const fixture = state.fixtures.find((f) => f.result && (f.homeTeamId === 'NYM' || f.awayTeamId === 'NYM'));
        if (!fixture?.result) {
            throw new Error('no user fixture');
        }
        const context = buildPressContext(state, fixture.result, fixture.homeTeamId, null);
        const questions = generatePressConference(context, pressConfig, createRng(2));
        const question = questions[0];
        const choice = question?.def.choices.find((c) => (c.sponsorRelation ?? 0) !== 0);
        if (!question || !choice) {
            return;
        }
        const before = state.club.sponsors[0]?.relationship ?? 0;
        applyPressChoice(state, question, choice);
        expect(state.club.sponsors[0]?.relationship).toBe(
            Math.max(0, Math.min(100, before + (choice.sponsorRelation ?? 0))),
        );
    });
});
