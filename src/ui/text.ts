import { BT, Rect2i, Vector2i } from 'blit386';

// The engine system font is ASCII-only (32..126); Czech text is folded to
// ASCII at draw time until the custom bitmap font lands (M2).
const FOLD_MAP: Record<string, string> = {
    á: 'a', č: 'c', ď: 'd', é: 'e', ě: 'e', í: 'i', ň: 'n', ó: 'o', ř: 'r', š: 's',
    ť: 't', ú: 'u', ů: 'u', ý: 'y', ž: 'z',
    Á: 'A', Č: 'C', Ď: 'D', É: 'E', Ě: 'E', Í: 'I', Ň: 'N', Ó: 'O', Ř: 'R', Š: 'S',
    Ť: 'T', Ú: 'U', Ů: 'U', Ý: 'Y', Ž: 'Z',
    // Common European letters appearing in real NBL rosters.
    ä: 'a', ë: 'e', ï: 'i', ö: 'o', ü: 'u', à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u',
    â: 'a', ê: 'e', î: 'i', ô: 'o', û: 'u', ã: 'a', õ: 'o', ç: 'c', ñ: 'n',
    ć: 'c', đ: 'd', ş: 's', ą: 'a', ę: 'e', ł: 'l', ś: 's', ź: 'z', ż: 'z',
    Ä: 'A', Ö: 'O', Ü: 'U', Ç: 'C', Ć: 'C', Đ: 'D', Ł: 'L', Ś: 'S',
};

export function foldAscii(text: string): string {
    let out = '';
    for (const ch of text) {
        out += FOLD_MAP[ch] ?? (ch.charCodeAt(0) > 126 ? '?' : ch);
    }
    return out;
}

/**
 * Character-cell coordinate system over the pixel display, sized from the
 * measured system-font metrics. All UI text and chrome is placed on this
 * grid, which is what gives the DOS-manager look.
 */
export class TextGrid {
    readonly cellW: number;
    readonly cellH: number;
    readonly cols: number;
    readonly rows: number;

    private constructor(cellW: number, cellH: number, cols: number, rows: number) {
        this.cellW = cellW;
        this.cellH = cellH;
        this.cols = cols;
        this.rows = rows;
    }

    /** Measures the engine font; call only after the engine has initialized. */
    static measure(): TextGrid {
        const cell = BT.systemPrintMeasure('M');
        if (cell.x <= 0 || cell.y <= 0) {
            throw new Error('TextGrid.measure: engine font metrics unavailable (engine not initialized?)');
        }
        const display = BT.displaySize;
        return new TextGrid(cell.x, cell.y, Math.floor(display.x / cell.x), Math.floor(display.y / cell.y));
    }

    px(col: number, row: number): Vector2i {
        return new Vector2i(col * this.cellW, row * this.cellH);
    }

    put(col: number, row: number, color: number, text: string): void {
        BT.systemPrint(this.px(col, row), color, foldAscii(text));
    }

    putRight(colEnd: number, row: number, color: number, text: string): void {
        this.put(colEnd - text.length, row, color, text);
    }

    putCenter(row: number, color: number, text: string): void {
        this.put(Math.floor((this.cols - text.length) / 2), row, color, text);
    }

    /** Fills a run of character cells with a background color. */
    fillCells(col: number, row: number, widthCols: number, heightRows: number, color: number): void {
        BT.drawRectFill(new Rect2i(col * this.cellW, row * this.cellH, widthCols * this.cellW, heightRows * this.cellH), color);
    }

    /** Outlined box in cell coordinates. */
    frame(col: number, row: number, widthCols: number, heightRows: number, color: number): void {
        BT.drawRect(new Rect2i(col * this.cellW, row * this.cellH, widthCols * this.cellW, heightRows * this.cellH), color);
    }

    /** Converts a pixel position (e.g. the pointer) to a cell row, or -1. */
    rowAtY(y: number): number {
        const row = Math.floor(y / this.cellH);
        return row >= 0 && row < this.rows ? row : -1;
    }

    colAtX(x: number): number {
        const col = Math.floor(x / this.cellW);
        return col >= 0 && col < this.cols ? col : -1;
    }
}

/** Left-pad for right-aligned numeric table cells. */
export function padLeft(value: string | number, width: number): string {
    return String(value).padStart(width);
}

/** Right-pad/truncate for fixed-width table cells. */
export function padRight(value: string, width: number): string {
    return value.length > width ? value.slice(0, width) : value.padEnd(width);
}
