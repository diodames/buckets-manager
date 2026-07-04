import type { GameState } from '../core/model/types';
import type { MatchEvent } from '../core/sim/events';
import { t, type TranslationKey } from '../i18n';
import { teamDef } from './format';

function playerName(state: GameState, playerId: string): string {
    const player = state.players[playerId];
    return player ? `${player.firstName.charAt(0)}. ${player.lastName}` : playerId;
}

function clockText(event: MatchEvent): string {
    const total = Math.max(0, Math.round(event.clock.secondsLeft));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `Q${event.clock.period} ${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Turns a match event into one localized commentary line (or null for events
 * that should stay silent). Core stays language-free; all texts live here.
 */
export function commentaryLine(state: GameState, event: MatchEvent): string | null {
    const abbr = (teamId: string) => teamDef(teamId).abbr;
    let key: TranslationKey;
    let params: Record<string, string | number> = {};
    switch (event.t) {
        case 'playCall':
            // Only the fast break is worth a shout; half-court sets stay silent.
            if (event.play === 'fastBreak') {
                return `${clockText(event)}  ${t('cmt.fastBreak', { team: abbr(event.teamId) })}`;
            }
            return null;
        case 'shot': {
            if (event.blockedBy) {
                key = 'cmt.blocked';
                params = { blocker: playerName(state, event.blockedBy), player: playerName(state, event.playerId) };
                break;
            }
            key = event.made ? (`cmt.made.${event.kind}` as TranslationKey) : (`cmt.miss.${event.kind}` as TranslationKey);
            params = { player: playerName(state, event.playerId), team: abbr(event.teamId) };
            if (event.made && event.assistBy) {
                const base = t(key, params);
                return `${clockText(event)}  ${base} ${t('cmt.assist', { player: playerName(state, event.assistBy) })}`;
            }
            break;
        }
        case 'foul':
            key = 'cmt.foul';
            params = { player: playerName(state, event.playerId), on: playerName(state, event.onPlayerId) };
            break;
        case 'freeThrow':
            key = event.made ? 'cmt.ft.made' : 'cmt.ft.miss';
            params = { player: playerName(state, event.playerId), n: event.n, of: event.of };
            break;
        case 'rebound':
            key = event.offensive ? 'cmt.rebound.off' : 'cmt.rebound.def';
            params = { player: playerName(state, event.playerId) };
            break;
        case 'turnover':
            key = event.stolenBy ? 'cmt.steal' : 'cmt.turnover';
            params = {
                player: playerName(state, event.playerId),
                stealer: event.stolenBy ? playerName(state, event.stolenBy) : '',
            };
            break;
        case 'substitution':
            key = 'cmt.substitution';
            params = { team: abbr(event.teamId), out: playerName(state, event.out), in: playerName(state, event.in) };
            break;
        case 'timeout':
            key = 'cmt.timeout';
            params = { team: abbr(event.teamId) };
            break;
        case 'injury':
            key = 'cmt.injury';
            params = { player: playerName(state, event.playerId) };
            break;
        case 'moment':
            return null;
        case 'periodEnd':
            key = 'cmt.periodEnd';
            params = { period: event.clock.period, home: event.score[0], away: event.score[1] };
            break;
        case 'gameEnd':
            key = 'cmt.gameEnd';
            params = { home: event.score[0], away: event.score[1] };
            break;
    }
    return `${clockText(event)}  ${t(key, params)}`;
}
