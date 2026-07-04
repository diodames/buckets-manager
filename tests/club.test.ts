import { describe, expect, it } from 'vitest';
import { economyConfig } from '../src/config/economy';
import { pressConfig } from '../src/config/press';
import { trainingConfig } from '../src/config/training';
import { acceptSponsorOffer, facilityUpgradeCost, roundEconomyTick, upgradeFacility } from '../src/core/economy';
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
        expect(state.club.budget).toBe(config.economy.startingBudget + sum);
    });

    it('home rounds book ticket income, away rounds do not', () => {
        const state = createNewGame(config, 101, 'NYM');
        const rng = createRng(1);
        const home = roundEconomyTick(state, { playedHome: true, won: true, margin: 5, realArenaCapacity: 1500, totalRounds: 22 }, economyConfig, rng);
        expect(home.ticketIncome).toBeGreaterThan(0);
        const away = roundEconomyTick(state, { playedHome: false, won: false, margin: 5, realArenaCapacity: 1500, totalRounds: 22 }, economyConfig, rng);
        expect(away.ticketIncome).toBe(0);
    });

    it('facility upgrades cost money, raise the level, and cap at max', () => {
        const state = createNewGame(config, 102, 'NYM');
        state.club.budget = 1_000_000_000;
        const before = state.club.budget;
        const cost = facilityUpgradeCost(state, 'training', economyConfig);
        expect(cost).not.toBeNull();
        expect(upgradeFacility(state, 'training', economyConfig)).toBe(true);
        expect(state.club.facilities.training).toBe(2);
        expect(state.club.budget).toBe(before - (cost ?? 0));
        while (facilityUpgradeCost(state, 'training', economyConfig) !== null) {
            upgradeFacility(state, 'training', economyConfig);
        }
        expect(state.club.facilities.training).toBe(economyConfig.facilities.maxLevel);
        expect(upgradeFacility(state, 'training', economyConfig)).toBe(false);
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
            { id: 'o1', brandKey: 'pivovar', tier: 3, perRound: 180_000, seasons: 1, expiresRound: 99 },
        ];
        expect(acceptSponsorOffer(state, 'o1', economyConfig)).toBe(true);
        expect(state.club.sponsors).toHaveLength(1);
        expect(state.club.sponsorOffers).toHaveLength(0);
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

    it('press sponsor effects shift active deal relationships', () => {
        const state = createNewGame(config, 301, 'NYM');
        state.club.sponsors.push({ id: 'd1', brandKey: 'banka', tier: 3, perRound: 180_000, seasonsRemaining: 1, relationship: 50 });
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
