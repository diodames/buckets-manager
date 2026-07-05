import { BT, Rect2i, Vector2i } from 'blit386';
import type { DefenseScheme, PlayType } from '../config/balance';
import { courtConfig } from '../config/court';
import type { PlayerId, TeamId } from '../core/model/types';
import type { CourtSpot, MatchEvent } from '../core/sim/events';

interface Sprite {
    x: number;
    y: number;
    tx: number;
    ty: number;
    jersey: number;
    trim: number;
    speedMult: number;
    // Ticks spent camping inside the attacking key (spacing rule).
    keyTicks: number;
    // Ticks until this off-ball player drifts to a new idle spot.
    cutTimer: number;
}

interface Role {
    side: 'offense' | 'defense';
    index: number;
    // The offensive player this defender is responsible for (man/press).
    markId: PlayerId | null;
}

type BallAction =
    | { type: 'pass'; toId: PlayerId }
    | { type: 'shoot'; rimNx: number; made: boolean; blocked: boolean; inboundAfter: boolean }
    | { type: 'bounce' };

interface BallFlight {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    t: number;
    dur: number;
    arc: number;
    // Sprite the flight is homing to (pass target keeps moving).
    followId: PlayerId | null;
    // A made basket triggers the loser's baseline inbound when it lands.
    inboundAfter: boolean;
}

interface CrowdPixel {
    x: number;
    y: number;
    slot: number;
}

// Timed play scripts: actor indexes address the active five (0..4 = PG, SG,
// SF, PF, C) of the CURRENT offense; spots are normalized for an attack on
// the x=1 basket and mirrored at execution time.
type ScriptAction =
    | { kind: 'move'; actor: number; x: number; y: number; speed: number }
    | { kind: 'pass'; from: number | null; to: number }
    | { kind: 'take'; actor: number };

interface ScriptStep {
    at: number;
    actions: ScriptAction[];
}

type Phase = 'idle' | 'advance' | 'set' | 'freeThrow';

// How the CURRENT dead/live ball situation hands possession to the next
// play call: baseline inbound, outlet from a defensive board, or a steal.
type Transition = 'none' | 'inbound' | 'outlet' | 'steal' | 'deadBall';

// Idle-drift spacing per play (also the end-spots the set scripts target).
const FORMATIONS: Record<PlayType, CourtSpot[]> = {
    pickRoll: [
        { x: 0.66, y: 0.5 }, { x: 0.86, y: 0.14 }, { x: 0.86, y: 0.86 }, { x: 0.76, y: 0.76 }, { x: 0.9, y: 0.55 },
    ],
    motion: [
        { x: 0.68, y: 0.5 }, { x: 0.77, y: 0.26 }, { x: 0.77, y: 0.74 }, { x: 0.88, y: 0.16 }, { x: 0.88, y: 0.84 },
    ],
    iso: [
        { x: 0.74, y: 0.35 }, { x: 0.7, y: 0.86 }, { x: 0.86, y: 0.9 }, { x: 0.87, y: 0.72 }, { x: 0.64, y: 0.68 },
    ],
    post: [
        { x: 0.66, y: 0.48 }, { x: 0.76, y: 0.28 }, { x: 0.86, y: 0.14 }, { x: 0.74, y: 0.8 }, { x: 0.88, y: 0.62 },
    ],
    fastBreak: [
        { x: 0.78, y: 0.5 }, { x: 0.88, y: 0.24 }, { x: 0.88, y: 0.76 }, { x: 0.68, y: 0.5 }, { x: 0.84, y: 0.55 },
    ],
};

// 2-3 zone spots (defending the x=1 basket); doubles as the retreat shell
// man defenders sprint back to while the offense is still advancing.
const ZONE_SPOTS: CourtSpot[] = [
    { x: 0.79, y: 0.36 }, { x: 0.79, y: 0.64 }, { x: 0.9, y: 0.28 }, { x: 0.92, y: 0.5 }, { x: 0.9, y: 0.72 },
];

// Free-throw lineup (shooter index 0) for a basket at x=1.
const FT_SPOTS: CourtSpot[] = [
    { x: 0.83, y: 0.5 }, { x: 0.9, y: 0.34 }, { x: 0.9, y: 0.66 }, { x: 0.86, y: 0.3 }, { x: 0.86, y: 0.7 },
];

function mv(actor: number, x: number, y: number, speed = 1): ScriptAction {
    return { kind: 'move', actor, x, y, speed };
}

function ps(from: number | null, to: number): ScriptAction {
    return { kind: 'pass', from, to };
}

/**
 * Animated retro match viewer driven by a possession state machine: made
 * baskets trigger a baseline inbound and a full-court advance, defensive
 * boards trigger an outlet, and each play call runs a timed script (screens,
 * swings, post entries, iso attacks) before the shot resolves. Defenders
 * retreat, then track marks per scheme. Purely presentational.
 */
export class CourtRenderer {
    private readonly ox: number;
    private readonly oy: number;
    private readonly w = courtConfig.pixelWidth;
    private readonly h = courtConfig.pixelHeight;
    private readonly sprites = new Map<PlayerId, Sprite>();
    private readonly roles = new Map<PlayerId, Role>();
    private readonly crowd: CrowdPixel[] = [];
    private readonly homeTeamId: TeamId;

