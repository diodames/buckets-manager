import type { BoxLine, PlayerId, TeamId } from '../model/types';
import { createEmptyBoxLine } from '../model/types';
import type { MatchEvent } from './events';

export interface FoldedMatch {
    homeScore: number;
    awayScore: number;
    quarterScores: Array<[number, number]>;
    box: Record<PlayerId, BoxLine>;
}

/**
 * Folds an event stream into final score, per-period scores, and box score.
 * This is the single source of truth for "what the match produced"; the sim
 * itself never keeps a separate score that could drift from the events.
 */
export function foldEvents(events: readonly MatchEvent[], homeTeamId: TeamId): FoldedMatch {
    let homeScore = 0;
    let awayScore = 0;
    let lastPeriodHome = 0;
    let lastPeriodAway = 0;
    const quarterScores: Array<[number, number]> = [];
    const box: Record<PlayerId, BoxLine> = {};

    const line = (playerId: PlayerId): BoxLine => {
        let entry = box[playerId];
        if (!entry) {
            entry = createEmptyBoxLine();
            box[playerId] = entry;
        }
        return entry;
    };

    for (const event of events) {
        switch (event.t) {
            case 'shot': {
                const shooter = line(event.playerId);
                const isThree = event.kind === 'three';
                if (isThree) {
                    shooter.fga3++;
                } else {
                    shooter.fga2++;
                }
                if (event.made) {
                    if (isThree) {
                        shooter.fgm3++;
                    } else {
                        shooter.fgm2++;
                    }
                    shooter.points += event.points;
                    if (event.teamId === homeTeamId) {
                        homeScore += event.points;
                    } else {
                        awayScore += event.points;
                    }
                    if (event.assistBy) {
                        line(event.assistBy).assists++;
                    }
                }
                break;
            }
            case 'rebound':
                line(event.playerId).rebounds++;
                break;
            case 'turnover':
                line(event.playerId).turnovers++;
                if (event.stolenBy) {
                    line(event.stolenBy).steals++;
                }
                break;
            case 'periodEnd': {
                quarterScores.push([homeScore - lastPeriodHome, awayScore - lastPeriodAway]);
                lastPeriodHome = homeScore;
                lastPeriodAway = awayScore;
                const [h, a] = event.score;
                if (h !== homeScore || a !== awayScore) {
                    throw new Error(
                        `foldEvents: periodEnd score mismatch (event ${h}:${a}, fold ${homeScore}:${awayScore})`,
                    );
                }
                break;
            }
            case 'gameEnd': {
                const [h, a] = event.score;
                if (h !== homeScore || a !== awayScore) {
                    throw new Error(
                        `foldEvents: gameEnd score mismatch (event ${h}:${a}, fold ${homeScore}:${awayScore})`,
                    );
                }
                break;
            }
            case 'substitution':
            case 'timeout':
            case 'injury':
            case 'moment':
                // Narrative events: no box-score impact.
                break;
        }
    }

    return { homeScore, awayScore, quarterScores, box };
}
