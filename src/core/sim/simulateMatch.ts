import type { BalanceConfig, OffenseFocus, Pace } from '../../config/balance';
import type { Attributes, MatchSummary, PlayerId, Position, TeamId } from '../model/types';
import { POSITIONS } from '../model/types';
import { createRng, type Rng } from '../rng';
import { foldEvents } from './boxscore';
import type { EventClock, MatchEvent, ShotKind } from './events';

// Plain-data snapshot of one team entering the sim. Built by the caller from
// GameState; the sim itself never touches global state.
export interface SimPlayer {
    id: PlayerId;
    position: Position;
    attributes: Attributes;
}

export interface TeamSimInput {
    teamId: TeamId;
    players: SimPlayer[];
    starters: Record<Position, PlayerId>;
    pace: Pace;
    offenseFocus: OffenseFocus;
}

export interface SimResult {
    events: MatchEvent[];
    summary: MatchSummary;
}

interface TeamState {
    input: TeamSimInput;
    active: Map<Position, SimPlayer>;
    secondsPlayed: Map<PlayerId, number>;
}

function buildTeamState(input: TeamSimInput): TeamState {
    if (input.players.length < POSITIONS.length) {
        throw new Error(`simulateMatch: team ${input.teamId} has fewer than 5 players`);
    }
    const byId = new Map(input.players.map((p) => [p.id, p]));
    const active = new Map<Position, SimPlayer>();
    for (const position of POSITIONS) {
        const starter = byId.get(input.starters[position]);
        if (!starter) {
            throw new Error(`simulateMatch: team ${input.teamId} starter for ${position} not on roster`);
        }
        active.set(position, starter);
    }
    return { input, active, secondsPlayed: new Map() };
}

function activePlayers(team: TeamState): SimPlayer[] {
    return [...team.active.values()];
}

function overall(attributes: Attributes): number {
    return (
        (attributes.shooting2 +
            attributes.shooting3 +
            attributes.passing +
            attributes.dribbling +
            attributes.defense +
            attributes.rebounding +
            attributes.iq) /
        7
    );
}

/** Weighted pick over the active five. */
function pickWeighted(rng: Rng, players: SimPlayer[], weight: (p: SimPlayer) => number): SimPlayer {
    const weights = players.map((p) => Math.max(1, weight(p)));
    return players[rng.weightedIndex(weights)] as SimPlayer;
}

/** Rest the most-played active players in favor of the strongest fresh bench. */
function rotateLineup(team: TeamState, swapCount: number): void {
    const bench = team.input.players.filter((p) => ![...team.active.values()].some((a) => a.id === p.id));
    if (bench.length === 0) {
        return;
    }
    const byMinutes = [...team.active.entries()].sort(
        (a, b) => (team.secondsPlayed.get(b[1].id) ?? 0) - (team.secondsPlayed.get(a[1].id) ?? 0),
    );
    const benchByQuality = bench.sort(
        (a, b) => overall(b.attributes) - (team.secondsPlayed.get(b.id) ?? 0) / 60 - (overall(a.attributes) - (team.secondsPlayed.get(a.id) ?? 0) / 60),
    );
    for (let i = 0; i < Math.min(swapCount, benchByQuality.length); i++) {
        const slot = byMinutes[i];
        const sub = benchByQuality[i];
        if (slot && sub) {
            team.active.set(slot[0], sub);
        }
    }
}

function normalizedDelta(a: number, b: number, attributeMax: number): number {
    return (a - b) / attributeMax;
}

/**
 * Possession-based match simulation. Deterministic for a given seed: the same
 * inputs always produce the same event stream and summary.
 */
