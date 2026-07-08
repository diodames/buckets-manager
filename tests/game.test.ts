import { describe, expect, it } from 'vitest';
import { validateAllConfigs } from '../src/config';
import { leagueConfig } from '../src/config/league';
import { startingBudgetForTeam } from '../src/core/economy';
import { advanceRoundInstant, createNewGame, isCampaignOver, isSeasonOver, seasonRounds, upcomingUserFixtures } from '../src/core/game';
import { computeNblStandings } from '../src/core/league/standings';
import { POSITIONS } from '../src/core/model/types';
import { testConfig as config } from './helpers';

describe('config', () => {
    it('all shipped configs validate', () => {
        expect(() => validateAllConfigs()).not.toThrow();
    });
});

describe('createNewGame (real NBL rosters)', () => {
    const state = createNewGame(config, 777, 'NYM');

    it('generates the full league from real rosters', () => {
        expect(Object.keys(state.teams)).toHaveLength(12);
        for (const teamDef of leagueConfig.teams) {
            const team = state.teams[teamDef.id];
            expect(team, `team ${teamDef.id}`).toBeDefined();
            expect(team?.playerIds.length).toBeGreaterThanOrEqual(Math.min(12, teamDef.roster.length));
            for (const position of POSITIONS) {
                expect(team?.playerIds).toContain(team?.tactics.starters[position]);
            }
        }
        // Real players carry their real names.
        const nymburk = state.teams.NYM;
        const names = (nymburk?.playerIds ?? []).map((id) => state.players[id]?.lastName);
        expect(names).toContain('Sehnal');
        expect(names).toContain('Rice');
    });

    it('stronger real teams rate higher than weaker ones', () => {
        const avgOverall = (teamId: string) => {
            const team = state.teams[teamId];
            const ratings = (team?.playerIds ?? [])
                .map((id) => state.players[id])
                .filter((p) => p !== undefined)
                .map((p) => Object.values(p.attributes).reduce((a, b) => a + b, 0) / 12);
            return ratings.reduce((a, b) => a + b, 0) / ratings.length;
        };
        // Nymburk (tier 5 players) should out-rate Hradec Kralove (tier ~2).
        expect(avgOverall('NYM')).toBeGreaterThan(avgOverall('HKR'));
    });

    it('tier-5 clubs start with the highest budget', () => {
        const nym = leagueConfig.teams.find((t) => t.id === 'NYM')!;
        expect(nym.tier).toBe(5);
        expect(state.club.budget).toBe(13_500_000);
    });

    it('is deterministic per seed and club state starts clean', () => {
        const again = createNewGame(config, 777, 'NYM');
        expect(again).toEqual(state);
        expect(state.club.budget).toBe(startingBudgetForTeam(leagueConfig.teams.find((t) => t.id === 'NYM')!, config.economy));
        expect(state.club.sponsors).toHaveLength(0);
        expect(state.club.facilities).toEqual({ arena: 1, training: 1, academy: 1 });
    });

    it('rejects unknown teams', () => {
        expect(() => createNewGame(config, 1, 'NOPE')).toThrow();
    });
});

describe('full season (instant rounds)', () => {
    it('plays out with consistent standings, economy, and player state', () => {
        const state = createNewGame(config, 2024, 'BRN');
        while (!isSeasonOver(state, config)) {
            advanceRoundInstant(state, config);
        }
        const rounds = seasonRounds(state, config);
        expect(rounds).toBe(22);
        expect(state.fixtures.every((f) => f.result !== null)).toBe(true);

        const standings = computeNblStandings(state);
        let totalWins = 0;
        let totalFor = 0;
        let totalAgainst = 0;
        for (const row of standings) {
            expect(row.played).toBe(22);
            expect(row.wins + row.losses).toBe(22);
            totalWins += row.wins;
            totalFor += row.pointsFor;
            totalAgainst += row.pointsAgainst;
        }
        expect(totalWins).toBe(state.fixtures.length);
        expect(totalFor).toBe(totalAgainst);

        // Player invariants after a full season of fatigue/training/injuries.
        for (const player of Object.values(state.players)) {
            expect(player.fatigue).toBeGreaterThanOrEqual(0);
            expect(player.fatigue).toBeLessThanOrEqual(100);
            expect(player.morale).toBeGreaterThanOrEqual(0);
            expect(player.morale).toBeLessThanOrEqual(100);
            for (const value of Object.values(player.attributes)) {
                expect(value).toBeGreaterThanOrEqual(1);
                expect(value).toBeLessThanOrEqual(99);
            }
        }

        // Ledger booked something and budget stayed a finite number.
        expect(state.club.ledger.length).toBeGreaterThan(0);
        expect(Number.isFinite(state.club.budget)).toBe(true);
    });

    it('continues into the playoffs and refuses to advance past the title', () => {
        const state = createNewGame(config, 3, 'NYM');
        while (!isSeasonOver(state, config)) {
            advanceRoundInstant(state, config);
        }
        // Post-season: advancing now plays playoff rounds until a champion.
        let guard = 0;
        while (!isCampaignOver(state, config) && guard++ < 40) {
            advanceRoundInstant(state, config);
        }
        expect(isCampaignOver(state, config)).toBe(true);
        expect(state.playoffs?.championTeamId).toBeTruthy();
        expect(() => advanceRoundInstant(state, config)).toThrow();
    });
});

describe('upcomingUserFixtures', () => {
    it('returns BCL and FEC user fixtures in the same week', () => {
        const state = createNewGame(config, 8801, 'NYM');
        state.calendarWeek = 4;
        state.bclQualified = true;
        state.fecQualified = true;
        state.competitions.bcl = {
            id: 'bcl',
            phase: 'regularSeason',
            fixtures: [
                { id: 'bcl-user', homeTeamId: 'NYM', awayTeamId: 'BCL-RYT', result: null, round: 2, week: 4, competitionId: 'bcl' },
            ],
            groups: [],
            playoffs: null,
            qualifyingSeries: null,
            qualifyingEntrantId: null,
            qualifyingOpponentId: null,
            qualifiedTeamIds: [],
            championTeamId: null,
            prizePaid: false,
            weeklyPrizePaidTotal: 0,
            userFinish: null,
        };
        state.competitions.fec = {
            id: 'fec',
            phase: 'regularSeason',
            fixtures: [
                { id: 'fec-user', homeTeamId: 'FEC-ABC', awayTeamId: 'NYM', result: null, round: 2, week: 4, competitionId: 'fec' },
            ],
            groups: [],
            playoffs: null,
            qualifyingSeries: null,
            qualifyingEntrantId: null,
            qualifyingOpponentId: null,
            qualifiedTeamIds: [],
            championTeamId: null,
            prizePaid: false,
            weeklyPrizePaidTotal: 0,
            userFinish: null,
        };

        const upcoming = upcomingUserFixtures(state, config, 2);
        expect(upcoming.map((f) => f.id)).toEqual(['bcl-user', 'fec-user']);
    });
});
