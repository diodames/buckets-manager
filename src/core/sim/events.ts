import type { PlayerId, TeamId } from '../model/types';

// Every match is simulated into an ordered event stream. Three consumers
// share it: the instant-result fold (boxscore.ts), the text commentary (M2),
// and the 2D viewer (M6). Keep events data-only and language-free.

export interface EventClock {
    // 1..quarters are regulation, higher values are overtime periods.
    period: number;
    secondsLeft: number;
}

export type ShotKind = 'inside' | 'mid' | 'three';

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
      }
    | { t: 'rebound'; clock: EventClock; teamId: TeamId; playerId: PlayerId; offensive: boolean }
    | { t: 'turnover'; clock: EventClock; teamId: TeamId; playerId: PlayerId; stolenBy: PlayerId | null }
    | { t: 'periodEnd'; clock: EventClock; score: [number, number] }
    | { t: 'gameEnd'; clock: EventClock; score: [number, number] };
