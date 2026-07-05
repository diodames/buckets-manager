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
    // Ticks until this off-ball player picks a new cut/spot-up target.
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
    | { type: 'shoot'; rimNx: number; made: boolean; blocked: boolean }
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
}

interface CrowdPixel {
    x: number;
    y: number;
    slot: number;
}

// Offensive formations in normalized coords for an attack on the x=1 basket.
// Index order follows the active five (PG, SG, SF, PF, C).
const FORMATIONS: Record<PlayType, CourtSpot[]> = {
    pickRoll: [
        { x: 0.66, y: 0.5 }, { x: 0.7, y: 0.42 }, { x: 0.84, y: 0.18 }, { x: 0.84, y: 0.82 }, { x: 0.9, y: 0.62 },
    ],
    motion: [
        { x: 0.68, y: 0.5 }, { x: 0.77, y: 0.24 }, { x: 0.77, y: 0.76 }, { x: 0.89, y: 0.16 }, { x: 0.89, y: 0.84 },
    ],
    iso: [
        { x: 0.74, y: 0.35 }, { x: 0.64, y: 0.6 }, { x: 0.84, y: 0.14 }, { x: 0.87, y: 0.8 }, { x: 0.92, y: 0.62 },
    ],
    post: [
        { x: 0.68, y: 0.5 }, { x: 0.79, y: 0.2 }, { x: 0.79, y: 0.8 }, { x: 0.88, y: 0.36 }, { x: 0.92, y: 0.66 },
    ],
    fastBreak: [
        { x: 0.86, y: 0.5 }, { x: 0.8, y: 0.28 }, { x: 0.8, y: 0.72 }, { x: 0.68, y: 0.44 }, { x: 0.62, y: 0.58 },
    ],
};

// 2-3 zone spots (defending the x=1 basket).
const ZONE_SPOTS: CourtSpot[] = [
    { x: 0.79, y: 0.36 }, { x: 0.79, y: 0.64 }, { x: 0.9, y: 0.28 }, { x: 0.92, y: 0.5 }, { x: 0.9, y: 0.72 },
];

// Free-throw lineup (shooter index 0) for a basket at x=1.
const FT_SPOTS: CourtSpot[] = [
    { x: 0.83, y: 0.5 }, { x: 0.9, y: 0.34 }, { x: 0.9, y: 0.66 }, { x: 0.86, y: 0.3 }, { x: 0.86, y: 0.7 },
];

