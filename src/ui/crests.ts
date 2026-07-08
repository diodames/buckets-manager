import { BT, Rect2i } from 'blit386';
import { paletteConfig } from '../config/palette';
import type { TextGrid } from './text';
import { teamColorSlot } from './theme';

/** Simple 14x14 pixel team crest using palette team colors. */
export function drawTeamCrest(grid: TextGrid, teamId: string, col: number, row: number): void {
    const primary = teamColorSlot(teamId);
    const secondary = primary + 1;
    const x = col * grid.cellW + 1;
    const y = row * grid.cellH + 1;
    BT.drawRectFill(new Rect2i(x, y, 14, 14), primary);
    BT.drawRect(new Rect2i(x, y, 14, 14), paletteConfig.roles.textDim);
    BT.drawRectFill(new Rect2i(x + 4, y + 4, 6, 6), secondary);
    BT.drawRectFill(new Rect2i(x + 6, y + 2, 2, 10), secondary);
}
