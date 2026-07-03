import type { Screen } from './Screen';
import type { UiInputFrame } from './UiInput';

/**
 * Screen router on top of the engine's single update/render loop. Only the
 * top screen updates; rendering starts at the topmost non-overlay screen so
 * dialogs draw over their parent.
 */
export class ScreenStack {
    private readonly stack: Screen[] = [];

    push(screen: Screen): void {
        this.stack.push(screen);
        screen.onEnter?.();
    }

    pop(): void {
        const screen = this.stack.pop();
        screen?.onExit?.();
    }

    replace(screen: Screen): void {
        this.pop();
        this.push(screen);
    }

    /** Pops everything and pushes a single root screen. */
    reset(screen: Screen): void {
        while (this.stack.length > 0) {
            this.pop();
        }
        this.push(screen);
    }

    get top(): Screen | null {
        return this.stack[this.stack.length - 1] ?? null;
    }

    update(input: UiInputFrame): void {
        this.top?.update(input);
    }

    render(): void {
        let start = this.stack.length - 1;
        while (start > 0 && this.stack[start]?.isOverlay) {
            start--;
        }
        for (let i = start; i < this.stack.length; i++) {
            this.stack[i]?.render();
        }
    }
}
