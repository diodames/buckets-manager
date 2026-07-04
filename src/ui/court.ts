import { BT, Rect2i, Vector2i } from 'blit386';
import { courtConfig } from '../config/court';
import type { PlayerId, TeamId } from '../core/model/types';
import type { CourtSpot, MatchEvent } from '../core/sim/events';

interface Dot {
    x: number;
    y: number;
    tx: number;
    ty: number;
    fillSlot: number;
    edgeSlot: number;
}

interface CrowdPixel {
    x: number;
    y: number;
    slot: number;
}

// Half-court formation spots in normalized coords, relative to the attacked
// basket at x=1 (mirrored for the other direction).
const OFFENSE_SPOTS: CourtSpot[] = [
    { x: 0.62, y: 0.5 },
    { x: 0.74, y: 0.22 },
    { x: 0.74, y: 0.78 },
    { x: 0.86, y: 0.35 },
    { x: 0.86, y: 0.65 },
];

/**
 * Animated 2D top-down court: ten player dots and the ball chase targets
 * derived from the event stream. Purely presentational — consumes events,
 * never touches the sim.
 */
export class CourtRenderer {
    private readonly ox: number;
    private readonly oy: number;
    private readonly w = courtConfig.pixelWidth;
    private readonly h = courtConfig.pixelHeight;
    private readonly dots = new Map<PlayerId, Dot>();
    private readonly ball: Dot = { x: 0, y: 0, tx: 0, ty: 0, fillSlot: courtConfig.slots.ball, edgeSlot: courtConfig.slots.ball };
    private readonly crowd: CrowdPixel[] = [];
    private readonly homeTeamId: TeamId;
    private rimFlashFrames = 0;
    private rimFlashRight = true;