    private ball = { x: 0, y: 0 };
    private ballHolderId: PlayerId | null = null;
    private flight: BallFlight | null = null;
    private ballPlan: BallAction[] = [];
    private planDelay = 0;

    private offenseIds: PlayerId[] = [];
    private defenseIds: PlayerId[] = [];
    private phase: Phase = 'idle';
    private script: ScriptStep[] = [];
    // Set-play script queued to start once the advance script finishes.
    private nextScript: ScriptStep[] = [];
    private scriptTick = 0;
    // Tick at which a superseding event (shot) cuts the script short.
    private scriptCutAt: number | null = null;
    private pendingTransition: Transition = 'deadBall';

    private attackRight = true;
    private formation: CourtSpot[] = FORMATIONS.motion;
    private defenseScheme: DefenseScheme = 'man';
    private currentPlay: PlayType = 'motion';
    private rimFlashFrames = 0;
    private rimFlashRight = true;
    private animTick = 0;

    constructor(originX: number, originY: number, homeTeamId: TeamId) {
        this.ox = originX;
        this.oy = originY;
        this.homeTeamId = homeTeamId;
        this.ball.x = this.px(0.5);
        this.ball.y = this.py(0.5);
        for (let i = 0; i < 260; i++) {
            this.crowd.push({
                x: Math.floor(Math.random() * this.w),
                y: Math.floor(Math.random() * (courtConfig.crowdBandHeight - 2)),
                slot: courtConfig.slots.crowdBase + Math.floor(Math.random() * 4),
            });
        }
    }

    private px(nx: number): number {
        return this.ox + Math.round(nx * this.w);
    }

    private py(ny: number): number {
        return this.oy + Math.round(ny * this.h);
    }

    private mirror(spot: CourtSpot): CourtSpot {
        return this.attackRight ? spot : { x: 1 - spot.x, y: spot.y };
    }

    private ballNx(): number {
        return (this.ball.x - this.ox) / this.w;
    }

    private ballNy(): number {
        return (this.ball.y - this.oy) / this.h;
    }

    private ballInFrontcourt(): boolean {
        return this.attackRight ? this.ballNx() > 0.5 : this.ballNx() < 0.5;
    }

    /** Registers/updates the ten on-court players and their jersey colors. */
    setLineups(home: { ids: PlayerId[]; fill: number; edge: number }, away: { ids: PlayerId[]; fill: number; edge: number }): void {
        const seen = new Set<PlayerId>();
        const place = (ids: PlayerId[], jersey: number, trim: number, right: boolean) => {
            ids.forEach((id, index) => {
                seen.add(id);
                const spot = FORMATIONS.motion[index] ?? { x: 0.7, y: 0.5 };
                const nx = right ? spot.x : 1 - spot.x;
                const existing = this.sprites.get(id);
                if (existing) {
                    existing.jersey = jersey;
                    existing.trim = trim;
                } else {
                    this.sprites.set(id, {
                        x: this.px(0.5),
                        y: this.py(spot.y),
                        tx: this.px(nx),
                        ty: this.py(spot.y),
                        jersey,
                        trim,
                        speedMult: 1,
                        keyTicks: 0,
                        cutTimer: 30 + Math.floor(Math.random() * 40),
                    });
                }
            });
        };
        place(home.ids, home.fill, home.edge, true);
        place(away.ids, away.fill, away.edge, false);
        for (const id of [...this.sprites.keys()]) {
            if (!seen.has(id)) {
                this.sprites.delete(id);
                this.roles.delete(id);
            }
        }
    }

    private rebuildRoles(): void {
        this.roles.clear();
        this.offenseIds.forEach((id, index) => {
            this.roles.set(id, { side: 'offense', index, markId: null });
        });
        this.defenseIds.forEach((id, index) => {
            this.roles.set(id, { side: 'defense', index, markId: this.offenseIds[index] ?? null });
        });
    }

    /** Play-call choreography: pick a transition (if any) plus a set script. */
    onPlayCall(play: PlayType, offense: { teamId: TeamId; ids: PlayerId[] }, defense: { ids: PlayerId[]; scheme: DefenseScheme }): void {
        const wasRight = this.attackRight;
        const prevLead = this.offenseIds[0] ?? null;
        this.attackRight = offense.teamId === this.homeTeamId;
        this.offenseIds = [...offense.ids];
        this.defenseIds = [...defense.ids];
        this.formation = FORMATIONS[play];
        this.defenseScheme = defense.scheme;
        this.currentPlay = play;
        this.rebuildRoles();
        this.ballPlan = [];
        this.planDelay = 0;
        this.scriptCutAt = null;
        if (this.flight) {
            // The play call supersedes any auto-inbound queued on a landing.
            this.flight.inboundAfter = false;
        }
        const transition = this.pendingTransition;
        this.pendingTransition = 'none';

        if (play === 'fastBreak') {
            this.phase = 'set';
            this.scriptTick = 0;
            this.script = this.buildFastBreakScript();
            this.nextScript = [];
            return;
        }

        // A made basket already started this offense's inbound advance: keep
        // it running and just queue the called set behind it.
        const stillAdvancing =
            this.phase === 'advance' && wasRight === this.attackRight && prevLead === (this.offenseIds[0] ?? null) && this.script.length > 0;
        if (stillAdvancing) {
            this.nextScript = this.buildSetScript(play);
            return;
        }

        let advanceKind: 'inbound' | 'outlet' | null = null;
        if (transition === 'outlet' || transition === 'steal') {
            advanceKind = 'outlet';
        } else if (transition === 'inbound' || transition === 'deadBall') {
            advanceKind = 'inbound';
        } else if (!this.ballInFrontcourt()) {
            advanceKind = wasRight !== this.attackRight ? 'inbound' : 'outlet';
        }
        this.scriptTick = 0;
        if (advanceKind) {
            this.phase = 'advance';
            this.script = advanceKind === 'inbound' ? this.buildInboundScript() : this.buildOutletScript();
            this.nextScript = this.buildSetScript(play);
        } else {
            this.phase = 'set';
            this.script = this.buildSetScript(play);
            this.nextScript = [];
        }
    }

