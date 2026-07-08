import type { EconomyConfig } from '../config/economy';
import type { LeagueConfig } from '../config/league';
import { teamTier, userNblPlayoffFinish } from './economy';
import type { BoardObjective, CareerMilestones, GameState } from './model/types';
import { computeNblStandings } from './league/standings';

/** Board target rank from club tier (1 = title, 12 = survival). */
export function defaultBoardTargetRank(teamId: string, league: LeagueConfig): number {
    const tier = teamTier(teamId, league);
    switch (tier) {
        case 5:
            return 1;
        case 4:
            return 4;
        case 3:
            return 6;
        case 2:
            return 8;
        default:
            return 10;
    }
}

export function createBoardObjective(state: GameState, league: LeagueConfig): BoardObjective {
    const sponsor = state.club.sponsors[0];
    const promisedMaxRank = sponsor?.promisedMaxRank ?? defaultBoardTargetRank(state.userTeamId, league);
    return { promisedMaxRank, seasonsMissed: 0, warned: false };
}

export function initializeBoardObjective(state: GameState, league: LeagueConfig): void {
    if (!state.boardObjective) {
        state.boardObjective = createBoardObjective(state, league);
    }
}

export function currentNblRank(state: GameState): number | null {
    const standings = computeNblStandings(state);
    const idx = standings.findIndex((row) => row.teamId === state.userTeamId);
    return idx >= 0 ? idx + 1 : null;
}

export function boardTargetMet(state: GameState): boolean {
    const rank = currentNblRank(state);
    const target = state.boardObjective?.promisedMaxRank;
    if (rank === null || target === undefined) {
        return true;
    }
    return rank <= target;
}

/** Evaluate board satisfaction at season end; returns true if target was met. */
export function evaluateBoardObjective(state: GameState, league: LeagueConfig, _economy: EconomyConfig): boolean {
    initializeBoardObjective(state, league);
    const objective = state.boardObjective as BoardObjective;
    const finish = userNblPlayoffFinish(state);
    const standings = computeNblStandings(state);
    const leagueRank = standings.findIndex((row) => row.teamId === state.userTeamId) + 1;
    const effectiveRank = finish === 'champion' ? 1 : leagueRank > 0 ? leagueRank : 12;
    const met = effectiveRank <= objective.promisedMaxRank;

    if (!state.careerMilestones) {
        state.careerMilestones = emptyCareerMilestones();
    }
    state.careerMilestones.seasonsCompleted++;

    if (finish !== 'missed') {
        state.careerMilestones.playoffAppearances++;
    }
    if (finish === 'champion') {
        state.careerMilestones.championships++;
    }
    const bclFinish = state.competitions.bcl?.userFinish;
    if (bclFinish === 'champion') {
        state.careerMilestones.bclTitles++;
    }

    if (met) {
        objective.seasonsMissed = 0;
        objective.warned = false;
    } else {
        objective.seasonsMissed++;
        if (objective.seasonsMissed >= 2 && !objective.warned) {
            objective.warned = true;
            state.careerMilestones.boardWarnings++;
        }
    }
    return met;
}

export function emptyCareerMilestones(): CareerMilestones {
    return {
        championships: 0,
        playoffAppearances: 0,
        bclTitles: 0,
        boardWarnings: 0,
        seasonsCompleted: 0,
    };
}
