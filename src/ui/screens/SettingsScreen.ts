import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { getLocale, setLocale, t } from '../../i18n';
import { drawChrome } from '../chrome';
import { MenuList } from '../widgets/MenuList';

export class SettingsScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly menu: MenuList;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.menu = new MenuList([{ id: 'language', label: '' }], { col: 4, row: 4, width: 40 });
    }

    private toggleLanguage(): void {
        const next = getLocale() === 'cs' ? 'en' : 'cs';
        setLocale(next);
        this.ctx.settings.locale = next;
        this.ctx.saveSettings();
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        const action = this.menu.update(input, this.ctx.grid);
        if (action === 'language' || (this.menu.selected === 0 && (input.left || input.right))) {
            this.toggleLanguage();
        }
    }

    render(): void {
        const langName = getLocale() === 'cs' ? t('settings.langCs') : t('settings.langEn');
        const langItem = this.menu.items[0];
        if (langItem) {
            langItem.label = t('settings.language', { lang: langName });
        }
        drawChrome(this.ctx, t('settings.title'), [t('hint.navigate'), t('hint.select'), t('hint.back')]);
        this.menu.render(this.ctx.grid);
    }
}