    // --- script builders (attack-right coordinates) ---

    /** Baseline inbound under the conceded basket, then the PG brings it up. */
    private buildInboundScript(): ScriptStep[] {
        const c = courtConfig.choreo;
        return [
            {
                at: 1,
                actions: [
                    mv(1, c.inboundBaselineX, 0.6, c.sprintSpeedMult),
                    mv(0, 0.1, 0.42, c.sprintSpeedMult),
                    mv(2, 0.42, 0.2, c.cutSpeedMult),
                    mv(3, 0.46, 0.8, 1.1),
                    mv(4, 0.36, 0.56, 1),
                ],
            },
            { at: 10, actions: [{ kind: 'take', actor: 1 }] },
            { at: 16, actions: [ps(1, 0)] },
            { at: 22, actions: [mv(0, 0.34, 0.48, 1), mv(1, 0.58, 0.26, c.cutSpeedMult)] },
            { at: 40, actions: [mv(0, 0.56, 0.5, 1)] },
        ];
    }

    /** Outlet from the defensive rebounder (or a backcourt holder) to the PG. */
    private buildOutletScript(): ScriptStep[] {
        const c = courtConfig.choreo;
        return [
            {
                at: 1,
                actions: [
                    mv(0, 0.2, 0.35, c.sprintSpeedMult),
                    mv(1, 0.5, 0.2, c.cutSpeedMult),
                    mv(2, 0.5, 0.8, c.cutSpeedMult),
                    mv(3, 0.4, 0.62, 1.1),
                    mv(4, 0.34, 0.45, 1),
                ],
            },
            { at: 10, actions: [ps(null, 0)] },
            { at: 16, actions: [mv(0, 0.45, 0.45, 1)] },
            { at: 32, actions: [mv(0, 0.58, 0.5, 1)] },
        ];
    }

    /** Numbered break: outlet to the PG, wide lanes sprint, bigs trail. */
    private buildFastBreakScript(): ScriptStep[] {
        const c = courtConfig.choreo;
        return [
            {
                at: 1,
                actions: [
                    mv(0, 0.3, 0.45, c.sprintSpeedMult),
                    mv(1, 0.7, 0.18, c.sprintSpeedMult),
                    mv(2, 0.7, 0.82, c.sprintSpeedMult),
                    mv(3, 0.55, 0.6, c.cutSpeedMult),
                    mv(4, 0.5, 0.4, c.cutSpeedMult),
                ],
            },
            { at: 5, actions: [ps(null, 0)] },
            { at: 12, actions: [mv(0, 0.62, 0.48, c.sprintSpeedMult)] },
            {
                at: 24,
                actions: [
                    mv(0, 0.78, 0.5, c.sprintSpeedMult),
                    mv(1, 0.88, 0.24, c.sprintSpeedMult),
                    mv(2, 0.88, 0.76, c.sprintSpeedMult),
                    mv(4, 0.84, 0.55, c.sprintSpeedMult),
                    mv(3, 0.68, 0.5, 1.2),
                ],
            },
        ];
    }

