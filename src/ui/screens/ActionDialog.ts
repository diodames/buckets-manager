import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { ROLE } from '../theme';
import { MenuList, type MenuItem } from '../widgets/MenuList';

/** Small modal menu of contextual actions; resolves with the chosen id or null. */
export class ActionDialog implements Screen {
    // Not an overlay: the engine clears the frame, so drawing only this modal
    // over the cleared screen avoids a dense parent bleeding through.
    readonly isOverlay = false;
    private readonly ctx: AppContext;
    private readonly title: string;
    private readonly menu: MenuList;
    private readonly onResult: (actionId: string | null) => void;
    private readonly boxCol: number;
    private readonly boxRow: number;
    private readonly boxWidth: number;

    constructor(ctx: AppContext, title: string, items: MenuItem[], onResult: (actionId: string | null) => void) {
        this.ctx = ctx;
        this.title = title;
        this.onResult = onResult;
        this.boxWidth = Math.max(title.length + 6, ...items.map((i) => i.label.length + 8), 30);
        this.boxCol = Math.floor((ctx.grid.cols - this.boxWidth) / 2);
        this.boxRow = Math.floor(ctx.grid.rows / 2) - Math.ceil(items.length / 2) - 2;
        this.menu = new MenuList(items, { col: this.boxCol + 2, row: this.boxRow + 3, width: this.boxWidth - 4 });
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            this.onResult(null);
            return;
        }
        const action = this.menu.update(input, this.ctx.grid);
        if (action) {
            this.ctx.screens.pop();
            this.onResult(action);
        }
    }

    render(): void {
        const grid = this.ctx.grid;
        const height = this.menu.items.length + 5;
        grid.fillCells(this.boxCol, this.boxRow, this.boxWidth, height, ROLE.panel);
        grid.frame(this.boxCol, this.boxRow, this.boxWidth, height, ROLE.border);
        grid.put(this.boxCol + 2, this.boxRow + 1, ROLE.header, this.title);
        this.menu.render(grid);
    }
}
