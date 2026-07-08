import { BT, Vector2i, type HardwareSettings } from 'blit386';
import { balanceConfig, bclConfig, displayConfig, fecConfig, leagueConfig, namePools, validateAllConfigs } from '../config';
import { advanceRoundInstant } from '../core/game';
import { economyConfig } from '../config/economy';
import { externalOffersConfig } from '../config/externalOffers';
import { marketConfig } from '../config/market';
import { momentsConfig } from '../config/moments';
import { pressConfig } from '../config/press';
import { trainingConfig } from '../config/training';
import { setLocale, type Locale } from '../i18n';
import { LocalStorageAdapter, SETTINGS_KEY } from '../services/storage';
import { drawChromeErrorFallback } from '../ui/errorScreen';
import { MainMenuScreen } from '../ui/screens/MainMenuScreen';
import { ROLE, buildPalette } from '../ui/theme';
import { TextGrid } from '../ui/text';
import type { AppContext, AppSettings } from './Screen';
import { ScreenStack } from './ScreenStack';
import { buildInputFrame } from './UiInput';

function loadSettings(storage: LocalStorageAdapter): AppSettings {
    const raw = storage.get(SETTINGS_KEY);
    if (raw !== null) {
        try {
            const parsed = JSON.parse(raw) as Partial<AppSettings>;
            if (parsed.locale === 'cs' || parsed.locale === 'en') {
                return { locale: parsed.locale };
            }
        } catch {
            // Corrupt settings fall through to the first-run default below.
        }
    }
    const browserPrefersCzech = typeof navigator !== 'undefined' && navigator.language.startsWith('cs');
    return { locale: browserPrefersCzech ? 'cs' : ('en' as Locale) };
}

/**
 * Engine glue class: owns the screen stack and translates the engine's
 * configure/init/update/render lifecycle into screen calls. No game logic
 * lives here.
 */
export class ManagerGame {
    private ctx: AppContext | null = null;
    private initError: Error | null = null;

    configure(): Partial<HardwareSettings> {
        return {
            displaySize: new Vector2i(displayConfig.width, displayConfig.height),
            maxCanvasSize: new Vector2i(displayConfig.maxCanvasWidth, displayConfig.maxCanvasHeight),
            targetFPS: displayConfig.targetFPS,
        };
    }

    async init(): Promise<boolean> {
        try {
            validateAllConfigs();
            BT.paletteSet(buildPalette());
            const storage = new LocalStorageAdapter();
            const settings = loadSettings(storage);
            setLocale(settings.locale);
            const ctx: AppContext = {
                grid: TextGrid.measure(),
                screens: new ScreenStack(),
                storage,
                config: {
                    league: leagueConfig,
                    bcl: bclConfig,
                    fec: fecConfig,
                    balance: balanceConfig,
                    names: namePools,
                    moments: momentsConfig,
                    economy: economyConfig,
                    training: trainingConfig,
                    press: pressConfig,
                    market: marketConfig,
                    externalOffers: externalOffersConfig,
                },
                settings,
                session: null,
                saveSettings() {
                    storage.set(SETTINGS_KEY, JSON.stringify(this.settings));
                },
            };
            this.ctx = ctx;
            ctx.screens.push(new MainMenuScreen(ctx));
            if (import.meta.env.DEV) {
                // Dev-only console hook for driving the game headlessly.
                (window as unknown as Record<string, unknown>).__bbm = {
                    ctx,
                    simRound: () => {
                        if (ctx.session) {
                            ctx.session.lastRound = advanceRoundInstant(ctx.session.state, ctx.config);
                        }
                    },
                };
            }
            return true;
        } catch (error) {
            // Fail fast but visibly: keep the loop alive to render the error.
            this.initError = error instanceof Error ? error : new Error(String(error));
            console.error('ManagerGame.init failed:', this.initError);
            return true;
        }
    }

    update(): void {
        if (this.initError || !this.ctx) {
            return;
        }
        this.ctx.screens.update(buildInputFrame());
    }

    render(): void {
        BT.clear(ROLE.bg);
        if (this.initError) {
            drawChromeErrorFallback(this.initError);
            return;
        }
        this.ctx?.screens.render();
    }
}
