import type { UiInputFrame } from '../../app/UiInput';
import { ROLE } from '../theme';
import type { TextGrid } from '../text';

export interface MenuItem {
    id: string;
    label: string;
    disabled?: boolean;
}

export interface MenuLayout {
    col: number;
    row: number;
    width: number;
}

/**
 * Vertical menu with a shared keyboard/pointer focus model: hovering selects,
 * clicking or Enter activates.
 */
export class MenuList {
    items: MenuItem[];
    selected = 0;
    private readonly layout: MenuLayout;

    constructor(items: MenuItem[], layout: MenuLayout) {
        this.items = items;
        this.layout = layout;
    }

    setRow(row: number): void {
        this.layout.row = row;
    }

    private move(direction: -1 | 1): void {
        if (this.items.length === 0) {
            return;
        }
        let next = this.selected;
        for (let i = 0; i < this.items.length; i++) {
            next = (next + direction + this.items.length) % this.items.length;
            if (!this.items[next]?.disabled) {
                break;
            }
        }
        this.selected = next;
    }

    get layoutRow(): number {
        return this.layout.row;
    }

    get layoutCol(): number {
        return this.layout.col;
    }

    get layoutWidth(): number {
        return this.layout.width;
    }

    private pointerIndex(input: UiInputFrame, grid: TextGrid): number | null {
        if (!input.pointer) {
            return null;
        }
        const row = grid.rowAtY(input.pointer.y);
        const col = grid.colAtX(input.pointer.x);
        const index = row - this.layout.row;
        const inside =
            index >= 0 && index < this.items.length && col >= this.layout.col && col < this.layout.col + this.layout.width;
        if (!inside || this.items[index]?.disabled) {
            return null;
        }
        return index;
    }

    /** Returns the activated item id from a pointer click only, or null. */
    tryClick(input: UiInputFrame, grid: TextGrid): string | null {
        const index = this.pointerIndex(input, grid);
        if (index === null || !input.click) {
            return null;
        }
        this.selected = index;
        return this.items[index]?.id ?? null;
    }

    /** Returns the activated item id, or null. */
    update(input: UiInputFrame, grid: TextGrid): string | null {
        if (input.up) {
            this.move(-1);
        }
        if (input.down) {
            this.move(1);
        }
        const pointerIndex = this.pointerIndex(input, grid);
        if (pointerIndex !== null) {
            this.selected = pointerIndex;
            if (input.click) {
                return this.items[pointerIndex]?.id ?? null;
            }
        }
        if (input.confirm) {
            const item = this.items[this.selected];
            if (item && !item.disabled) {
                return item.id;
            }
        }
        return null;
    }

    render(grid: TextGrid, showSelection = true): void {
        this.items.forEach((item, index) => {
            const row = this.layout.row + index;
            const isSelected = showSelection && index === this.selected;
            if (isSelected) {
                grid.fillCells(this.layout.col, row, this.layout.width, 1, ROLE.highlight);
            }
            const color = item.disabled ? ROLE.textDim : isSelected ? ROLE.highlightText : ROLE.text;
            const marker = isSelected ? '>' : ' ';
            grid.put(this.layout.col, row, color, ` ${marker} ${item.label}`);
        });
    }
}
