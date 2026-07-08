import type { AwardKind, GameState, PlayerId, SeasonAward, SeasonAwards } from './model/types';
import { POSITIONS, overallRating } from './model/types';
import { aggregatePlayerSeasonStats } from './playerStats';
import { leagueConfig } from '../config/league';

export type { AwardKind, SeasonAward, SeasonAwards };

function nblPlayerIds(state: GameState): PlayerId[] {
    const nblIds = new Set(leagueConfig.teams.map((t) => t.id));
    const ids: PlayerId[] = [];
    for (const teamId of nblIds) {
        const team = state.teams[teamId];
        if (team) {
            ids.push(...team.playerIds);
        }
    }
    return ids;
}

/** Compute end-of-season individual awards from aggregated stats. */
export function computeSeasonAwards(state: GameState): SeasonAwards {
    const awards: SeasonAward[] = [];
    const candidates = nblPlayerIds(state)
        .map((id) => {
            const player = state.players[id];
            if (!player || !player.teamId) {
                return null;
            }
            const stats = aggregatePlayerSeasonStats(state, id);
            if (stats.games < 5) {
                return null;
            }
            return {
                id,
                player,
                stats,
            };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

    if (candidates.length === 0) {
        return { seasonYear: state.seasonYear, awards: [] };
    }

    const best = (pick: (c: (typeof candidates)[0]) => number) => {
        let top = candidates[0] as (typeof candidates)[0];
        for (const c of candidates) {
            if (pick(c) > pick(top)) {
                top = c;
            }
        }
        return top;
    };

    const mvp = best((c) => c.stats.gameScore);
    awards.push({
        kind: 'mvp',
        playerId: mvp.id,
        playerName: `${mvp.player.firstName} ${mvp.player.lastName}`,
        teamId: mvp.player.teamId as string,
        value: mvp.stats.gameScore,
    });

    const scoring = best((c) => c.stats.ppg);
    awards.push({
        kind: 'scoring',
        playerId: scoring.id,
        playerName: `${scoring.player.firstName} ${scoring.player.lastName}`,
        teamId: scoring.player.teamId as string,
        value: scoring.stats.ppg,
    });

    const rebounds = best((c) => c.stats.rpg);
    awards.push({
        kind: 'rebounds',
        playerId: rebounds.id,
        playerName: `${rebounds.player.firstName} ${rebounds.player.lastName}`,
        teamId: rebounds.player.teamId as string,
        value: rebounds.stats.rpg,
    });

    const assists = best((c) => c.stats.apg);
    awards.push({
        kind: 'assists',
        playerId: assists.id,
        playerName: `${assists.player.firstName} ${assists.player.lastName}`,
        teamId: assists.player.teamId as string,
        value: assists.stats.apg,
    });

    // All-NBL: best by position (one per slot).
    for (const pos of POSITIONS) {
        const atPos = candidates.filter((c) => c.player.position === pos);
        if (atPos.length === 0) {
            continue;
        }
        atPos.sort((a, b) => overallRating(b.player.attributes) - overallRating(a.player.attributes));
        const top = atPos[0] as (typeof candidates)[0];
        awards.push({
            kind: 'allNbl',
            playerId: top.id,
            playerName: `${top.player.firstName} ${top.player.lastName}`,
            teamId: top.player.teamId as string,
            value: overallRating(top.player.attributes),
        });
    }

    return { seasonYear: state.seasonYear, awards };
}

export function playerHasAward(awards: SeasonAwards | null, playerId: PlayerId, kind?: AwardKind): boolean {
    if (!awards) {
        return false;
    }
    return awards.awards.some((a) => a.playerId === playerId && (kind === undefined || a.kind === kind));
}
