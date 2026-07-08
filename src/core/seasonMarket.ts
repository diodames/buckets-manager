import type { BalanceConfig } from '../config/balance';
import { leagueConfig } from '../config/league';
import type { SeasonDepartureDef, SeasonMarketConfig, SeasonSigningDef } from '../config/seasonSignings';
import { seasonMarketForYear } from '../config/seasonSignings';
import type { GameConfig } from './game';
import { teamTier } from './economy';
import { generateFreeAgents, playerFromDef } from './league/generate';
import type { GameState, PendingFreeAgent, Player, PlayerId, Position, TeamId } from './model/types';
import { overallRating } from './model/types';
import { type Rng } from './rng';

function signingPlayerId(seasonYear: number, def: SeasonSigningDef): string {
    const slug = `${def.lastName}-${def.firstName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `SM-${seasonYear}-${slug}`;
}

function departureKey(dep: SeasonDepartureDef): string {
    return `${dep.teamId}:${dep.firstName}:${dep.lastName}`;
}

function buildSigningPlayer(
    rng: Rng,
    def: SeasonSigningDef,
    seasonYear: number,
    balance: BalanceConfig,
): Player {
    const id = signingPlayerId(seasonYear, def);
    return playerFromDef(rng.fork(`sm:${id}`), id, null, def, seasonYear, balance);
}

/** Seed the market with real NBL free agents for the current season year. */
export function initializeSeasonMarket(state: GameState, config: GameConfig, rng: Rng): number {
    const marketCfg = seasonMarketForYear(state.seasonYear);
    state.market.pendingFreeAgents = [];
    state.market.processedDepartureKeys = [];
    state.market.signingHints = {};

    if (!marketCfg) {
        const padding = generateFreeAgents(rng.fork('fa-padding'), 12, config.names, config.balance);
        for (const agent of padding) {
            state.players[agent.id] = agent;
        }
        return padding.length;
    }

    let added = 0;
    for (const def of marketCfg.openingFreeAgents) {
        const player = buildSigningPlayer(rng.fork(`open:${added}`), def, state.seasonYear, config.balance);
        state.players[player.id] = player;
        if (def.likelyTeamId) {
            state.market.signingHints[player.id] = def.likelyTeamId;
        }
        added++;
    }

    for (const def of marketCfg.timedSignings) {
        if (def.availableFromRound <= 1) {
            const player = buildSigningPlayer(rng.fork(`timed:${added}`), def, state.seasonYear, config.balance);
            state.players[player.id] = player;
            if (def.likelyTeamId) {
                state.market.signingHints[player.id] = def.likelyTeamId;
            }
            added++;
            continue;
        }
        const player = buildSigningPlayer(rng.fork(`pending:${def.lastName}`), def, state.seasonYear, config.balance);
        state.market.pendingFreeAgents.push({
            id: player.id,
            player,
            availableFromRound: def.availableFromRound,
        });
        if (def.likelyTeamId) {
            state.market.signingHints[player.id] = def.likelyTeamId;
        }
    }

    const padding = generateFreeAgents(
        rng.fork('fa-padding'),
        marketCfg.fictionalPadding,
        config.names,
        config.balance,
    );
    for (const agent of padding) {
        agent.id = `FA-${state.seasonYear}-${added + 1}`;
        state.players[agent.id] = agent;
        added++;
    }

    return added;
}

/** Release timed signings and process departures when a new round begins. */
export function advanceSeasonMarket(state: GameState, completedRound: number, marketCfg: SeasonMarketConfig | null): void {
    const nextRound = completedRound + 1;

    const stillPending: PendingFreeAgent[] = [];
    for (const pending of state.market.pendingFreeAgents) {
        if (pending.availableFromRound <= nextRound) {
            state.players[pending.player.id] = pending.player;
            continue;
        }
        stillPending.push(pending);
    }
    state.market.pendingFreeAgents = stillPending;

    if (!marketCfg) {
        return;
    }

    for (const dep of marketCfg.departures) {
        const key = departureKey(dep);
        if (state.market.processedDepartureKeys.includes(key)) {
            continue;
        }
        if (dep.departureRound !== nextRound) {
            continue;
        }
        const player = findRosterPlayer(state, dep.teamId, dep.firstName, dep.lastName);
        if (!player) {
            continue;
        }
        releaseToFreeAgency(state, player);
        state.market.processedDepartureKeys.push(key);
        hintReplacementSignings(state, dep.teamId, player.position, player.id);
    }
}

function isYouthProspectPlayer(state: GameState, playerId: PlayerId): boolean {
    return state.market.youthProspects.some((p) => p.player.id === playerId);
}

/** Nudge tier 4-5 clubs toward same-position FAs after a scripted departure. */
function hintReplacementSignings(state: GameState, clubId: TeamId, position: Position, departedPlayerId: PlayerId): void {
    if (teamTier(clubId, leagueConfig) < 4) {
        return;
    }
    const candidates = Object.values(state.players)
        .filter((p) => p.teamId === null && p.position === position && p.id !== departedPlayerId && !isYouthProspectPlayer(state, p.id))
        .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes))
        .slice(0, 3);
    for (const candidate of candidates) {
        state.market.signingHints[candidate.id] = clubId;
    }
}

function findRosterPlayer(
    state: GameState,
    teamId: TeamId,
    firstName: string,
    lastName: string,
): Player | undefined {
    const team = state.teams[teamId];
    if (!team) {
        return undefined;
    }
    for (const playerId of team.playerIds) {
        const player = state.players[playerId];
        if (player && player.firstName === firstName && player.lastName === lastName) {
            return player;
        }
    }
    return undefined;
}

function releaseToFreeAgency(state: GameState, player: Player): void {
    const team = player.teamId ? state.teams[player.teamId] : null;
    if (team) {
        team.playerIds = team.playerIds.filter((id) => id !== player.id);
        for (const position of Object.keys(team.tactics.starters) as Array<keyof typeof team.tactics.starters>) {
            if (team.tactics.starters[position] === player.id) {
                team.tactics.starters[position] = team.playerIds[0] ?? player.id;
            }
        }
    }
    player.teamId = null;
    player.contract = null;
    state.market.listings = state.market.listings.filter((l) => l.playerId !== player.id);
    state.market.incomingOffers = state.market.incomingOffers.filter((o) => o.playerId !== player.id);
}

export function aiSigningBoost(state: GameState, playerId: PlayerId, teamId: TeamId): number {
    return state.market.signingHints[playerId] === teamId ? 12 : 0;
}