/**
 * Animated retro match viewer with purposeful movement: the ball travels by
 * passes between the handler and teammates, arrives at the shooter before the
 * shot arc, defenders continuously track their marks per scheme, and off-ball
 * attackers cut and relocate. Purely presentational.
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

    /** Play-call choreography: assign roles, set the set-play formation. */
    onPlayCall(play: PlayType, offense: { teamId: TeamId; ids: PlayerId[] }, defense: { ids: PlayerId[]; scheme: DefenseScheme }): void {
        this.attackRight = offense.teamId === this.homeTeamId;
        this.formation = FORMATIONS[play];
        this.defenseScheme = defense.scheme;
        this.currentPlay = play;
        const speedMult = play === 'fastBreak' ? courtConfig.fastBreakStepMult : 1;

        this.roles.clear();
        offense.ids.forEach((id, index) => {
            this.roles.set(id, { side: 'offense', index, markId: null });
            const spot = this.mirror(this.formation[index] ?? { x: 0.7, y: 0.5 });
            this.moveSprite(id, spot.x, spot.y, speedMult);
        });
        defense.ids.forEach((id, index) => {
            this.roles.set(id, { side: 'defense', index, markId: offense.ids[index] ?? null });
        });

        // Ball starts the possession with the handler; on half-court sets it
        // may swing once to a random teammate before the shot resolves.
        const handler = offense.ids[0] ?? null;
        this.ballHolderId = handler;
        this.flight = null;
        this.ballPlan = [];
        if (play !== 'fastBreak' && offense.ids.length > 1 && Math.random() < 0.6) {
            const mate = offense.ids[1 + Math.floor(Math.random() * (offense.ids.length - 1))];
            if (mate) {
                this.ballPlan.push({ type: 'pass', toId: mate });
                this.planDelay = 18 + Math.floor(Math.random() * 14);
            }
        }
    }

    private moveSprite(id: PlayerId, nx: number, ny: number, speedMult = 1): void {
        const sprite = this.sprites.get(id);
        if (sprite) {
            sprite.tx = this.px(Math.max(0.02, Math.min(0.98, nx)));
            sprite.ty = this.py(Math.max(0.04, Math.min(0.96, ny)));
            sprite.speedMult = speedMult;
        }
    }

    private startFlight(toX: number, toY: number, arc: number, dur: number, followId: PlayerId | null): void {
        this.flight = { fromX: this.ball.x, fromY: this.ball.y, toX, toY, t: 0, dur, arc, followId };
        this.ballHolderId = null;
    }

    /** Choreography for a single event. */
    onEvent(event: MatchEvent): void {
        switch (event.t) {
            case 'shot': {
                this.attackRight = event.teamId === this.homeTeamId;
                const rimX = this.attackRight ? 1 - courtConfig.basketInsetX : courtConfig.basketInsetX;
                // Shooter relocates to the shot spot; ball gets passed to him
                // first (unless he already holds it), then rises to the rim.
                this.moveSprite(event.playerId, event.spot.x, event.spot.y, this.currentPlay === 'fastBreak' ? courtConfig.fastBreakStepMult : 1.3);
                this.ballPlan = [];
                this.planDelay = 0;
                if (this.ballHolderId !== event.playerId) {
                    this.ballPlan.push({ type: 'pass', toId: event.playerId });
                }
                this.ballPlan.push({ type: 'shoot', rimNx: rimX, made: event.made, blocked: event.blockedBy !== null });
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
                this.roles.clear();
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
                    this.ballHolderId = shooterId;
                } else {
                    const rimX = right ? 1 - courtConfig.basketInsetX : courtConfig.basketInsetX;
                    const shooter = this.sprites.get(shooterId);
                    if (shooter) {
                        this.ball.x = shooter.x;
                        this.ball.y = shooter.y;
                    }
                    this.startFlight(this.px(rimX), this.py(0.5), 8, 20, null);
                    if (event.made) {
                        this.rimFlashFrames = 10;
                        this.rimFlashRight = right;
                    } else if (event.n === event.of) {
                        this.ballPlan = [{ type: 'bounce' }];
                    }
                }
                break;
            }
            case 'rebound': {
                // Rebounder attacks the ball's current spot and claims it.
                const sprite = this.sprites.get(event.playerId);
                if (sprite) {
                    const bx = (this.ball.x - this.ox) / this.w;
                    const by = (this.ball.y - this.oy) / this.h;
                    this.moveSprite(event.playerId, bx, by, 1.5);
                }
                this.ballPlan = [];
                this.ballHolderId = event.playerId;
                this.flight = null;
                break;
            }
            case 'turnover': {
                this.ballPlan = [];
                if (event.stolenBy) {
                    const stealer = this.sprites.get(event.stolenBy);
                    if (stealer) {
                        this.startFlight(stealer.x, stealer.y, 3, 10, event.stolenBy);
                    }
                    this.ballHolderId = event.stolenBy;
                } else {
                    // Sloppy pass out of bounds: ball rolls a bit.
                    this.startFlight(this.ball.x + (Math.random() * 40 - 20), this.ball.y + (Math.random() * 30 - 15), 4, 14, null);
                }
                break;
            }
            default:
                break;
        }
    }

    /** Advances animation one frame. */
    tick(): void {
        this.animTick++;
        this.updateDefenders();
        this.updateOffBall();

        for (const sprite of this.sprites.values()) {
            const speed = courtConfig.playerStepPx * sprite.speedMult;
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

        this.updateBall();
        if (this.rimFlashFrames > 0) {
            this.rimFlashFrames--;
        }
    }

    /** Defenders continuously track their assignment per scheme. */
    private updateDefenders(): void {
        const basketX = this.attackRight ? 1 - courtConfig.basketInsetX : courtConfig.basketInsetX;
        for (const [id, role] of this.roles) {
            if (role.side !== 'defense') {
                continue;
            }
            if (this.defenseScheme === 'zone') {
                const spot = this.mirror(ZONE_SPOTS[role.index] ?? { x: 0.85, y: 0.5 });
                // Zone shifts slightly toward the ball side.
                const ballNy = (this.ball.y - this.oy) / this.h;
                this.moveSprite(id, spot.x, spot.y + (ballNy - 0.5) * 0.12);
                continue;
            }
            const mark = role.markId ? this.sprites.get(role.markId) : null;
            if (!mark) {
                continue;
            }
            const markNx = (mark.x - this.ox) / this.w;
            const markNy = (mark.y - this.oy) / this.h;
            // Man: sag between the mark and the basket. Press: glue to the mark.
            const sag = this.defenseScheme === 'press' ? 0.12 : 0.4;
            const hasBall = this.ballHolderId === role.markId;
            const tighten = hasBall ? 0.5 : 1;
            const nx = markNx + (basketX - markNx) * 0.12 * sag * tighten * 4;
            const ny = markNy + (0.5 - markNy) * 0.1 * sag;
            this.moveSprite(id, nx, ny, this.defenseScheme === 'press' ? 1.15 : 1);
        }
    }

    /** Off-ball attackers cut to the rim or relocate along the arc. */
    private updateOffBall(): void {
        for (const [id, role] of this.roles) {
            if (role.side !== 'offense' || this.ballHolderId === id) {
                continue;
            }
            const sprite = this.sprites.get(id);
            if (!sprite) {
                continue;
            }
            sprite.cutTimer--;
            if (sprite.cutTimer > 0) {
                continue;
            }
            sprite.cutTimer = 45 + Math.floor(Math.random() * 50);
            const base = this.mirror(this.formation[role.index] ?? { x: 0.75, y: 0.5 });
            if (Math.random() < 0.3) {
                // Hard cut toward the rim.
                const rimX = this.attackRight ? 0.9 : 0.1;
                this.moveSprite(id, rimX, 0.4 + Math.random() * 0.2, 1.35);
            } else {
                // Relocate around the set spot.
                this.moveSprite(id, base.x + (Math.random() * 0.08 - 0.04), base.y + (Math.random() * 0.14 - 0.07));
            }
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
                this.planDelay = 6;
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
                    const target = this.sprites.get(action.toId);
                    if (target) {
                        this.startFlight(target.x, target.y, 6, 14, action.toId);
                    } else {
                        this.ballHolderId = action.toId;
                    }
                } else if (action.type === 'shoot') {
                    const rimPxX = this.px(action.rimNx);
                    const rimPxY = this.py(0.5);
                    if (action.blocked) {
                        // Swatted sideways instead of reaching the rim.
                        this.startFlight(this.ball.x + (this.attackRight ? -14 : 14), this.ball.y + 22, 6, 12, null);
                    } else {
                        this.startFlight(rimPxX, rimPxY, 12, courtConfig.ballFlightTicks, null);
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
