import type { BalanceConfig, OffenseFocus, Pace } from '../../config/balance';
import type { MomentDef, MomentsConfig } from '../../config/moments';
import type { Attributes, MatchSummary, PlayerId, Position, TeamId } from '../model/types';
import { POSITIONS } from '../model/types';
import { createRng, type Rng } from '../rng';
import { foldEvents } from './boxscore';
import type { CourtSpot, EventClock, MatchEvent, ShotKind } from './events';

// Plain-data snapshot of one team entering the sim. Built by the caller from
// GameState; the engine itself never touches global state.
export interface SimPlayer {
    id: PlayerId;
    position: Position;
    attributes: Attributes;
    // Pre-match accumulated fatigue 0..100 (reduces starting energy).
    fatigue: number;
}

export interface TeamSimInput {
    teamId: TeamId;
    players: SimPlayer[];
    starters: Record<Position, PlayerId>;
    pace: Pace;
    offenseFocus: OffenseFocus;
}

// Coach decisions accepted between possessions.
export type MatchDecision =
    | { t: 'timeout'; teamId: TeamId }
    | { t: 'substitution'; teamId: TeamId; out: PlayerId; in: PlayerId }
    | { t: 'tactics'; teamId: TeamId; pace?: Pace; offenseFocus?: OffenseFocus };

// A pending story moment: the engine pauses until resolveMoment is called.
export interface PendingMoment {
    def: MomentDef;
    teamId: TeamId;
    playerId: PlayerId | null;
    clock: EventClock;
}

export type EngineStop =
    | { kind: 'moment'; moment: PendingMoment }
    | { kind: 'periodEnd'; period: number }
    | { kind: 'gameEnd' }
    | { kind: 'break' };

export interface MatchOutcome {
    summary: MatchSummary;
    // Post-match fatigue per player (absolute new value 0..100).
    fatigue: Record<PlayerId, number>;
    // Players injured during the match -> rounds out.
    injuries: Record<PlayerId, number>;
    // Morale deltas collected from resolved story moments.
    moraleDeltas: { team: Record<TeamId, number>; players: Record<PlayerId, number> };
    // Timeline of resolved moments (for the post-match report).
    momentLog: Array<{ momentId: string; choiceId: string; playerId: PlayerId | null }>;
}

interface Buff {
    teamId: TeamId;
    multiplier: number;
    possessionsLeft: number;
}

interface TeamState {
    input: TeamSimInput;
    active: Map<Position, SimPlayer>;
    energy: Map<PlayerId, number>;
    secondsPlayed: Map<PlayerId, number>;
    timeoutsLeft: number;
    // Players barred from returning (injury / protective sub).
    unavailable: Set<PlayerId>;
    // Rolling make/miss history of recent shots for streak detection.
    recentShots: boolean[];
}

function otherTeam(engine: MatchEngine, team: TeamState): TeamState {
    return team === engine.homeState ? engine.awayState : engine.homeState;
}

function normalizedDelta(a: number, b: number, attributeMax: number): number {
    return (a - b) / attributeMax;
}

/**
 * Stepwise possession-based match simulator. Deterministic given seed and
 * the identical sequence of decisions at identical possession indexes.
 *
 * Usage: repeatedly call run(...) which simulates possessions until a stop
 * condition (story moment, period end, requested break, game end). Between
 * calls, apply coach decisions. finish() folds everything into a summary.
 */
export class MatchEngine {
    readonly events: MatchEvent[] = [];
    readonly homeState: TeamState;
    readonly awayState: TeamState;
    readonly seed: number;

    private readonly rng: Rng;
    private readonly balance: BalanceConfig;
    private readonly moments: MomentsConfig;
    // Story moments only fire for this team (the user's club); null disables.
    private readonly storyTeamId: TeamId | null;

    private period = 1;
    private secondsLeft: number;
    private periodLengths: number[];
    private offense: TeamState;
    private homeScore = 0;
    private awayScore = 0;
    private possessionIndex = 0;
    private momentsFired = 0;
    private lastMomentPossession = -Infinity;
    private pendingMoment: PendingMoment | null = null;
    private buffs: Buff[] = [];
    private injuryRisk = new Map<PlayerId, number>();
    private injuries: Record<PlayerId, number> = {};
    private moraleTeam: Record<TeamId, number> = {};
    private moralePlayers: Record<PlayerId, number> = {};
    private momentLog: MatchOutcome['momentLog'] = [];
    private ended = false;

