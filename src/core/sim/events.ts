import type { PlayerId, TeamId } from '../model/types';

// Every match is simulated into an ordered event stream. Three consumers
// share it: the instant-result fold (boxscore.ts), the text commentary, and
// the 2D viewer. Keep events data-only and language-free.

export interface EventClock {
    // 1..quarters are regulation, higher values are overtime periods.
    period: number;
    secondsLeft: number;
}

export type ShotKind = 'inside' | 'mid' | 'three';

// Normalized court position: x 0..1 (attack direction of the home team is
// towards x=1), y 0..1 across the court width.
export interface CourtSpot {
    x: number;
    y: number;
}

export type MatchEvent =
    | {
          t: 'shot';
          clock: EventClock;
          teamId: TeamId;
          playerId: PlayerId;
          kind: ShotKind;
          made: boolean;
          points: number;
          assistBy: PlayerId | null;
          spot: CourtSpot;
      }
    | { t: 'rebound'; clock: EventClock; teamId: TeamId; playerId: PlayerId; offensive: boolean }
    | { t: 'turnover'; clock: EventClock; teamId: TeamId; playerId: PlayerId; stolenBy: PlayerId | null }
    | { t: 'substitution'; clock: EventClock; teamId: TeamId; out: PlayerId; in: PlayerId }
    | { t: 'timeout'; clock: EventClock; teamId: TeamId }
    | { t: 'injury'; clock: EventClock; teamId: TeamId; playerId: PlayerId }
    | { t: 'moment'; clock: EventClock; momentId: string; teamId: TeamId; playerId: PlayerId | null; choiceId: string | null }
    | { t: 'periodEnd'; clock: EventClock; score: [number, number] }
    | { t: 'gameEnd'; clock: EventClock; score: [number, number] };