    constructor(originX: number, originY: number, homeTeamId: TeamId) {
        this.ox = originX;
        this.oy = originY;
        this.homeTeamId = homeTeamId;
        this.ball.x = this.px(0.5);
        this.ball.y = this.py(0.5);
        this.ball.tx = this.ball.x;
        this.ball.ty = this.ball.y;
        // Static crowd pattern above the court (visual only, so Math.random is fine).
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

    /** Registers/updates the ten on-court players and their colors. */
    setLineups(home: { ids: PlayerId[]; fill: number; edge: number }, away: { ids: PlayerId[]; fill: number; edge: number }): void {
        const seen = new Set<PlayerId>();
        const place = (ids: PlayerId[], fill: number, edge: number, attackRight: boolean) => {
            ids.forEach((id, index) => {
                seen.add(id);
                const spot = OFFENSE_SPOTS[index] ?? { x: 0.7, y: 0.5 };
                const nx = attackRight ? spot.x : 1 - spot.x;
                const existing = this.dots.get(id);
                if (existing) {
                    existing.fillSlot = fill;
                    existing.edgeSlot = edge;
                } else {
                    this.dots.set(id, {
                        x: this.px(0.5),
                        y: this.py(spot.y),
                        tx: this.px(nx),
                        ty: this.py(spot.y),
                        fillSlot: fill,
                        edgeSlot: edge,
                    });
                }
            });
        };
        place(home.ids, home.fill, home.edge, true);
        place(away.ids, away.fill, away.edge, false);
        for (const id of [...this.dots.keys()]) {
            if (!seen.has(id)) {
                this.dots.delete(id);
            }
        }
    }

    /** Repositions formations for a possession by the given team. */
    setPossession(offenseTeamId: TeamId, offenseIds: PlayerId[], defenseIds: PlayerId[]): void {
        const attackRight = offenseTeamId === this.homeTeamId;
        offenseIds.forEach((id, index) => {
            const spot = OFFENSE_SPOTS[index] ?? { x: 0.7, y: 0.5 };
            this.moveDot(id, attackRight ? spot.x : 1 - spot.x, spot.y);
        });
        defenseIds.forEach((id, index) => {
            const spot = OFFENSE_SPOTS[index] ?? { x: 0.7, y: 0.5 };
            const dx = attackRight ? spot.x + 0.06 : 1 - spot.x - 0.06;
            this.moveDot(id, Math.max(0.03, Math.min(0.97, dx)), spot.y + (index % 2 === 0 ? 0.05 : -0.05));
        });
        const handler = offenseIds[0];
        if (handler) {
            const dot = this.dots.get(handler);
            if (dot) {
                this.ball.tx = dot.tx;
                this.ball.ty = dot.ty;
            }
        }
    }

    private moveDot(id: PlayerId, nx: number, ny: number): void {
        const dot = this.dots.get(id);
        if (dot) {
            dot.tx = this.px(nx);
            dot.ty = this.py(ny);
        }
    }

    /** Choreography for a single event. */
    onEvent(event: MatchEvent): void {
        switch (event.t) {
            case 'shot': {
                this.moveDotToSpot(event.playerId, event.spot);
                const attackRight = event.teamId === this.homeTeamId;
                const rimX = attackRight ? 1 - courtConfig.basketInsetX : courtConfig.basketInsetX;
                this.ball.tx = this.px(rimX);
                this.ball.ty = this.py(0.5);
                if (event.made) {
                    this.rimFlashFrames = 14;
                    this.rimFlashRight = attackRight;
                }
                break;
            }
            case 'rebound': {
                const attackRight = event.teamId === this.homeTeamId;
                const nearRim = event.offensive === attackRight ? 0.88 : 0.12;
                this.moveDotToSpot(event.playerId, { x: nearRim, y: 0.42 + Math.random() * 0.16 });
                const dot = this.dots.get(event.playerId);
                if (dot) {
                    this.ball.tx = dot.tx;
                    this.ball.ty = dot.ty;
                }
                break;
            }
            case 'turnover': {
                if (event.stolenBy) {
                    const dot = this.dots.get(event.stolenBy);
                    if (dot) {
                        this.ball.tx = dot.x;
                        this.ball.ty = dot.y;
                    }
                }
                break;
            }
            default:
                break;
        }
    }

    private moveDotToSpot(id: PlayerId, spot: CourtSpot): void {
        this.moveDot(id, spot.x, spot.y);
    }

    /** Advances animation one frame. */
    tick(): void {
        const step = (dot: Dot, speed: number) => {
            const dx = dot.tx - dot.x;
            const dy = dot.ty - dot.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= speed) {
                dot.x = dot.tx;
                dot.y = dot.ty;
            } else {
                dot.x += (dx / dist) * speed;
                dot.y += (dy / dist) * speed;
            }
        };
        for (const dot of this.dots.values()) {
            step(dot, courtConfig.playerStepPx);
        }
        step(this.ball, courtConfig.ballStepPx);
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

        // Floor and lines.
        BT.drawRectFill(new Rect2i(this.ox, this.oy, this.w, this.h), slots.floor);
        BT.drawRect(new Rect2i(this.ox, this.oy, this.w, this.h), slots.lines);
        BT.drawLine(new Vector2i(this.px(0.5), this.oy), new Vector2i(this.px(0.5), this.oy + this.h - 1), slots.lines);
        this.drawCircle(0.5, 0.5, cfg.centerCircleRadius * this.h, slots.lines);

        for (const right of [false, true]) {
            const bx = right ? 1 - cfg.basketInsetX : cfg.basketInsetX;
            // Key.
            const keyDepth = Math.round(cfg.keyDepth * this.w);
            const keyHalf = Math.round((cfg.keyWidth * this.h) / 2);
            const keyX = right ? this.px(1) - keyDepth : this.px(0);
            BT.drawRect(new Rect2i(keyX, this.py(0.5) - keyHalf, keyDepth, keyHalf * 2), slots.lines);
            // Three-point arc.
            this.drawArc(bx, 0.5, cfg.threePointRadius * this.w, right, slots.lines);
            // Backboard and rim.
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

        // Players and ball.
        for (const dot of this.dots.values()) {
            const x = Math.round(dot.x);
            const y = Math.round(dot.y);
            BT.drawRectFill(new Rect2i(x - 2, y - 2, 5, 5), dot.fillSlot);
            BT.drawRect(new Rect2i(x - 3, y - 3, 7, 7), dot.edgeSlot);
        }
        BT.drawRectFill(new Rect2i(Math.round(this.ball.x) - 1, Math.round(this.ball.y) - 1, 3, 3), slots.ball);
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