    constructor(input: {
        home: TeamSimInput;
        away: TeamSimInput;
        seed: number;
        balance: BalanceConfig;
        moments: MomentsConfig;
        storyTeamId?: TeamId | null;
    }) {
        this.seed = input.seed;
        this.rng = createRng(input.seed);
        this.balance = input.balance;
        this.moments = input.moments;
        this.storyTeamId = input.storyTeamId ?? null;
        this.homeState = this.buildTeamState(input.home);
        this.awayState = this.buildTeamState(input.away);
        const match = this.balance.match;
        this.periodLengths = Array.from({ length: match.quarters }, () => match.quarterSeconds);
        this.secondsLeft = match.quarterSeconds;
        this.offense = this.rng.chance(0.52) ? this.homeState : this.awayState;
    }

    private buildTeamState(input: TeamSimInput): TeamState {
        if (input.players.length < POSITIONS.length) {
            throw new Error(`MatchEngine: team ${input.teamId} has fewer than 5 players`);
        }
        const byId = new Map(input.players.map((p) => [p.id, p]));
        const active = new Map<Position, SimPlayer>();
        for (const position of POSITIONS) {
            const starter = byId.get(input.starters[position]);
            if (!starter) {
                throw new Error(`MatchEngine: team ${input.teamId} starter for ${position} not on roster`);
            }
            active.set(position, starter);
        }
        const energy = new Map<PlayerId, number>();
        for (const p of input.players) {
            energy.set(p.id, Math.max(20, 100 - p.fatigue * this.balance.energy.fatigueToEnergy));
        }
        return {
            input,
            active,
            energy,
            secondsPlayed: new Map(),
            timeoutsLeft: this.balance.timeouts.perTeam,
            unavailable: new Set(),
            recentShots: [],
        };
    }

    // --- public view of live state (for the UI) ---

    get score(): [number, number] {
        return [this.homeScore, this.awayScore];
    }

    get clock(): EventClock {
        return { period: this.period, secondsLeft: Math.max(0, Math.round(this.secondsLeft)) };
    }

    get isFinished(): boolean {
        return this.ended;
    }

    activeFive(teamId: TeamId): SimPlayer[] {
        return [...this.teamById(teamId).active.values()];
    }

    benchPlayers(teamId: TeamId): SimPlayer[] {
        const team = this.teamById(teamId);
        const activeIds = new Set([...team.active.values()].map((p) => p.id));
        return team.input.players.filter((p) => !activeIds.has(p.id) && !team.unavailable.has(p.id) && !(p.id in this.injuries));
    }

    energyOf(playerId: PlayerId): number {
        return this.homeState.energy.get(playerId) ?? this.awayState.energy.get(playerId) ?? 0;
    }

    timeoutsOf(teamId: TeamId): number {
        return this.teamById(teamId).timeoutsLeft;
    }

    private teamById(teamId: TeamId): TeamState {
        if (this.homeState.input.teamId === teamId) {
            return this.homeState;
        }
        if (this.awayState.input.teamId === teamId) {
            return this.awayState;
        }
        throw new Error(`MatchEngine: unknown team '${teamId}'`);
    }

    // --- decisions ---

    applyDecision(decision: MatchDecision): void {
        const team = this.teamById(decision.teamId);
        switch (decision.t) {
            case 'timeout': {
                if (team.timeoutsLeft <= 0) {
                    return;
                }
                team.timeoutsLeft--;
                const cfg = this.balance.timeouts;
                for (const p of team.active.values()) {
                    this.addEnergy(team, p.id, cfg.energyBoost);
                }
                this.buffs.push({ teamId: decision.teamId, multiplier: cfg.buffMultiplier, possessionsLeft: cfg.buffPossessions });
                this.events.push({ t: 'timeout', clock: this.clock, teamId: decision.teamId });
                break;
            }
            case 'substitution': {
                this.substitute(team, decision.out, decision.in);
                break;
            }
            case 'tactics': {
                if (decision.pace) {
                    team.input.pace = decision.pace;
                }
                if (decision.offenseFocus) {
                    team.input.offenseFocus = decision.offenseFocus;
                }
                break;
            }
        }
    }

