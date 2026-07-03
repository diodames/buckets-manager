import type { RoundResult } from '../core/game';
import type { GameConfig } from '../core/game';
import type { GameState } from '../core/model/types';
import type { Locale } from '../i18n';
import type { StorageAdapter } from '../services/storage';
import type { TextGrid } from '../ui/text';
import type { UiInputFrame } from './UiInput';
import type { ScreenStack } from './ScreenStack';

export interface Screen {
    onEnter?(): void;
    onExit?(): void;
    update(input: UiInputFrame): void;
    render(): void;
    // Overlays (dialogs) render on top of the screens below them.
    readonly isOverlay?: boolean;
}

export interface GameSession {
    state: GameState;
    lastRound: RoundResult | null;
}

export interface AppSettings {
    locale: Locale;
}

// Service bag handed to every screen. One shared mutable object per app run.
export interface AppContext {
    grid: TextGrid;
    screens: ScreenStack;
    storage: StorageAdapter;
    config: GameConfig;
    settings: AppSettings;
    session: GameSession | null;
    saveSettings(): void;
}
