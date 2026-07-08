import type { ExternalOffersConfig } from '../config/externalOffers';
import type { BoxLine, Fixture, GameState, PlayerId } from './model/types';
import { createEmptyBoxLine } from './model/types';

export interface PlayerSeasonStats {
    games: number;
    totals: BoxLine;
    ppg: number;
    rpg: number;
    apg: number;
    gameScore: number;
}

/** All fixtures from the season being evaluated (NBL, playoffs, BCL). */
export function allSeasonFixtures(state: GameState): Fixture[] {
    const fixtures: Fixture[] = [...state.fixtures];
    if (state.playoffs) {
        for (const series of state.playoffs.series) {
            fixtures.push(...series.games);
        }
    }
    const bcl = state.competitions.bcl;
    if (bcl) {
        fixtures.push(...bcl.fixtures);
        if (bcl.playoffs) {
            for (const series of bcl.playoffs.series) {
                fixtures.push(...series.games);
            }
        }
    }
    return fixtures;
}

/** Sum box-score lines for one player across all played season fixtures. */
export function aggregatePlayerSeasonStats(state: GameState, playerId: PlayerId): PlayerSeasonStats {
    const totals = createEmptyBoxLine();
    let games = 0;
    for (const fixture of allSeasonFixtures(state)) {
        if (!fixture.result) {
            continue;
        }
        const line = fixture.result.box[playerId];
        if (!line) {
            continue;
        }
        games++;
        totals.points += line.points;
        totals.rebounds += line.rebounds;
        totals.assists += line.assists;
        totals.steals += line.steals;
        totals.blocks += line.blocks;
        totals.turnovers += line.turnovers;
    }
    const divisor = Math.max(1, games);
    const gameScore = (totals.points + totals.rebounds + totals.assists + totals.steals + totals.blocks - totals.turnovers) / divisor;
    return {
        games,
        totals,
        ppg: totals.points / divisor,
        rpg: totals.rebounds / divisor,
        apg: totals.assists / divisor,
        gameScore,
    };
}

export function expectedGameScore(overall: number, cfg: ExternalOffersConfig): number {
    return cfg.expectedGameScoreSlope * overall - cfg.expectedGameScoreIntercept;
}

export function breakthroughRatio(actualGameScore: number, overall: number, cfg: ExternalOffersConfig): number {
    const expected = expectedGameScore(overall, cfg);
    return expected > 0 ? actualGameScore / expected : 0;
}