    resolveMoment(choiceId: string): void {
        const pending = this.pendingMoment;
        if (!pending) {
            return;
        }
        const choice = pending.def.choices.find((c) => c.id === choiceId) ?? pending.def.choices[0];
        if (!choice) {
            this.pendingMoment = null;
            return;
        }
        const team = this.teamById(pending.teamId);
        if (choice.buffMultiplier && choice.buffPossessions) {
            this.buffs.push({ teamId: pending.teamId, multiplier: choice.buffMultiplier, possessionsLeft: choice.buffPossessions });
        }
        if (choice.energyBoost) {
            for (const p of team.active.values()) {
                this.addEnergy(team, p.id, choice.energyBoost);
            }
        }
        if (pending.playerId) {
            if (choice.injuryRiskMultiplier) {
                this.injuryRisk.set(pending.playerId, (this.injuryRisk.get(pending.playerId) ?? 1) * choice.injuryRiskMultiplier);
            }
            if (choice.subOutPlayer) {
                this.forceOff(team, pending.playerId);
            }
            if (choice.playerMorale) {
                this.moralePlayers[pending.playerId] = (this.moralePlayers[pending.playerId] ?? 0) + choice.playerMorale;
            }
        }
        if (choice.teamMorale) {
            this.moraleTeam[pending.teamId] = (this.moraleTeam[pending.teamId] ?? 0) + choice.teamMorale;
        }
        this.momentLog.push({ momentId: pending.def.id, choiceId: choice.id, playerId: pending.playerId });
        this.events.push({
            t: 'moment',
            clock: pending.clock,
            momentId: pending.def.id,
            teamId: pending.teamId,
            playerId: pending.playerId,
            choiceId: choice.id,
        });
        this.pendingMoment = null;
    }

    // --- main loop ---

    /**
     * Simulates possessions until a stop. `breakAfterPossession` requests a
     * coaching break at the next possession boundary.
     */
    run(options?: { breakAfterPossession?: boolean }): EngineStop {
        if (this.ended) {
            return { kind: 'gameEnd' };
        }
        if (this.pendingMoment) {
            return { kind: 'moment', moment: this.pendingMoment };
        }
        for (;;) {
            const stop = this.playPossession();
            if (stop) {
                return stop;
            }
            if (options?.breakAfterPossession) {
                return { kind: 'break' };
            }
        }
    }

    /** Runs the rest of the match, auto-resolving moments with their first choice. */
    finish(): MatchOutcome {
        while (!this.ended) {
            const stop = this.run();
            if (stop.kind === 'moment') {
                this.resolveMoment(stop.moment.def.choices[0]?.id ?? '');
            }
        }
        const folded = foldEvents(this.events, this.homeState.input.teamId);
        const summary: MatchSummary = {
            homeScore: folded.homeScore,
            awayScore: folded.awayScore,
            quarterScores: folded.quarterScores,
            box: folded.box,
            seed: this.seed,
        };
        const fatigue: Record<PlayerId, number> = {};
        for (const team of [this.homeState, this.awayState]) {
            for (const p of team.input.players) {
                const energy = team.energy.get(p.id) ?? 100;
                fatigue[p.id] = Math.max(0, Math.min(100, Math.round(100 - energy)));
            }
        }
        return {
            summary,
            fatigue,
            injuries: this.injuries,
            moraleDeltas: { team: this.moraleTeam, players: this.moralePlayers },
            momentLog: this.momentLog,
        };
    }

    // --- internals ---

    private addEnergy(team: TeamState, playerId: PlayerId, amount: number): void {
        team.energy.set(playerId, Math.max(0, Math.min(100, (team.energy.get(playerId) ?? 100) + amount)));
    }

    private skillMult(team: TeamState, playerId: PlayerId): number {
        const cfg = this.balance.energy;
        const energy = team.energy.get(playerId) ?? 100;
        let mult = cfg.minSkillMult + (1 - cfg.minSkillMult) * (energy / 100);
        for (const buff of this.buffs) {
            if (buff.teamId === team.input.teamId && buff.possessionsLeft > 0) {
                mult *= buff.multiplier;
            }
        }
        return mult;
    }

    private skill(team: TeamState, player: SimPlayer, key: keyof Attributes): number {
        return player.attributes[key] * this.skillMult(team, player.id);
    }

    private pickWeighted(players: SimPlayer[], weight: (p: SimPlayer) => number): SimPlayer {
        const weights = players.map((p) => Math.max(1, weight(p)));
        return players[this.rng.weightedIndex(weights)] as SimPlayer;
    }