    private buildSetScript(play: PlayType): ScriptStep[] {
        const c = courtConfig.choreo;
        // Random strong side keeps repeated calls from looking identical.
        const s = Math.random() < 0.5 ? 1 : -1;
        const sy = (base: number): number => 0.5 + (base - 0.5) * s;
        switch (play) {
            case 'pickRoll':
                // Big walks up, screens next to the handler, handler dribbles
                // off the screen, screener rolls hard to the rim.
                return [
                    {
                        at: 1,
                        actions: [
                            mv(0, 0.66, 0.5),
                            mv(1, 0.86, sy(0.14), 1.1),
                            mv(2, 0.86, sy(0.86), 1.1),
                            mv(3, 0.76, sy(0.76)),
                            mv(4, 0.7, sy(0.43), 0.9),
                        ],
                    },
                    { at: 18, actions: [mv(0, 0.75, sy(0.39))] },
                    { at: 26, actions: [mv(4, 0.9, sy(0.54), 1.5)] },
                ];
            case 'motion': {
                const wing = s > 0 ? 1 : 2;
                const corner = s > 0 ? 3 : 4;
                return [
                    {
                        at: 1,
                        actions: [
                            mv(0, 0.68, 0.5),
                            mv(1, 0.77, 0.26, 1.1),
                            mv(2, 0.77, 0.74, 1.1),
                            mv(3, 0.88, 0.16, 1.1),
                            mv(4, 0.88, 0.84, 1.1),
                        ],
                    },
                    { at: 10, actions: [ps(0, wing)] },
                    // Pass-and-drift: the PG relocates away from his pass.
                    { at: 14, actions: [mv(0, 0.72, sy(0.64), c.cutSpeedMult)] },
                    { at: 24, actions: [ps(wing, corner)] },
                    { at: 28, actions: [mv(wing, 0.7, sy(0.42), c.cutSpeedMult)] },
                    { at: 42, actions: [ps(corner, wing)] },
                ];
            }
            case 'iso':
                // One side cleared: teammates flatten opposite, handler sizes
                // up on the wing then attacks the rim.
                return [
                    {
                        at: 1,
                        actions: [
                            mv(0, 0.72, sy(0.34)),
                            mv(1, 0.72, sy(0.86), 1.1),
                            mv(2, 0.86, sy(0.9), 1.1),
                            mv(3, 0.87, sy(0.72)),
                            mv(4, 0.64, sy(0.68)),
                        ],
                    },
                    { at: 24, actions: [mv(0, 0.79, sy(0.4))] },
                    { at: 36, actions: [mv(0, 0.87, sy(0.46), 1.2)] },
                ];
            case 'post':
                // Wing entry into the big on the low block, big backs down.
                return [
                    {
                        at: 1,
                        actions: [
                            mv(0, 0.66, 0.48),
                            mv(1, 0.76, sy(0.28), 1.1),
                            mv(2, 0.86, sy(0.14), 1.1),
                            mv(3, 0.74, sy(0.8)),
                            mv(4, 0.86, sy(0.63)),
                        ],
                    },
                    { at: 8, actions: [ps(0, 1)] },
                    { at: 20, actions: [ps(1, 4)] },
                    { at: 30, actions: [mv(4, 0.9, sy(0.59), 0.8)] },
                    { at: 42, actions: [mv(4, 0.915, sy(0.56), 0.8)] },
                ];
            default:
                return this.buildFastBreakScript();
        }
    }

    // --- script execution ---

    private runScript(): void {
        if (this.phase !== 'advance' && this.phase !== 'set') {
            return;
        }
        this.scriptTick++;
        if (this.scriptCutAt !== null && this.scriptTick >= this.scriptCutAt) {
            this.cutScript();
            return;
        }
        while (this.script.length > 0 && (this.script[0] as ScriptStep).at <= this.scriptTick) {
            const step = this.script.shift() as ScriptStep;
            for (const action of step.actions) {
                this.execAction(action);
            }
        }
        if (this.script.length === 0 && this.phase === 'advance') {
            this.phase = 'set';
            this.script = this.nextScript;
            this.nextScript = [];
            this.scriptTick = 0;
        }
    }

    /** Cuts the script short: everyone walks to their final spots, no passes. */
    private cutScript(): void {
        const c = courtConfig.choreo;
        for (const step of [...this.script, ...this.nextScript]) {
            for (const action of step.actions) {
                if (action.kind === 'move') {
                    this.execAction({ ...action, speed: Math.max(action.speed, c.cutSpeedMult) });
                }
            }
        }
        this.script = [];
        this.nextScript = [];
        this.scriptCutAt = null;
        this.phase = 'idle';
    }

    private execAction(action: ScriptAction): void {
        if (action.kind === 'move') {
            const id = this.offenseIds[action.actor];
            if (!id || !this.sprites.has(id)) {
                return;
            }
            const spot = this.mirror({ x: action.x, y: action.y });
            this.moveSprite(id, spot.x, spot.y, action.speed);
            return;
        }
        if (action.kind === 'take') {
            const id = this.offenseIds[action.actor];
            if (id && this.sprites.has(id) && !this.flight) {
                this.ballHolderId = id;
            }
            return;
        }
        const toId = this.offenseIds[action.to] ?? null;
        if (!toId || !this.sprites.has(toId) || this.flight || this.ballHolderId === toId) {
            return;
        }
        this.startPass(toId);
    }

    private startPass(toId: PlayerId): void {
        const target = this.sprites.get(toId);
        if (!target) {
            this.ballHolderId = toId;
            return;
        }
        const c = courtConfig.choreo;
        const dist = Math.hypot(target.x - this.ball.x, target.y - this.ball.y);
        const dur = Math.max(c.passMinTicks, Math.min(c.passMaxTicks, Math.round(dist / c.passSpeedPx)));
        this.startFlight(target.x, target.y - 2, Math.min(8, 3 + dur * 0.25), dur, toId, false);
    }

    private moveSprite(id: PlayerId, nx: number, ny: number, speedMult = 1): void {
        const sprite = this.sprites.get(id);
        if (sprite) {
            sprite.tx = this.px(Math.max(0.02, Math.min(0.98, nx)));
            sprite.ty = this.py(Math.max(0.04, Math.min(0.96, ny)));
            sprite.speedMult = speedMult;
        }
    }

    private startFlight(toX: number, toY: number, arc: number, dur: number, followId: PlayerId | null, inboundAfter: boolean): void {
        this.flight = { fromX: this.ball.x, fromY: this.ball.y, toX, toY, t: 0, dur, arc, followId, inboundAfter };
        this.ballHolderId = null;
    }

