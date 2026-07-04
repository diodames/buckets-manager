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
}

interface BallFlight {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    t: number;
    dur: number;
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
 * Animated retro match viewer: little pixel players in team jerseys chase
 * formation targets per play call, defenders track per scheme, and the ball
 * flies in an arc. Purely presentational — consumes events, never the sim.
 */
export class CourtRenderer {
    private readonly ox: number;
    private readonly oy: number;
    private readonly w = courtConfig.pixelWidth;
    private readonly h = courtConfig.pixelHeight;
    private readonly sprites = new Map<PlayerId, Sprite>();
    private readonly crowd: CrowdPixel[] = [];
    private readonly homeTeamId: TeamId;
    private ball = { x: 0, y: 0, tx: 0, ty: 0 };
    private flight: BallFlight | null = null;
    private rimFlashFrames = 0;
    private rimFlashRight = true;
    private animTick = 0;

    constructor(originX: number, originY: number, homeTeamId: TeamId) {
        this.ox = originX;
        this.oy = originY;
        this.homeTeamId = homeTeamId;
        this.ball.x = this.px(0.5);
        this.ball.y = this.py(0.5);
        this.ball.tx = this.ball.x;
        this.ball.ty = this.ball.y;
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

    /** Registers/updates the ten on-court players and their jersey colors. */
    setLineups(home: { ids: PlayerId[]; fill: number; edge: number }, away: { ids: PlayerId[]; fill: number; edge: number }): void {
        const seen = new Set<PlayerId>();
        const place = (ids: PlayerId[], jersey: number, trim: number, attackRight: boolean) => {
            ids.forEach((id, index) => {
                seen.add(id);
                const spot = FORMATIONS.motion[index] ?? { x: 0.7, y: 0.5 };
                const nx = attackRight ? spot.x : 1 - spot.x;
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
                    });
                }
            });
        };
        place(home.ids, home.fill, home.edge, true);
        place(away.ids, away.fill, away.edge, false);
        for (const id of [...this.sprites.keys()]) {
            if (!seen.has(id)) {
                this.sprites.delete(id);
            }
        }
    }

    /** Play-call choreography: offense runs its set, defense matches per scheme. */
    onPlayCall(play: PlayType, offense: { teamId: TeamId; ids: PlayerId[] }, defense: { ids: PlayerId[]; scheme: DefenseScheme }): void {
        const attackRight = offense.teamId === this.homeTeamId;
        const formation = FORMATIONS[play];
        const speedMult = play === 'fastBreak' ? courtConfig.fastBreakStepMult : 1;
        offense.ids.forEach((id, index) => {
            const spot = formation[index] ?? { x: 0.7, y: 0.5 };
            this.moveSprite(id, attackRight ? spot.x : 1 - spot.x, spot.y, speedMult);
        });
        defense.ids.forEach((id, index) => {
            let spot: CourtSpot;
            if (defense.scheme === 'zone') {
                spot = ZONE_SPOTS[index] ?? { x: 0.85, y: 0.5 };
            } else {
                const mark = formation[index] ?? { x: 0.7, y: 0.5 };
                const tight = defense.scheme === 'press' ? 0.025 : 0.06;
                spot = { x: Math.min(0.97, mark.x + tight), y: mark.y + (index % 2 === 0 ? 0.03 : -0.03) };
            }
            this.moveSprite(id, attackRight ? spot.x : 1 - spot.x, spot.y, speedMult);
        });
        const handler = offense.ids[0];
        const dot = handler ? this.sprites.get(handler) : null;
        if (dot) {
            this.ball.tx = dot.tx;
            this.ball.ty = dot.ty;
            this.flight = null;
        }
    }

    private moveSprite(id: PlayerId, nx: number, ny: number, speedMult = 1): void {
        const sprite = this.sprites.get(id);
        if (sprite) {
            sprite.tx = this.px(nx);
            sprite.ty = this.py(ny);
            sprite.speedMult = speedMult;
        }
    }

    private launchBall(toNx: number, toNy: number): void {
        this.flight = {
            fromX: this.ball.x,
            fromY: this.ball.y,
            toX: this.px(toNx),
            toY: this.py(toNy),
            t: 0,
            dur: courtConfig.ballFlightTicks,
        };
    }

    /** Choreography for a single event. */
    onEvent(event: MatchEvent): void {
        switch (event.t) {
            case 'shot': {
                const attackRight = event.teamId === this.homeTeamId;
                this.moveSprite(event.playerId, event.spot.x, event.spot.y);
                const shooter = this.sprites.get(event.playerId);
                if (shooter) {
                    this.ball.x = shooter.x;
                    this.ball.y = shooter.y;
                }
                const rimX = attackRight ? 1 - courtConfig.basketInsetX : courtConfig.basketInsetX;
                if (event.blockedBy) {
                    // Swatted: ball bounces sideways instead of reaching the rim.
                    this.launchBall(event.spot.x, Math.min(0.9, event.spot.y + 0.18));
                    const blocker = this.sprites.get(event.blockedBy);
                    if (blocker) {
                        this.moveSprite(event.blockedBy, event.spot.x, event.spot.y, 1.5);
                    }
                } else {
                    this.launchBall(rimX, 0.5);
                    if (event.made) {
                        this.rimFlashFrames = 14;
                        this.rimFlashRight = attackRight;
                    }
                }
                break;
            }
            case 'foul':
            case 'freeThrow': {
                // Line everyone up at the key of the attacked basket. A foul
                // event carries the DEFENDING team; a free throw the offense.
                const shooterId = event.t === 'freeThrow' ? event.playerId : event.onPlayerId;
                const attackRight = event.t === 'foul' ? event.teamId !== this.homeTeamId : event.teamId === this.homeTeamId;
                const shooterSpot = FT_SPOTS[0] as CourtSpot;
                this.moveSprite(shooterId, attackRight ? shooterSpot.x : 1 - shooterSpot.x, shooterSpot.y);
                let index = 1;
                for (const [id] of this.sprites) {
                    if (id === shooterId) {
                        continue;
                    }
                    const spot = FT_SPOTS[index % FT_SPOTS.length] as CourtSpot;
                    const jitter = index >= FT_SPOTS.length ? 0.06 : 0;
                    this.moveSprite(id, attackRight ? spot.x - jitter : 1 - spot.x + jitter, spot.y);
                    index++;
                }
                if (event.t === 'freeThrow') {
                    const rimX = attackRight ? 1 - courtConfig.basketInsetX : courtConfig.basketInsetX;
                    const shooter = this.sprites.get(shooterId);
                    if (shooter) {
                        this.ball.x = shooter.x;
                        this.ball.y = shooter.y;
                    }
                    this.launchBall(rimX, 0.5);
                    if (event.made) {
                        this.rimFlashFrames = 10;
                        this.rimFlashRight = attackRight;
                    }
                }
                break;
            }
            case 'rebound': {
                const attackRight = event.teamId === this.homeTeamId;
                const nearRim = event.offensive === attackRight ? 0.88 : 0.12;
                this.moveSprite(event.playerId, nearRim, 0.42 + Math.random() * 0.16, 1.3);
                const sprite = this.sprites.get(event.playerId);
                if (sprite) {
                    this.flight = null;
                    this.ball.tx = sprite.tx;
                    this.ball.ty = sprite.ty;
                }
                break;
            }
            case 'turnover': {
                if (event.stolenBy) {
                    const sprite = this.sprites.get(event.stolenBy);
                    if (sprite) {
                        this.flight = null;
                        this.ball.tx = sprite.x;
                        this.ball.ty = sprite.y;
                    }
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
        for (const sprite of this.sprites.values()) {
            const speed = courtConfig.playerStepPx * sprite.speedMult;
            const dx = sprite.tx - sprite.x;
            const dy = sprite.ty - sprite.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= speed) {
                sprite.x = sprite.tx;
                sprite.y = sprite.ty;
                sprite.speedMult = 1;
            } else {
                sprite.x += (dx / dist) * speed;
                sprite.y += (dy / dist) * speed;
            }
        }
        if (this.flight) {
            this.flight.t++;
            const f = this.flight;
            const progress = Math.min(1, f.t / f.dur);
            this.ball.x = f.fromX + (f.toX - f.fromX) * progress;
            this.ball.y = f.fromY + (f.toY - f.fromY) * progress - Math.sin(progress * Math.PI) * 9;
            if (progress >= 1) {
                this.flight = null;
                this.ball.tx = this.ball.x;
                this.ball.ty = this.ball.y;
            }
        } else {
            const dx = this.ball.tx - this.ball.x;
            const dy = this.ball.ty - this.ball.y;
            const dist = Math.hypot(dx, dy);
            const speed = 3.4;
            if (dist <= speed) {
                this.ball.x = this.ball.tx;
                this.ball.y = this.ball.ty;
            } else {
                this.ball.x += (dx / dist) * speed;
                this.ball.y += (dy / dist) * speed;
            }
        }
        if (this.rimFlashFrames > 0) {
            this.rimFlashFrames--;
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
