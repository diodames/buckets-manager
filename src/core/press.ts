import type { PressChoiceDef, PressConfig, PressQuestionDef } from '../config/press';
import { driftSponsorRelations } from './economy';
import type { GameState, MatchSummary, PlayerId } from './model/types';
import type { Rng } from './rng';

export interface PressQuestion {
    def: PressQuestionDef;
    // Player the question is about (star performer / injured player).
    playerId: PlayerId | null;
    // Phrasing variant (i18n key `press.<id>.q` or `press.<id>.q2`).
    variant: 0 | 1;
}

export interface PressContext {
    won: boolean;
    margin: number;
    // The user team's best scorer in the match.
    starId: PlayerId | null;
    starPoints: number;
    injuredId: PlayerId | null;
    // Consecutive results including this match: +N winning, -N losing streak.
    streak: number;
}

export function buildPressContext(state: GameState, summary: MatchSummary, homeTeamId: string, injuredId: PlayerId | null): PressContext {
    const isHome = state.userTeamId === homeTeamId;
    const userScore = isHome ? summary.homeScore : summary.awayScore;
    const oppScore = isHome ? summary.awayScore : summary.homeScore;
    let starId: PlayerId | null = null;
    let starPoints = 0;
    const team = state.teams[state.userTeamId];
    for (const playerId of team?.playerIds ?? []) {
        const line = summary.box[playerId];
        if (line && line.points > starPoints) {
            starPoints = line.points;
            starId = playerId;
        }
    }
    const won = userScore > oppScore;

    // Streak: walk played user fixtures backwards from the latest.
    const userResults = state.fixtures
        .filter((f) => f.result && (f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId))
        .sort((a, b) => a.round - b.round)
        .map((f) => {
            const home = f.homeTeamId === state.userTeamId;
            const r = f.result as NonNullable<typeof f.result>;
            return home ? r.homeScore > r.awayScore : r.awayScore > r.homeScore;
        });
    let streak = 0;
    for (let i = userResults.length - 1; i >= 0; i--) {
        if (userResults[i] === won) {
            streak++;
        } else {
            break;
        }
    }
    return { won, margin: Math.abs(userScore - oppScore), starId, starPoints, injuredId, streak: won ? streak : -streak };
}

/** Picks the questions for the post-match conference (deterministic per rng). */
export function generatePressConference(
    context: PressContext,
    config: PressConfig,
    rng: Rng,
    state?: GameState,
): PressQuestion[] {
    const eligible: PressQuestion[] = [];
    const byId = new Map(config.defs.map((d) => [d.id, d]));
    const add = (id: string, playerId: PlayerId | null = null) => {
        const def = byId.get(id);
        if (def) {
            eligible.push({ def, playerId, variant: rng.chance(0.5) ? 1 : 0 });
        }
    };

    // Transfer hooks from recent market events (M20).
    if (state && state.market.pendingPressHooks.length > 0) {
        const hook = state.market.pendingPressHooks.shift();
        if (hook) {
            const qId = hook.kind === 'soldCaptain' ? 'soldCaptain' : hook.kind === 'rejectedBid' ? 'rejectedBid' : 'deadlineSigning';
            add(qId, hook.playerId);
        }
    }

    if (context.won) {
        add(context.margin >= config.blowoutMargin ? 'bigWin' : 'closeWin');
    } else {
        add(context.margin >= config.blowoutMargin ? 'bigLoss' : 'closeLoss');
    }
    if (context.streak >= 3) {
        add('streakWin');
    } else if (context.streak <= -3) {
        add('streakLoss');
    }
    if (context.starId && context.starPoints >= config.starPoints) {
        add('starPerformance', context.starId);
    }
    if (context.injuredId) {
        add('injury', context.injuredId);
    }

    // Result question always first, extras shuffled behind it.
    const [first, ...rest] = eligible;
    rng.shuffle(rest);
    return [first, ...rest].filter((q): q is PressQuestion => q !== undefined).slice(0, config.questionsPerConference);
}

export interface PressAnswerResult {
    teamMorale: number;
    starMorale: number;
    fanSupport: number;
    sponsorRelation: number;
}

/** Applies one answer's effects to the game state and returns them for the UI. */
export function applyPressChoice(state: GameState, question: PressQuestion, choice: PressChoiceDef): PressAnswerResult {
    const result: PressAnswerResult = {
        teamMorale: choice.teamMorale ?? 0,
        starMorale: choice.starMorale ?? 0,
        fanSupport: choice.fanSupport ?? 0,
        sponsorRelation: choice.sponsorRelation ?? 0,
    };
    const team = state.teams[state.userTeamId];
    if (result.teamMorale !== 0 && team) {
        for (const playerId of team.playerIds) {
            const player = state.players[playerId];
            if (player) {
                player.morale = Math.max(0, Math.min(100, player.morale + result.teamMorale));
            }
        }
    }
    if (result.starMorale !== 0 && question.playerId) {
        const star = state.players[question.playerId];
        if (star) {
            star.morale = Math.max(0, Math.min(100, star.morale + result.starMorale));
        }
    }
    if (result.fanSupport !== 0) {
        state.club.fanSupport = Math.max(5, Math.min(100, state.club.fanSupport + result.fanSupport));
    }
    if (result.sponsorRelation !== 0) {
        driftSponsorRelations(state, result.sponsorRelation);
    }
    return result;
}