export function simulateMatch(input: {
    home: TeamSimInput;
    away: TeamSimInput;
    seed: number;
    balance: BalanceConfig;
}): SimResult {
    const { balance, seed } = input;
    const match = balance.match;
    const rng = createRng(seed);
    const events: MatchEvent[] = [];

    const home = buildTeamState(input.home);
    const away = buildTeamState(input.away);
    const attributeMax = balance.playerGen.attributeMax;

    let homeScore = 0;
    let awayScore = 0;
    // Home wins the tip slightly more often than not.
    let offense: TeamState = rng.chance(0.52) ? home : away;

    const periodLengths: number[] = Array.from({ length: match.quarters }, () => match.quarterSeconds);

    for (let periodIndex = 0; periodIndex < periodLengths.length; periodIndex++) {
        const period = periodIndex + 1;
        let secondsLeft = periodLengths[periodIndex] as number;

        while (secondsLeft > 0) {
            const defenseTeam = offense === home ? away : home;
            const clock: EventClock = { period, secondsLeft };
            const paceFactor = match.paceFactor[offense.input.pace];
            const rawSeconds = rng.int(match.possessionMinSeconds, match.possessionMaxSeconds);
            const used = Math.max(4, Math.round(rawSeconds * paceFactor));
            secondsLeft = Math.max(0, secondsLeft - used);
            for (const team of [home, away]) {
                for (const p of team.active.values()) {
                    team.secondsPlayed.set(p.id, (team.secondsPlayed.get(p.id) ?? 0) + used);
                }
            }

            const offFive = activePlayers(offense);
            const defFive = activePlayers(defenseTeam);
            const handler = pickWeighted(rng, offFive, (p) => p.attributes.dribbling + p.attributes.passing + p.attributes.iq);

            // Turnover check first: bad handling against ball pressure.
            const handling = (handler.attributes.dribbling + handler.attributes.passing) / 2;
            const pressure = defFive.reduce((sum, p) => sum + p.attributes.stealing, 0) / defFive.length;
            const turnoverProb = Math.min(
                0.4,
                Math.max(0.02, balance.turnovers.base - normalizedDelta(handling, pressure, attributeMax) * balance.turnovers.ballHandlingSwing * 10),
            );
            if (rng.chance(turnoverProb)) {
                const stolen = rng.chance(balance.turnovers.stealShare);
                const stealer = stolen ? pickWeighted(rng, defFive, (p) => p.attributes.stealing) : null;
                events.push({ t: 'turnover', clock, teamId: offense.input.teamId, playerId: handler.id, stolenBy: stealer?.id ?? null });
                offense = defenseTeam;
                continue;
            }

            // Shot: kind from the tactics mix, shooter from skill weights.
            const mix = balance.shots.mix[offense.input.offenseFocus];
            const kinds: ShotKind[] = ['inside', 'mid', 'three'];
            const kind = kinds[rng.weightedIndex([mix.inside, mix.mid, mix.three])] as ShotKind;
            const shooterSkill = (p: SimPlayer): number =>
                kind === 'three' ? p.attributes.shooting3 : kind === 'mid' ? p.attributes.shooting2 : (p.attributes.shooting2 + p.attributes.rebounding) / 2;
            const shooter = pickWeighted(rng, offFive, (p) => shooterSkill(p) + p.attributes.iq / 2);
            const defender = defenseTeam.active.get(shooter.position) ?? pickWeighted(rng, defFive, (p) => p.attributes.defense);

            let makeProb =
                balance.shots.base[kind] +
                normalizedDelta(shooterSkill(shooter), defender.attributes.defense, attributeMax) * balance.shots.skillSwing;
            if (offense === home) {
                makeProb += match.homeAdvantage;
            }
            makeProb = Math.min(balance.shots.makeProbMax, Math.max(balance.shots.makeProbMin, makeProb));

            const made = rng.chance(makeProb);
            const points = made ? (kind === 'three' ? 3 : 2) : 0;
            let assistBy: PlayerId | null = null;
            if (made && rng.chance(balance.shots.assistChance)) {
                const mates = offFive.filter((p) => p.id !== shooter.id);
                assistBy = pickWeighted(rng, mates, (p) => p.attributes.passing).id;
            }
            events.push({ t: 'shot', clock, teamId: offense.input.teamId, playerId: shooter.id, kind, made, points, assistBy });

            if (made) {
                if (offense === home) {
                    homeScore += points;
                } else {
                    awayScore += points;
                }
                offense = defenseTeam;
                continue;
            }

            // Missed shot: rebound battle.
            const offRebSkill = offFive.reduce((s, p) => s + p.attributes.rebounding, 0) / offFive.length;
            const defRebSkill = defFive.reduce((s, p) => s + p.attributes.rebounding, 0) / defFive.length;
            const offRebProb = Math.min(
                0.5,
                Math.max(
                    0.05,
                    balance.rebounds.offensiveChance + normalizedDelta(offRebSkill, defRebSkill, attributeMax) * balance.rebounds.skillSwing * 5,
                ),
            );
            if (rng.chance(offRebProb)) {
                const rebounder = pickWeighted(rng, offFive, (p) => p.attributes.rebounding);
                events.push({ t: 'rebound', clock, teamId: offense.input.teamId, playerId: rebounder.id, offensive: true });
                // Offense retains the ball; loop continues with the same offense.
            } else {
                const rebounder = pickWeighted(rng, defFive, (p) => p.attributes.rebounding);
                events.push({ t: 'rebound', clock, teamId: defenseTeam.input.teamId, playerId: rebounder.id, offensive: false });
                offense = defenseTeam;
            }
        }

        events.push({ t: 'periodEnd', clock: { period, secondsLeft: 0 }, score: [homeScore, awayScore] });

        const isLastScheduled = periodIndex === periodLengths.length - 1;
        if (isLastScheduled && homeScore === awayScore) {
            // Tie after the final period: append an overtime period.
            periodLengths.push(match.overtimeSeconds);
        }
        if (!isLastScheduled || homeScore === awayScore) {
            rotateLineup(home, balance.lineup.quarterSwapCount);
            rotateLineup(away, balance.lineup.quarterSwapCount);
        }
    }

    events.push({
        t: 'gameEnd',
        clock: { period: periodLengths.length, secondsLeft: 0 },
        score: [homeScore, awayScore],
    });

    const folded = foldEvents(events, input.home.teamId);
    const summary: MatchSummary = {
        homeScore: folded.homeScore,
        awayScore: folded.awayScore,
        quarterScores: folded.quarterScores,
        box: folded.box,
        seed,
    };
    return { events, summary };
}