    private substitute(team: TeamState, outId: PlayerId, inId: PlayerId): void {
        const slot = [...team.active.entries()].find(([, p]) => p.id === outId);
        const sub = team.input.players.find((p) => p.id === inId);
        if (!slot || !sub || team.unavailable.has(inId) || inId in this.injuries) {
            return;
        }
        const alreadyActive = [...team.active.values()].some((p) => p.id === inId);
        if (alreadyActive) {
            return;
        }
        team.active.set(slot[0], sub);
        this.events.push({ t: 'substitution', clock: this.clock, teamId: team.input.teamId, out: outId, in: inId });
    }

    private forceOff(team: TeamState, playerId: PlayerId): void {
        team.unavailable.add(playerId);
        const bench = this.benchPlayers(team.input.teamId);
        const slot = [...team.active.entries()].find(([, p]) => p.id === playerId);
        if (!slot) {
            return;
        }
        const replacement = bench
            .filter((p) => p.id !== playerId)
            .sort((a, b) => (team.energy.get(b.id) ?? 0) - (team.energy.get(a.id) ?? 0))[0];
        if (replacement) {
            this.substitute(team, playerId, replacement.id);
        }
    }

    private autoSubstitutions(team: TeamState): void {
        const cfg = this.balance.energy;
        for (const [, player] of team.active) {
            const energy = team.energy.get(player.id) ?? 100;
            if (energy >= cfg.autoSubThreshold) {
                continue;
            }
            const bench = this.benchPlayers(team.input.teamId)
                .filter((p) => (team.energy.get(p.id) ?? 0) >= energy + cfg.autoSubMinGain)
                .sort(
                    (a, b) =>
                        (team.energy.get(b.id) ?? 0) + (b.position === player.position ? 15 : 0) -
                        ((team.energy.get(a.id) ?? 0) + (a.position === player.position ? 15 : 0)),
                );
            const sub = bench[0];
            if (sub) {
                this.substitute(team, player.id, sub.id);
            }
        }
    }

    private maybeInjury(team: TeamState, clock: EventClock): PendingMoment | null {
        const cfg = this.balance.injuries;
        for (const p of team.active.values()) {
            const energy = team.energy.get(p.id) ?? 100;
            let chance = cfg.basePerPossession * (this.injuryRisk.get(p.id) ?? 1);
            if (energy < cfg.lowEnergyThreshold) {
                chance *= cfg.lowEnergyMultiplier;
            }
            if (this.rng.chance(chance)) {
                this.injuries[p.id] = this.rng.int(1, cfg.maxRoundsOut);
                this.events.push({ t: 'injury', clock, teamId: team.input.teamId, playerId: p.id });
                this.forceOff(team, p.id);
            }
        }
        return null;
    }

    private maybeStoryMoment(clock: EventClock): PendingMoment | null {
        if (!this.storyTeamId || this.momentsFired >= this.moments.maxPerMatch) {
            return null;
        }
        if (this.possessionIndex - this.lastMomentPossession < this.moments.minPossessionGap) {
            return null;
        }
        const team = this.teamById(this.storyTeamId);
        const isHome = team === this.homeState;
        const recent = team.recentShots.slice(-4);
        const trigger: MomentDef['trigger'] | null =
            recent.length === 4 && recent.every(Boolean)
                ? 'hotStreak'
                : recent.length === 4 && recent.every((s) => !s)
                  ? 'coldStreak'
                  : (() => {
                        const lowEnergyStar = [...team.active.values()].find((p) => (team.energy.get(p.id) ?? 100) < 30);
                        if (lowEnergyStar) {
                            return 'injuryScare';
                        }
                        const margin = isHome ? this.homeScore - this.awayScore : this.awayScore - this.homeScore;
                        if (margin < -6 && this.rng.chance(0.15)) {
                            return 'refereeCall';
                        }
                        if (isHome && margin > 6 && this.rng.chance(0.12)) {
                            return 'crowdSurge';
                        }
                        return null;
                    })();
        if (!trigger) {
            return null;
        }
        const def = this.moments.defs.find((d) => d.trigger === trigger && (!d.homeOnly || isHome));
        if (!def || !this.rng.chance(def.chance)) {
            return null;
        }
        let playerId: PlayerId | null = null;
        if (trigger === 'hotStreak' || trigger === 'injuryScare') {
            const candidates = [...team.active.values()];
            const target =
                trigger === 'injuryScare'
                    ? candidates.sort((a, b) => (team.energy.get(a.id) ?? 100) - (team.energy.get(b.id) ?? 100))[0]
                    : this.pickWeighted(candidates, (p) => p.attributes.shooting2 + p.attributes.shooting3);
            playerId = target?.id ?? null;
        }
        this.momentsFired++;
        this.lastMomentPossession = this.possessionIndex;
        return { def, teamId: this.storyTeamId, playerId, clock };
    }

