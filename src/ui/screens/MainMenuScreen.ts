import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { t } from '../../i18n';
import { AUTOSAVE_KEY, SAVE_SLOT_KEYS } from '../../services/storage';
import { ROLE } from '../theme';
import { MenuList } from '../widgets/MenuList';
import { SaveLoadScreen } from './SaveLoadScreen';
import { SettingsScreen } from './SettingsScreen';
import { TeamSelectScreen } from './TeamSelectScreen';

export class MainMenuScreen implements Screen {
    private readonly ctx: AppContext;
    private menu!: MenuList;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
    }

    onEnter(): void {
        this.rebuildMenu();
    }

    private hasAnySave(): boolean {
        return [AUTOSAVE_KEY, ...SAVE_SLOT_KEYS].some((key) => this.ctx.storage.get(key) !== null);
    }

    private rebuildMenu(): void {
        const row = Math.floor(this.ctx.grid.rows / 2);
        const items = [
            { id: 'new', label: t('menu.newGame') },
            { id: 'load', label: t('menu.loadGame'), disabled: !this.hasAnySave() },
            { id: 'settings', label: t('menu.settings') },
        ];
        const width = Math.max(...items.map((i) => i.label.length)) + 6;
        this.menu = new MenuList(items, { col: Math.floor((this.ctx.grid.cols - width) / 2), row, width });
    }

    update(input: UiInputFrame): void {
        const action = this.menu.update(input, this.ctx.grid);
        if (action === 'new') {
            this.ctx.screens.push(new TeamSelectScreen(this.ctx));
        } else if (action === 'load') {
            this.ctx.screens.push(new SaveLoadScreen(this.ctx, 'load'));
        } else if (action === 'settings') {
            this.ctx.screens.push(new SettingsScreen(this.ctx));
        }
    }

    render(): void {
        // Menu labels are locale-dependent; rebuild to reflect settings changes.
        this.rebuildMenu();
        const grid = this.ctx.grid;
        const titleRow = Math.floor(grid.rows / 4);
        grid.putCenter(titleRow, ROLE.header, `### ${t('app.title')} ###`);
        grid.putCenter(titleRow + 2, ROLE.textDim, t('app.subtitle'));
        this.menu.render(grid);
        grid.putCenter(grid.rows - 2, ROLE.textDim, `${t('hint.navigate')}   ${t('hint.select')}`);
    }
}
