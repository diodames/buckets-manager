import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { t } from '../../i18n';
import { ROLE } from '../theme';
import { MenuList } from '../widgets/MenuList';

/** Modal yes/no dialog rendered as an overlay over its parent screen. */
export class ConfirmDialog implements Screen {
    readonly isOverlay = true;
    private readonly ctx: AppContext;
    private readonly message: string;
    private readonly onResult: (confirmed: boolean) => void;
    private readonly menu: MenuList;
    private readonly boxCol: number;
    private readonly boxRow: number;
    private readonly boxWidth: number;

    constructor(ctx: AppContext, message: string, onResult: (confirmed: boolean) => void) {
        this.ctx = ctx;
        this.message = message;
        this.onResult = onResult;
        this.boxWidth = Math.max(message.length + 6, 30);
        this.boxCol = Math.floor((ctx.grid.cols - this.boxWidth) / 2);
        this.boxRow = Math.floor(ctx.grid.rows / 2) - 3;
        this.menu = new MenuList(
            [
                { id: 'yes', label: t('common.yes') },
                { id: 'no', label: t('common.no') },
            ],
            { col: this.boxCol + 2, row: this.boxRow + 3, width: this.boxWidth - 4 },
        );
        this.menu.selected = 1;
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            this.onResult(false);
            return;
        }
        const action = this.menu.update(input, this.ctx.grid);
        if (action) {
            this.ctx.screens.pop();
            this.onResult(action === 'yes');
        }
    }

    render(): void {
        const grid = this.ctx.grid;
        grid.fillCells(this.boxCol, this.boxRow, this.boxWidth, 6, ROLE.panel);
        grid.frame(this.boxCol, this.boxRow, this.boxWidth, 6, ROLE.border);
        grid.put(this.boxCol + 2, this.boxRow + 1, ROLE.textBright, this.message);
        this.menu.render(grid);
    }
}
