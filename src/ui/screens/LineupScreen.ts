import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import type { Player, Position } from '../../core/model/types';
import { overallRating, POSITIONS } from '../../core/model/types';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { playerName, shortPlayerName } from '../format';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';
import { MenuList } from '../widgets/MenuList';

/**
 * Starting-five editor: pick a slot (PG..C), then a player from the roster.
 * Picking a player who already starts elsewhere swaps the two slots.
 */
export class LineupScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly slotMenu: MenuList;
    private readonly picker: DataTable;
    private picking: Position | null = null;
    private pickerRows: Player[] = [];

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.slotMenu = new MenuList(
            POSITIONS.map((position) => ({ id: position, label: '' })),
            { col: 3, row: 5, width: 44 },
        );
        this.picker = new DataTable({ col: 3, row: 5, visibleRows: 14 }, true);
    }

    private get state() {
        const state = this.ctx.session?.state;
        if (!state) {
            throw new Error('LineupScreen: no session');
        }
        return state;
    }

    private roster(): Player[] {
        const state = this.state;
        const team = state.teams[state.userTeamId];
        return (team?.playerIds ?? [])
            .map((id) => state.players[id])
            .filter((p): p is Player => p !== undefined);
    }

    private assignStarter(position: Position, player: Player): void {
        const state = this.state;
        const team = state.teams[state.userTeamId];
        if (!team) {
            return;
        }
        const starters = team.tactics.starters;
        const previous = starters[position];
        // Swap when the picked player already starts at another slot.
        for (const slot of POSITIONS) {
            if (starters[slot] === player.id) {
                starters[slot] = previous;
            }
        }
        starters[position] = player.id;
    }

    update(input: UiInputFrame): void {
        if (this.picking) {
            if (input.cancel) {
                this.picking = null;
                return;
            }
            const activated = this.picker.update(input, this.ctx.grid);
            if (activated !== null) {
                const player = this.pickerRows[activated];
                if (player) {
                    this.assignStarter(this.picking, player);
                    this.picking = null;
                }
            }
            return;
        }
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        const picked = this.slotMenu.update(input, this.ctx.grid);
        if (picked) {
            this.picking = picked as Position;
            this.picker.selected = 0;
        }
    }

    private renderSlots(): void {
        const state = this.state;
        const team = state.teams[state.userTeamId];
        POSITIONS.forEach((position, index) => {
            const item = this.slotMenu.items[index];
            const starter = team ? state.players[team.tactics.starters[position]] : undefined;
            if (item) {
                item.label = `${position}: ${
                    starter
                        ? `${shortPlayerName(starter)} (${overallRating(starter.attributes)}${starter.injury ? `, ${t('training.injured', { rounds: starter.injury.roundsOut })}` : ''})`
                        : '-'
                }`;
            }
        });
        this.slotMenu.render(this.ctx.grid);
    }

    private renderPicker(): void {
        if (!this.picking) {
            return;
        }
        const state = this.state;
        const team = state.teams[state.userTeamId];
        const starters = new Set(Object.values(team?.tactics.starters ?? {}));
        this.pickerRows = this.roster().sort(
            (a, b) =>
                (b.position === this.picking ? 1000 : 0) + overallRating(b.attributes) -
                ((a.position === this.picking ? 1000 : 0) + overallRating(a.attributes)),
        );
        this.picker.setData(
            [
                { header: t('col.name'), width: 20 },
                { header: t('col.pos'), width: 3 },
                { header: t('col.ovr'), width: 3, align: 'right' },
                { header: t('col.fatigue'), width: 5, align: 'right' },
                { header: t('col.status'), width: 14 },
            ],
            this.pickerRows.map((p) => ({
                cells: [
                    playerName(p),
                    p.position,
                    String(overallRating(p.attributes)),
                    String(Math.round(p.fatigue)),
                    p.injury ? t('training.injured', { rounds: p.injury.roundsOut }) : starters.has(p.id) ? t('roster.starter') : '',
                ],
                ...(p.injury ? { color: ROLE.danger } : starters.has(p.id) ? { color: ROLE.accent } : {}),
            })),
        );
        this.ctx.grid.put(3, 3, ROLE.header, t('lineup.pickFor', { pos: this.picking }));
        this.picker.render(this.ctx.grid);
    }

    render(): void {
        drawChrome(this.ctx, t('lineup.title'), [t('hint.navigate'), t('hint.select'), t('hint.back')]);
        if (this.picking) {
            this.renderPicker();
        } else {
            this.ctx.grid.put(3, 3, ROLE.textDim, t('lineup.hint'));
            this.renderSlots();
        }
    }
}
