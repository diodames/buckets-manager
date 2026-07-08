import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import type { DefenseScheme, OffenseFocus, Pace } from '../../config/balance';
import type { Player, Position } from '../../core/model/types';
import { overallRating, POSITIONS } from '../../core/model/types';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { playerName, shortPlayerName } from '../format';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';
import { MenuList } from '../widgets/MenuList';

const PACES: Pace[] = ['slow', 'normal', 'fast'];
const FOCUSES: OffenseFocus[] = ['inside', 'balanced', 'perimeter'];
const DEFENSES: DefenseScheme[] = ['man', 'zone', 'press'];

const SLOT_ROW = 5;
const TACTIC_ROW = 14;

/**
 * Starting-five editor plus pre-match tactics (pace, focus, defense).
 */
export class LineupScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly slotMenu: MenuList;
    private readonly picker: DataTable;
    private readonly tacticMenu: MenuList;
    private picking: Position | null = null;
    private pickerRows: Player[] = [];
    private section: 'starters' | 'tactics' = 'starters';

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.slotMenu = new MenuList(
            POSITIONS.map((position) => ({ id: position, label: '' })),
            { col: 3, row: SLOT_ROW, width: 44 },
        );
        this.picker = new DataTable({ col: 3, row: 5, visibleRows: 14 }, true);
        this.tacticMenu = new MenuList(
            [
                { id: 'pace', label: '' },
                { id: 'focus', label: '' },
                { id: 'defense', label: '' },
            ],
            { col: 3, row: TACTIC_ROW, width: 44 },
        );
    }

    private pointerHitsMenu(grid: AppContext['grid'], menu: MenuList, input: UiInputFrame): boolean {
        if (!input.pointer) {
            return false;
        }
        const row = grid.rowAtY(input.pointer.y);
        const col = grid.colAtX(input.pointer.x);
        const index = row - menu.layoutRow;
        return (
            index >= 0 &&
            index < menu.items.length &&
            col >= menu.layoutCol &&
            col < menu.layoutCol + menu.layoutWidth
        );
    }

    private get state() {
        const state = this.ctx.session?.state;
        if (!state) {
            throw new Error('LineupScreen: no session');
        }
        return state;
    }

    private userTactics() {
        const team = this.state.teams[this.state.userTeamId];
        if (!team) {
            throw new Error('LineupScreen: no user team');
        }
        return team.tactics;
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
        for (const slot of POSITIONS) {
            if (starters[slot] === player.id) {
                starters[slot] = previous;
            }
        }
        starters[position] = player.id;
    }

    private cycleTactic(id: string, dir: 1 | -1): void {
        const tactics = this.userTactics();
        if (id === 'pace') {
            const i = (PACES.indexOf(tactics.pace) + dir + PACES.length) % PACES.length;
            tactics.pace = PACES[i] as Pace;
        } else if (id === 'focus') {
            const i = (FOCUSES.indexOf(tactics.offenseFocus) + dir + FOCUSES.length) % FOCUSES.length;
            tactics.offenseFocus = FOCUSES[i] as OffenseFocus;
        } else if (id === 'defense') {
            const i = (DEFENSES.indexOf(tactics.defenseScheme) + dir + DEFENSES.length) % DEFENSES.length;
            tactics.defenseScheme = DEFENSES[i] as DefenseScheme;
        }
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

        const grid = this.ctx.grid;
        if (this.pointerHitsMenu(grid, this.tacticMenu, input)) {
            this.section = 'tactics';
        } else if (this.pointerHitsMenu(grid, this.slotMenu, input)) {
            this.section = 'starters';
        }

        if (this.section === 'tactics') {
            if (input.up && this.tacticMenu.selected <= 0) {
                this.section = 'starters';
                this.slotMenu.selected = POSITIONS.length - 1;
                return;
            }
            if (input.left || input.right) {
                const tid = this.tacticMenu.items[this.tacticMenu.selected]?.id;
                if (tid) {
                    this.cycleTactic(tid, input.right ? 1 : -1);
                }
                return;
            }
            this.tacticMenu.update(input, grid);
            return;
        }

        if (input.down && this.slotMenu.selected >= POSITIONS.length - 1) {
            this.section = 'tactics';
            this.tacticMenu.selected = 0;
            return;
        }
        const picked = this.slotMenu.update(input, grid);
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
        this.slotMenu.render(this.ctx.grid, this.section === 'starters');
    }

    private renderTactics(): void {
        const tactics = this.userTactics();
        const labels = [
            t('lineup.pace', { pace: t(`tactics.pace.${tactics.pace}` as Parameters<typeof t>[0]) }),
            t('lineup.focus', { focus: t(`tactics.focus.${tactics.offenseFocus}` as Parameters<typeof t>[0]) }),
            t('lineup.defense', { defense: t(`tactics.defense.${tactics.defenseScheme}` as Parameters<typeof t>[0]) }),
        ];
        labels.forEach((label, i) => {
            const item = this.tacticMenu.items[i];
            if (item) {
                item.label = label;
            }
        });
        this.ctx.grid.put(3, 13, ROLE.textDim, t('lineup.tacticsHeader'));
        this.tacticMenu.render(this.ctx.grid, this.section === 'tactics');
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
            this.renderTactics();
        }
    }
}