    /** Plays one possession; returns a stop condition or null. */
    private playPossession(): EngineStop | null {
        const balance = this.balance;
        const match = balance.match;
        const offense = this.offense;
        const defense = otherTeam(this, offense);
        const clock: EventClock = this.clock;
        const attributeMax = balance.playerGen.attributeMax;

        this.possessionIndex++;
        for (const buff of this.buffs) {
            buff.possessionsLeft--;
        }
        this.buffs = this.buffs.filter((b) => b.possessionsLeft > 0);

        // Clock and energy.
        const paceFactor = match.paceFactor[offense.input.pace];
        const rawSeconds = this.rng.int(match.possessionMinSeconds, match.possessionMaxSeconds);
        const used = Math.max(4, Math.round(rawSeconds * paceFactor));
        this.secondsLeft = Math.max(0, this.secondsLeft - used);
        for (const team of [this.homeState, this.awayState]) {
            const activeIds = new Set([...team.active.values()].map((p) => p.id));
            for (const p of team.input.players) {
                if (activeIds.has(p.id)) {
                    team.secondsPlayed.set(p.id, (team.secondsPlayed.get(p.id) ?? 0) + used);
                    this.addEnergy(team, p.id, -balance.energy.drainPerSecond * used * paceFactor);
                } else {
                    this.addEnergy(team, p.id, balance.energy.benchRegenPerSecond * used);
                }
            }
        }

        const offFive = [...offense.active.values()];
        const defFive = [...defense.active.values()];
        const handler = this.pickWeighted(offFive, (p) => p.attributes.dribbling + p.attributes.passing + p.attributes.iq);

        // Turnover check.
        const handling = (this.skill(offense, handler, 'dribbling') + this.skill(offense, handler, 'passing')) / 2;
        const pressure = defFive.reduce((sum, p) => sum + this.skill(defense, p, 'stealing'), 0) / defFive.length;
        const turnoverProb = Math.min(
            0.4,
            Math.max(0.02, balance.turnovers.base - normalizedDelta(handling, pressure, attributeMax) * balance.turnovers.ballHandlingSwing * 10),
        );
        if (this.rng.chance(turnoverProb)) {
            const stolen = this.rng.chance(balance.turnovers.stealShare);
            const stealer = stolen ? this.pickWeighted(defFive, (p) => p.attributes.stealing) : null;
            this.events.push({ t: 'turnover', clock, teamId: offense.input.teamId, playerId: handler.id, stolenBy: stealer?.id ?? null });
            this.offense = defense;
            return this.endOfPossession(clock);
        }

        // Shot.
        const mix = balance.shots.mix[offense.input.offenseFocus];
        const kinds: ShotKind[] = ['inside', 'mid', 'three'];
        const kind = kinds[this.rng.weightedIndex([mix.inside, mix.mid, mix.three])] as ShotKind;
        const shooterSkill = (p: SimPlayer): number =>
            kind === 'three'
                ? this.skill(offense, p, 'shooting3')
                : kind === 'mid'
                  ? this.skill(offense, p, 'shooting2')
                  : (this.skill(offense, p, 'shooting2') + this.skill(offense, p, 'rebounding')) / 2;
        const shooter = this.pickWeighted(offFive, (p) => shooterSkill(p) + p.attributes.iq / 2);
        const defender = defense.active.get(shooter.position) ?? this.pickWeighted(defFive, (p) => p.attributes.defense);

        let makeProb =
            balance.shots.base[kind] +
            normalizedDelta(shooterSkill(shooter), this.skill(defense, defender, 'defense'), attributeMax) * balance.shots.skillSwing;
        if (offense === this.homeState) {
            makeProb += match.homeAdvantage;
        }
        makeProb = Math.min(balance.shots.makeProbMax, Math.max(balance.shots.makeProbMin, makeProb));

        const made = this.rng.chance(makeProb);
        const points = made ? (kind === 'three' ? 3 : 2) : 0;
        let assistBy: PlayerId | null = null;
        if (made && this.rng.chance(balance.shots.assistChance)) {
            const mates = offFive.filter((p) => p.id !== shooter.id);
            assistBy = this.pickWeighted(mates, (p) => p.attributes.passing).id;
        }
        const spot = this.shotSpot(kind, offense === this.homeState);
        this.events.push({ t: 'shot', clock, teamId: offense.input.teamId, playerId: shooter.id, kind, made, points, assistBy, spot });
        offense.recentShots.push(made);
        if (offense.recentShots.length > 8) {
            offense.recentShots.shift();
        }

        if (made) {
            if (offense === this.homeState) {
                this.homeScore += points;
            } else {
                this.awayScore += points;
            }
            this.offense = defense;
            return this.endOfPossession(clock);
        }

        // Rebound battle.
        const offReb = offFive.reduce((s, p) => s + this.skill(offense, p, 'rebounding'), 0) / offFive.length;
        const defReb = defFive.reduce((s, p) => s + this.skill(defense, p, 'rebounding'), 0) / defFive.length;
        const offRebProb = Math.min(
            0.5,
            Math.max(0.05, balance.rebounds.offensiveChance + normalizedDelta(offReb, defReb, attributeMax) * balance.rebounds.skillSwing * 5),
        );
        if (this.rng.chance(offRebProb)) {
            const rebounder = this.pickWeighted(offFive, (p) => p.attributes.rebounding);
            this.events.push({ t: 'rebound', clock, teamId: offense.input.teamId, playerId: rebounder.id, offensive: true });
        } else {
            const rebounder = this.pickWeighted(defFive, (p) => p.attributes.rebounding);
            this.events.push({ t: 'rebound', clock, teamId: defense.input.teamId, playerId: rebounder.id, offensive: false });
            this.offense = defense;
        }
        return this.endOfPossession(clock);
    }

