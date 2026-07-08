import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { markHintSeen, type ContextualHintId } from '../../core/contextualHints';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { ROLE } from '../theme';

/** One-shot contextual hint shown when a system first becomes relevant. */
export class ContextualHintScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly hintId: ContextualHintId;
    private readonly onDone: () => void;

    constructor(ctx: AppContext, hintId: ContextualHintId, onDone: () => void) {
        this.ctx = ctx;
        this.hintId = hintId;
        this.onDone = onDone;
    }

    private get state() {
        const state = this.ctx.session?.state;
        if (!state) {
            throw new Error('ContextualHintScreen: no session');
        }
        return state;
    }

    update(input: UiInputFrame): void {
        if (input.confirm || input.cancel) {
            markHintSeen(this.state, this.hintId);
            this.ctx.screens.pop();
            this.onDone();
        }
    }

    render(): void {
        drawChrome(this.ctx, t('hint.contextual.title'), [t('hint.select'), t('hint.back')]);
        const grid = this.ctx.grid;
        grid.put(3, 4, ROLE.header, t(`hint.contextual.${this.hintId}.title` as Parameters<typeof t>[0]));
        grid.put(3, 6, ROLE.text, t(`hint.contextual.${this.hintId}.body` as Parameters<typeof t>[0]));
    }
}
