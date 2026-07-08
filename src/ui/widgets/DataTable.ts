import type { UiInputFrame } from '../../app/UiInput';
import { ROLE } from '../theme';
import { padLeft, padRight, type TextGrid } from '../text';

export interface TableColumn {
    header: string;
    width: number;
    align?: 'left' | 'right';
}

export interface TableLayout {
    col: number;
    row: number;
    visibleRows: number;
}

export interface TableRow {
    cells: string[];
    // Optional per-row text color override (e.g. user team highlight).
    color?: number;
}

/**
 * Fixed-width monospace table with header, scrolling, and an optional
 * selection cursor. Column widths are in character cells.
 */
export class DataTable {
    columns: TableColumn[] = [];
    rows: TableRow[] = [];
    selectable: boolean;
    selected = 0;
    private scroll = 0;
    private readonly layout: TableLayout;

    constructor(layout: TableLayout, selectable: boolean) {
        this.layout = { ...layout };
        this.selectable = selectable;
    }

    setLayoutPosition(row: number, visibleRows?: number): void {
        this.layout.row = row;
        if (visibleRows !== undefined) {
            this.layout.visibleRows = visibleRows;
        }
        this.clampScroll();
    }

    setData(columns: TableColumn[], rows: TableRow[]): void {
        this.columns = columns;
        this.rows = rows;
        this.selected = Math.min(this.selected, Math.max(0, rows.length - 1));
        this.clampScroll();
    }

    get totalWidth(): number {
        return this.columns.reduce((sum, c) => sum + c.width + 1, 0);
    }

    get scrollOffset(): number {
        return this.scroll;
    }

    get layoutRow(): number {
        return this.layout.row;
    }

    get layoutVisibleRows(): number {
        return this.layout.visibleRows;
    }

    private clampScroll(): void {
        const maxScroll = Math.max(0, this.rows.length - this.layout.visibleRows);
        this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
        if (this.selectable) {
            if (this.selected < this.scroll) {
                this.scroll = this.selected;
            }
            if (this.selected >= this.scroll + this.layout.visibleRows) {
                this.scroll = this.selected - this.layout.visibleRows + 1;
            }
        }
    }

    /** Returns the activated row index, or null. */
    update(input: UiInputFrame, grid: TextGrid): number | null {
        if (this.rows.length === 0) {
            return null;
        }
        if (this.selectable) {
            if (input.up) {
                this.selected = Math.max(0, this.selected - 1);
            }
            if (input.down) {
                this.selected = Math.min(this.rows.length - 1, this.selected + 1);
            }
            if (input.pointer) {
                const row = grid.rowAtY(input.pointer.y);
                const col = grid.colAtX(input.pointer.x);
                const index = this.scroll + (row - this.layout.row - 1);
                const inside =
                    row > this.layout.row &&
                    index >= 0 &&
                    index < this.rows.length &&
                    index < this.scroll + this.layout.visibleRows &&
                    col >= this.layout.col &&
                    col < this.layout.col + this.totalWidth;
                if (inside) {
                    this.selected = index;
                    if (input.click) {
                        this.clampScroll();
                        return index;
                    }
                }
            }
            this.clampScroll();
            if (input.confirm) {
                return this.selected;
            }
        } else {
            if (input.up) {
                this.scroll = Math.max(0, this.scroll - 1);
            }
            if (input.down) {
                this.scroll = Math.min(Math.max(0, this.rows.length - this.layout.visibleRows), this.scroll + 1);
            }
        }
        return null;
    }

    private formatRow(cells: readonly string[]): string {
        return this.columns
            .map((column, i) => {
                const cell = cells[i] ?? '';
                return column.align === 'right' ? padLeft(cell, column.width) : padRight(cell, column.width);
            })
            .join(' ');
    }

    render(grid: TextGrid): void {
        const { col, row, visibleRows } = this.layout;
        grid.fillCells(col, row, this.totalWidth, 1, ROLE.panel);
        grid.put(col, row, ROLE.header, this.formatRow(this.columns.map((c) => c.header)));

        const end = Math.min(this.rows.length, this.scroll + visibleRows);
        for (let i = this.scroll; i < end; i++) {
            const screenRow = row + 1 + (i - this.scroll);
            const entry = this.rows[i] as TableRow;
            const isSelected = this.selectable && i === this.selected;
            grid.fillCells(col, screenRow, this.totalWidth, 1, isSelected ? ROLE.highlight : ROLE.bg);
            const color = isSelected ? ROLE.highlightText : (entry.color ?? ROLE.text);
            grid.put(col, screenRow, color, this.formatRow(entry.cells));
        }

        if (this.rows.length > visibleRows) {
            const canUp = this.scroll > 0;
            const canDown = this.scroll + visibleRows < this.rows.length;
            grid.put(col + this.totalWidth, row + 1, ROLE.textDim, canUp ? '^' : ' ');
            grid.put(col + this.totalWidth, row + visibleRows, ROLE.textDim, canDown ? 'v' : ' ');
        }
    }
}
