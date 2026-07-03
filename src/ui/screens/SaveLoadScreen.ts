import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { deserializeSave, SaveError, serializeSave, type SaveFile } from '../../core/save/save';
import { t } from '../../i18n';
import { AUTOSAVE_KEY, SAVE_SLOT_KEYS } from '../../services/storage';
import { drawChrome } from '../chrome';
import { teamDef } from '../format';
import { ROLE } from '../theme';
import { MenuList } from '../widgets/MenuList';
import { ConfirmDialog } from './ConfirmDialog';
import { DashboardScreen } from './DashboardScreen';

type Mode = 'save' | 'load';

interface SlotInfo {
    key: string;
    label: string;
    file: SaveFile | null;
    error: 'corrupt' | 'tooNew' | null;
}

export class SaveLoadScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly mode: Mode;
    private slots: SlotInfo[] = [];
    private menu: MenuList;
    private statusMessage = '';
    private statusColor = ROLE.success;

    constructor(ctx: AppContext, mode: Mode) {
        this.ctx = ctx;
        this.mode = mode;
        this.menu = new MenuList([], { col: 4, row: 4, width: 60 });
    }

    onEnter(): void {
        this.refresh();
    }

    private slotDescription(info: SlotInfo): string {
        if (info.error === 'corrupt') {
            return t('save.errorCorrupt');
        }
        if (info.error === 'tooNew') {
            return t('save.errorTooNew');
        }
        if (!info.file) {
            return t('save.empty');
        }
        const team = teamDef(info.file.state.userTeamId);
        const date = info.file.savedAtIso.slice(0, 10);
        return `${team.abbr}  ${t('common.round', { round: info.file.state.currentRound })}  ${date}`;
    }

    private refresh(): void {
        const keys = this.mode === 'load' ? [AUTOSAVE_KEY, ...SAVE_SLOT_KEYS] : [...SAVE_SLOT_KEYS];
        this.slots = keys.map((key, index) => {
            const label = key === AUTOSAVE_KEY ? t('save.autosave') : t('save.slot', { n: this.mode === 'load' ? index : index + 1 });
            const raw = this.ctx.storage.get(key);
            if (raw === null) {
                return { key, label, file: null, error: null };
            }
            try {
                return { key, label, file: deserializeSave(raw), error: null };
            } catch (error) {
                return { key, label, file: null, error: error instanceof SaveError ? error.kind : 'corrupt' };
            }
        });
        this.menu = new MenuList(
            this.slots.map((info) => ({
                id: info.key,
                label: `${info.label.padEnd(12)} ${this.slotDescription(info)}`,
                disabled: this.mode === 'load' && info.file === null,
            })),
            { col: 4, row: 4, width: 64 },
        );
    }

    private writeSave(info: SlotInfo): void {
        const session = this.ctx.session;
        if (!session) {
            return;
        }
        const name = t('save.slot', { n: this.slots.indexOf(info) + 1 });
        this.ctx.storage.set(info.key, serializeSave(session.state, name, new Date().toISOString()));
        this.statusMessage = t('save.saved');
        this.statusColor = ROLE.success;
        this.refresh();
    }

    private handleSlot(info: SlotInfo): void {
        if (this.mode === 'save') {
            if (info.file || info.error) {
                this.ctx.screens.push(
                    new ConfirmDialog(this.ctx, t('save.confirmOverwrite'), (confirmed) => {
                        if (confirmed) {
                            this.writeSave(info);
                        }
                    }),
                );
            } else {
                this.writeSave(info);
            }
            return;
        }
        if (!info.file) {
            return;
        }
        this.ctx.session = { state: info.file.state, lastRound: null };
        this.ctx.screens.reset(new DashboardScreen(this.ctx));
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        const activated = this.menu.update(input, this.ctx.grid);
        if (activated) {
            const info = this.slots.find((s) => s.key === activated);
            if (info) {
                this.handleSlot(info);
            }
        }
    }

    render(): void {
        drawChrome(this.ctx, this.mode === 'save' ? t('save.titleSave') : t('save.titleLoad'), [
            t('hint.navigate'),
            t('hint.select'),
            t('hint.back'),
        ]);
        this.menu.render(this.ctx.grid);
        if (this.statusMessage) {
            this.ctx.grid.put(4, 4 + this.slots.length + 2, this.statusColor, this.statusMessage);
        }
    }
}