    /** Made basket landed: possession flips, loser inbounds from the baseline. */
    private beginInbound(): void {
        if (this.offenseIds.length < 2 || this.defenseIds.length < 2) {
            return;
        }
        const newOffense = this.defenseIds;
        this.defenseIds = this.offenseIds;
        this.offenseIds = newOffense;
        this.attackRight = !this.attackRight;
        this.rebuildRoles();
        this.formation = FORMATIONS.motion;
        this.currentPlay = 'motion';
        this.phase = 'advance';
        this.scriptTick = 0;
        this.scriptCutAt = null;
        this.script = this.buildInboundScript();
        // Fallback set until the actual play call replaces it.
        this.nextScript = this.buildSetScript('motion');
        this.ballPlan = [];
        this.planDelay = 0;
        this.ballHolderId = null;
        this.pendingTransition = 'none';
    }

    /** Choreography for a single event. */
    onEvent(event: MatchEvent): void {
        switch (event.t) {
            case 'shot': {
                const c = courtConfig.choreo;
                this.attackRight = event.teamId === this.homeTeamId;
                const rimX = this.attackRight ? 1 - courtConfig.basketInsetX : courtConfig.basketInsetX;
                const scripted = (this.phase === 'advance' || this.phase === 'set') && this.script.length > 0;
                // Let a running script play out a beat longer, then cut it so
                // the ball can reach the shooter before the launch.
                const grace = scripted ? c.shotGraceTicks : 2;
                if (scripted) {
                    this.scriptCutAt = this.scriptTick + grace;
                }
                this.moveSprite(event.playerId, event.spot.x, event.spot.y, c.cutSpeedMult);
                this.ballPlan = [];
                this.planDelay = grace;
                if (this.ballHolderId !== event.playerId) {
                    this.ballPlan.push({ type: 'pass', toId: event.playerId });
                }
                this.ballPlan.push({
                    type: 'shoot',
                    rimNx: rimX,
                    made: event.made,
                    blocked: event.blockedBy !== null,
                    inboundAfter: event.made && event.blockedBy === null,
                });
                if (event.blockedBy) {
                    this.moveSprite(event.blockedBy, event.spot.x, event.spot.y + 0.04, 1.5);
                }
                break;
            }
            case 'foul':
            case 'freeThrow': {
                const shooterId = event.t === 'freeThrow' ? event.playerId : event.onPlayerId;
                const right = event.t === 'foul' ? event.teamId !== this.homeTeamId : event.teamId === this.homeTeamId;
                this.attackRight = right;
                this.phase = 'freeThrow';
                this.script = [];
                this.nextScript = [];
                this.scriptCutAt = null;
                this.ballPlan = [];
                const shooterSpot = FT_SPOTS[0] as CourtSpot;
                this.moveSprite(shooterId, right ? shooterSpot.x : 1 - shooterSpot.x, shooterSpot.y);
                let index = 1;
                for (const [id] of this.sprites) {
                    if (id === shooterId) {
                        continue;
                    }
                    const spot = FT_SPOTS[index % FT_SPOTS.length] as CourtSpot;
                    const jitter = index >= FT_SPOTS.length ? 0.06 : 0;
                    this.moveSprite(id, right ? spot.x - jitter : 1 - spot.x + jitter, spot.y);
                    index++;
                }
                if (event.t === 'foul') {
                    this.flight = null;
                    this.ballHolderId = shooterId;
                } else {
                    const rimNx = right ? 1 - courtConfig.basketInsetX : courtConfig.basketInsetX;
                    const last = event.n === event.of;
                    if (this.ballHolderId !== shooterId) {
                        this.ballPlan.push({ type: 'pass', toId: shooterId });
                    }
                    this.ballPlan.push({
                        type: 'shoot',
                        rimNx,
                        made: event.made,
                        blocked: false,
                        inboundAfter: event.made && last,
                    });
                    this.planDelay = 6;
                }
                break;
            }
            case 'rebound': {
                // Rebounder attacks the ball's current spot and claims it.
                if (this.sprites.has(event.playerId)) {
                    this.moveSprite(event.playerId, this.ballNx(), this.ballNy(), 1.5);
                }
                this.ballPlan = [];
                this.ballHolderId = event.playerId;
                this.flight = null;
                this.script = [];
                this.nextScript = [];
                this.scriptCutAt = null;
                this.phase = 'idle';
                this.pendingTransition = event.offensive ? 'none' : 'outlet';
                break;
            }
            case 'turnover': {
                this.ballPlan = [];
                this.script = [];
                this.nextScript = [];
                this.scriptCutAt = null;
                this.phase = 'idle';
                if (event.stolenBy) {
                    const stealer = this.sprites.get(event.stolenBy);
                    if (stealer) {
                        this.startFlight(stealer.x, stealer.y, 3, 10, event.stolenBy, false);
                    }
                    this.ballHolderId = event.stolenBy;
                    this.pendingTransition = 'steal';
                } else {
                    // Sloppy pass out of bounds: ball rolls a bit.
                    this.startFlight(this.ball.x + (Math.random() * 40 - 20), this.ball.y + (Math.random() * 30 - 15), 4, 14, null, false);
                    this.pendingTransition = 'deadBall';
                }
                break;
            }
            case 'timeout':
            case 'periodEnd':
            case 'gameEnd': {
                this.script = [];
                this.nextScript = [];
                this.scriptCutAt = null;
                this.ballPlan = [];
                this.phase = 'idle';
                this.pendingTransition = 'deadBall';
                break;
            }
            default:
                break;
        }
    }