    private shotSpot(kind: ShotKind, homeAttack: boolean): CourtSpot {
        // Home attacks the x=1 basket. Distances are fractions of court length.
        const depth = kind === 'inside' ? this.rng.next() * 0.06 : kind === 'mid' ? 0.08 + this.rng.next() * 0.1 : 0.2 + this.rng.next() * 0.08;
        const x = homeAttack ? 0.94 - depth : 0.06 + depth;
        const y = 0.2 + this.rng.next() * 0.6;
        return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) };
    }

    private endOfPossession(clock: EventClock): EngineStop | null {
        this.maybeInjury(this.homeState, clock);
        this.maybeInjury(this.awayState, clock);
        this.autoSubstitutions(this.homeState);
        this.autoSubstitutions(this.awayState);

        if (this.secondsLeft <= 0) {
            this.events.push({ t: 'periodEnd', clock: { period: this.period, secondsLeft: 0 }, score: [this.homeScore, this.awayScore] });
            const isLastScheduled = this.period === this.periodLengths.length;
            if (isLastScheduled && this.homeScore === this.awayScore) {
                this.periodLengths.push(this.balance.match.overtimeSeconds);
            }
            if (this.period < this.periodLengths.length) {
                this.period++;
                this.secondsLeft = this.periodLengths[this.period - 1] as number;
                return { kind: 'periodEnd', period: this.period - 1 };
            }
            this.ended = true;
            this.events.push({
                t: 'gameEnd',
                clock: { period: this.period, secondsLeft: 0 },
                score: [this.homeScore, this.awayScore],
            });
            return { kind: 'gameEnd' };
        }

        const moment = this.maybeStoryMoment(clock);
        if (moment) {
            this.pendingMoment = moment;
            return { kind: 'moment', moment };
        }
        return null;
    }
}

export interface SimResult {
    events: MatchEvent[];
    summary: MatchSummary;
    outcome: MatchOutcome;
}

/** One-shot simulation without coach decisions (AI vs AI, instant sim). */
export function simulateMatch(input: {
    home: TeamSimInput;
    away: TeamSimInput;
    seed: number;
    balance: BalanceConfig;
    moments: MomentsConfig;
}): SimResult {
    const engine = new MatchEngine({ ...input, storyTeamId: null });
    const outcome = engine.finish();
    return { events: engine.events, summary: outcome.summary, outcome };
}