    /** Advances animation one frame. */
    tick(): void {
        this.animTick++;
        this.runScript();
        this.updateDefenders();
        this.updateOffBall();

        const dribbleMult = courtConfig.choreo.dribbleSpeedMult;
        for (const [id, sprite] of this.sprites) {
            // The man with the ball moves slower than off-ball cutters.
            const holderMult = id === this.ballHolderId ? dribbleMult : 1;
            const speed = courtConfig.playerStepPx * sprite.speedMult * holderMult;
            const dx = sprite.tx - sprite.x;
            const dy = sprite.ty - sprite.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= speed) {
                sprite.x = sprite.tx;
                sprite.y = sprite.ty;
                sprite.speedMult = Math.max(1, sprite.speedMult * 0.98);
            } else {
                sprite.x += (dx / dist) * speed;
                sprite.y += (dy / dist) * speed;
            }
        }

        this.applySeparation();
        this.updateBall();
        if (this.rimFlashFrames > 0) {
            this.rimFlashFrames--;
        }
    }

    /** Keeps teammates from stacking on one point (positions and targets). */
    private applySeparation(): void {
        const minSep = courtConfig.choreo.minSeparationPx;
        const list = [...this.sprites.values()];
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const a = list[i] as Sprite;
                const b = list[j] as Sprite;
                if (a.jersey !== b.jersey) {
                    continue;
                }
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let dist = Math.hypot(dx, dy);
                if (dist < minSep) {
                    if (dist < 0.01) {
                        dx = 1;
                        dy = 0;
                        dist = 1;
                    }
                    const shove = (minSep - dist) * 0.25;
                    a.x -= (dx / dist) * shove;
                    a.y -= (dy / dist) * shove;
                    b.x += (dx / dist) * shove;
                    b.y += (dy / dist) * shove;
                }
                // Separate destinations too, or the pair keeps re-colliding.
                let tdx = b.tx - a.tx;
                let tdy = b.ty - a.ty;
                let tdist = Math.hypot(tdx, tdy);
                if (tdist < minSep) {
                    if (tdist < 0.01) {
                        tdx = 0;
                        tdy = 1;
                        tdist = 1;
                    }
                    const shove = (minSep - tdist) * 0.5;
                    a.tx -= (tdx / tdist) * shove;
                    a.ty -= (tdy / tdist) * shove;
                    b.tx += (tdx / tdist) * shove;
                    b.ty += (tdy / tdist) * shove;
                }
            }
        }
    }

    /** Defenders retreat during the advance, then track per scheme. */
    private updateDefenders(): void {
        if (this.phase === 'freeThrow') {
            return;
        }
        const c = courtConfig.choreo;
        const basketX = this.attackRight ? 1 - courtConfig.basketInsetX : courtConfig.basketInsetX;
        const ballNx = this.ballNx();
        const ballNy = this.ballNy();
        // Non-press defenses sprint back before picking up their marks.
        const retreating = this.phase === 'advance' && !this.ballInFrontcourt() && this.defenseScheme !== 'press';
        for (const [id, role] of this.roles) {
            if (role.side !== 'defense') {
                continue;
            }
            const shell = this.mirror(ZONE_SPOTS[role.index] ?? { x: 0.85, y: 0.5 });
            if (retreating) {
                this.moveSprite(id, shell.x, shell.y, c.sprintSpeedMult);
                continue;
            }
            if (this.defenseScheme === 'zone') {
                // The whole zone shifts toward the ball side, in x and y.
                const nx = shell.x + (ballNx - shell.x) * c.zoneShiftX;
                const ny = shell.y + (ballNy - 0.5) * c.zoneShiftY;
                this.moveSprite(id, nx, ny);
                continue;
            }
            const markId = role.markId ?? this.offenseIds[role.index] ?? null;
            const mark = markId ? this.sprites.get(markId) : null;
            if (!mark) {
                this.moveSprite(id, shell.x, shell.y);
                continue;
            }
            const markNx = (mark.x - this.ox) / this.w;
            const markNy = (mark.y - this.oy) / this.h;
            const onBall = this.ballHolderId === markId;
            const press = this.defenseScheme === 'press';
            const sag = press ? (onBall ? c.pressOnBallSag : c.pressSag) : onBall ? c.manOnBallSag : c.manSag;
            // On the line between the mark and the basket, sagged toward it.
            const nx = markNx + (basketX - markNx) * sag;
            const ny = markNy + (0.5 - markNy) * sag;
            this.moveSprite(id, nx, ny, press ? 1.2 : onBall ? 1.1 : 1);
        }
    }

    private inAttackKey(sprite: Sprite): boolean {
        const nx = (sprite.x - this.ox) / this.w;
        const ny = (sprite.y - this.oy) / this.h;
        const inX = this.attackRight ? nx > 1 - courtConfig.keyDepth : nx < courtConfig.keyDepth;
        return inX && Math.abs(ny - 0.5) < courtConfig.keyWidth / 2;
    }

    /** Off-ball attackers keep spacing; idle possessions get a light drift. */
    private updateOffBall(): void {
        if (this.phase === 'freeThrow') {
            return;
        }
        const c = courtConfig.choreo;
        for (const [id, role] of this.roles) {
            if (role.side !== 'offense' || this.ballHolderId === id) {
                continue;
            }
            const sprite = this.sprites.get(id);
            if (!sprite) {
                continue;
            }
            // Three-seconds feel: clear out of the key unless posting up.
            const allowKey = this.currentPlay === 'post' && role.index === 4;
            if (!allowKey && this.inAttackKey(sprite)) {
                sprite.keyTicks++;
                if (sprite.keyTicks > c.keyCampTicks) {
                    sprite.keyTicks = 0;
                    const corner = this.mirror({ x: 0.86, y: (sprite.y - this.oy) / this.h < 0.5 ? 0.13 : 0.87 });
                    this.moveSprite(id, corner.x, corner.y, c.cutSpeedMult);
                }
            } else {
                sprite.keyTicks = 0;
            }
            if (this.phase !== 'idle') {
                // A running script owns everyone's movement.
                continue;
            }
            sprite.cutTimer--;
            if (sprite.cutTimer > 0) {
                continue;
            }
            sprite.cutTimer = 45 + Math.floor(Math.random() * 50);
            const base = this.mirror(this.formation[role.index] ?? { x: 0.75, y: 0.5 });
            this.moveSprite(id, base.x + (Math.random() * 0.08 - 0.04), base.y + (Math.random() * 0.12 - 0.06));
        }
    }

    private updateBall(): void {
        if (this.flight) {
            const f = this.flight;
            f.t++;
            // Passes home in on a moving receiver.
            if (f.followId) {
                const target = this.sprites.get(f.followId);
                if (target) {
                    f.toX = target.x;
                    f.toY = target.y - 2;
                }
            }
            const progress = Math.min(1, f.t / f.dur);
            this.ball.x = f.fromX + (f.toX - f.fromX) * progress;
            this.ball.y = f.fromY + (f.toY - f.fromY) * progress - Math.sin(progress * Math.PI) * f.arc;
            if (progress >= 1) {
                const landed = this.flight;
                this.flight = null;
                if (landed.followId) {
                    this.ballHolderId = landed.followId;
                }
                this.planDelay = Math.max(this.planDelay, 4);
                if (landed.inboundAfter) {
                    this.beginInbound();
                }
            }
            return;
        }

        // Ball plan: execute the next queued action once any delay elapses.
        if (this.ballPlan.length > 0) {
            if (this.planDelay > 0) {
                this.planDelay--;
            } else {
                const action = this.ballPlan.shift() as BallAction;
                if (action.type === 'pass') {
                    this.startPass(action.toId);
                } else if (action.type === 'shoot') {
                    if (action.blocked) {
                        // Swatted sideways instead of reaching the rim.
                        this.startFlight(this.ball.x + (this.attackRight ? -14 : 14), this.ball.y + 22, 6, 12, null, false);
                    } else {
                        this.startFlight(this.px(action.rimNx), this.py(0.5), 12, courtConfig.ballFlightTicks, null, action.inboundAfter);
                        if (action.made) {
                            this.rimFlashFrames = 14;
                            this.rimFlashRight = this.attackRight;
                        } else {
                            this.ballPlan.unshift({ type: 'bounce' });
                        }
                    }
                } else {
                    // Rim bounce after a miss.
                    this.startFlight(
                        this.ball.x + (this.attackRight ? -1 : 1) * (10 + Math.random() * 18),
                        this.ball.y + (Math.random() * 24 - 12),
                        7,
                        12,
                        null,
                        false,
                    );
                }
            }
            return;
        }

        // No flight, no plan: the holder carries the ball at his hip.
        if (this.ballHolderId) {
            const holder = this.sprites.get(this.ballHolderId);
            if (holder) {
                const dx = holder.x + (this.attackRight ? 3 : -3) - this.ball.x;
                const dy = holder.y + 1 - this.ball.y;
                const dist = Math.hypot(dx, dy);
                const speed = Math.max(3.4, dist * 0.35);
                if (dist <= speed) {
                    this.ball.x = holder.x + (this.attackRight ? 3 : -3);
                    this.ball.y = holder.y + 1;
                } else {
                    this.ball.x += (dx / dist) * speed;
                    this.ball.y += (dy / dist) * speed;
                }
            }
        }
    }

    render(): void {
        const cfg = courtConfig;
        const slots = cfg.slots;

        // Crowd band.
        BT.drawRectFill(new Rect2i(this.ox, this.oy - cfg.crowdBandHeight, this.w, cfg.crowdBandHeight), slots.crowdBase);
        for (const px of this.crowd) {
            BT.drawPixel(new Vector2i(this.ox + px.x, this.oy - cfg.crowdBandHeight + 1 + px.y), px.slot);
        }

        // Floor with plank stripes.
        BT.drawRectFill(new Rect2i(this.ox, this.oy, this.w, this.h), slots.floor);
        for (let x = 12; x < this.w; x += 24) {
            BT.drawRectFill(new Rect2i(this.ox + x, this.oy, 12, this.h), slots.floorDark);
        }

        // Painted keys.
        const keyDepth = Math.round(cfg.keyDepth * this.w);
        const keyHalf = Math.round((cfg.keyWidth * this.h) / 2);
        BT.drawRectFill(new Rect2i(this.px(0), this.py(0.5) - keyHalf, keyDepth, keyHalf * 2), slots.keyFill);
        BT.drawRectFill(new Rect2i(this.px(1) - keyDepth, this.py(0.5) - keyHalf, keyDepth, keyHalf * 2), slots.keyFill);

        // Lines.
        BT.drawRect(new Rect2i(this.ox, this.oy, this.w, this.h), slots.lines);
        BT.drawLine(new Vector2i(this.px(0.5), this.oy), new Vector2i(this.px(0.5), this.oy + this.h - 1), slots.lines);
        this.drawCircle(0.5, 0.5, cfg.centerCircleRadius * this.h, slots.lines);

        for (const right of [false, true]) {
            const bx = right ? 1 - cfg.basketInsetX : cfg.basketInsetX;
            const keyX = right ? this.px(1) - keyDepth : this.px(0);
            BT.drawRect(new Rect2i(keyX, this.py(0.5) - keyHalf, keyDepth, keyHalf * 2), slots.lines);
            this.drawArc(bx, 0.5, cfg.threePointRadius * this.w, right, slots.lines);
            const rimPx = this.px(bx);
            BT.drawLine(
                new Vector2i(rimPx + (right ? 3 : -3), this.py(0.5) - 6),
                new Vector2i(rimPx + (right ? 3 : -3), this.py(0.5) + 6),
                slots.lines,
            );
            BT.drawRectFill(new Rect2i(rimPx - 1, this.py(0.5) - 1, 3, 3), slots.rim);
            if (this.rimFlashFrames > 0 && this.rimFlashRight === right) {
                const r = 3 + (14 - this.rimFlashFrames);
                BT.drawRect(new Rect2i(rimPx - r, this.py(0.5) - r, r * 2, r * 2), slots.ball);
            }
        }

        // Players (sorted by y for a hint of depth), then the ball on top.
        const sorted = [...this.sprites.values()].sort((a, b) => a.y - b.y);
        for (const sprite of sorted) {
            this.drawPlayer(sprite);
        }
        BT.drawRectFill(new Rect2i(Math.round(this.ball.x) - 1, Math.round(this.ball.y) - 1, 3, 3), slots.ball);
    }

    /** Tiny 5x7 pixel player: head, jersey with trim shoulders, running legs. */
    private drawPlayer(sprite: Sprite): void {
        const x = Math.round(sprite.x) - 2;
        const y = Math.round(sprite.y) - 4;
        const moving = sprite.x !== sprite.tx || sprite.y !== sprite.ty;
        const frame = moving ? Math.floor(this.animTick / 6) % 2 : 0;
        const slots = courtConfig.slots;

        // Soft shadow for contrast against the floor.
        BT.drawRectFill(new Rect2i(x, y + 7, 5, 1), slots.floorDark);
        // Head.
        BT.drawRectFill(new Rect2i(x + 2, y, 1, 1), slots.skin);
        // Shoulders (trim color) and jersey body.
        BT.drawRectFill(new Rect2i(x, y + 1, 5, 1), sprite.trim);
        BT.drawRectFill(new Rect2i(x + 1, y + 2, 3, 2), sprite.jersey);
        // Shorts.
        BT.drawRectFill(new Rect2i(x + 1, y + 4, 3, 1), sprite.trim);
        // Legs: two animation frames.
        if (frame === 0) {
            BT.drawRectFill(new Rect2i(x + 1, y + 5, 1, 2), slots.skin);
            BT.drawRectFill(new Rect2i(x + 3, y + 5, 1, 2), slots.skin);
        } else {
            BT.drawRectFill(new Rect2i(x, y + 5, 1, 2), slots.skin);
            BT.drawRectFill(new Rect2i(x + 4, y + 5, 1, 2), slots.skin);
        }
    }

    private drawCircle(nx: number, ny: number, radiusPx: number, slot: number): void {
        const cx = this.px(nx);
        const cy = this.py(ny);
        const steps = 40;
        for (let i = 0; i < steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            BT.drawPixel(new Vector2i(Math.round(cx + Math.cos(angle) * radiusPx), Math.round(cy + Math.sin(angle) * radiusPx * 0.9)), slot);
        }
    }

    private drawArc(nx: number, ny: number, radiusPx: number, opensLeft: boolean, slot: number): void {
        const cx = this.px(nx);
        const cy = this.py(ny);
        const steps = 34;
        for (let i = 0; i <= steps; i++) {
            const angle = -Math.PI / 2 + (i / steps) * Math.PI;
            const dx = Math.cos(angle) * radiusPx * (opensLeft ? -1 : 1);
            const dy = Math.sin(angle) * radiusPx * 1.15;
            const x = Math.round(cx + dx);
            const y = Math.round(cy + dy);
            if (y >= this.oy && y < this.oy + this.h && x >= this.ox && x < this.ox + this.w) {
                BT.drawPixel(new Vector2i(x, y), slot);
            }
        }
    }
}
