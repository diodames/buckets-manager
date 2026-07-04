import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { applyPressChoice, type PressAnswerResult, type PressQuestion } from '../../core/press';
import { t, type TranslationKey } from '../../i18n';
import { shortPlayerName } from '../format';
import { ROLE } from '../theme';
import { MenuList } from '../widgets/MenuList';
import { DashboardScreen } from './DashboardScreen';

/**
 * Post-match press conference: one question at a time, each answer applies
 * its effects immediately and shows what it did before moving on.
 */
export class PressConferenceScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly questions: PressQuestion[];
    private index = 0;
    private menu: MenuList | null = null;
    private lastResult: PressAnswerResult | null = null;

    constructor(ctx: AppContext, questions: PressQuestion[]) {
        this.ctx = ctx;
        this.questions = questions;
    }

    onEnter(): void {
        this.buildMenu();
    }

    private get current(): PressQuestion | null {
        return this.questions[this.index] ?? null;
    }

    private buildMenu(): void {
        const question = this.current;
        if (!question) {
            this.menu = null;
            return;
        }
        this.menu = new MenuList(
            question.def.choices.map((choice) => ({
                id: choice.id,
                label: t(`press.${question.def.id}.${choice.id}` as TranslationKey),
            })),
            { col: 8, row: 12, width: 64 },
        );
    }

    update(input: UiInputFrame): void {
        if (this.lastResult) {
            if (input.confirm || input.cancel) {
                this.lastResult = null;
                this.index++;
                if (this.index >= this.questions.length) {
                    this.ctx.screens.reset(new DashboardScreen(this.ctx));
                    return;
                }
                this.buildMenu();
            }
            return;
        }
        const question = this.current;
        if (!question || !this.menu) {
            this.ctx.screens.reset(new DashboardScreen(this.ctx));
            return;
        }
        const picked = this.menu.update(input, this.ctx.grid);
        if (picked) {
            const choice = question.def.choices.find((c) => c.id === picked);
            if (choice) {
                this.lastResult = applyPressChoice(this.ctx.session?.state ?? this.failState(), question, choice);
            }
        }
    }

    private failState(): never {
        throw new Error('PressConferenceScreen: no session');
    }

    render(): void {
        const grid = this.ctx.grid;
        const question = this.current;
        grid.fillCells(0, 0, grid.cols, 1, ROLE.panel);
        grid.put(1, 0, ROLE.header, t('press.title'));
        grid.putRight(grid.cols - 1, 0, ROLE.textDim, `${this.index + 1}/${this.questions.length}`);
        if (!question) {
            return;
        }
        const state = this.ctx.session?.state;
        const player = question.playerId && state ? state.players[question.playerId] : null;
        grid.put(4, 4, ROLE.accent, t('press.reporter'));
        grid.put(4, 6, ROLE.textBright, t(`press.${question.def.id}.q` as TranslationKey, { player: player ? shortPlayerName(player) : '' }));

        if (this.lastResult) {
            const effects: string[] = [];
            if (this.lastResult.teamMorale !== 0) {
                effects.push(t('press.fx.teamMorale', { n: signed(this.lastResult.teamMorale) }));
            }
            if (this.lastResult.starMorale !== 0 && player) {
                effects.push(t('press.fx.starMorale', { player: shortPlayerName(player), n: signed(this.lastResult.starMorale) }));
            }
            if (this.lastResult.fanSupport !== 0) {
                effects.push(t('press.fx.fans', { n: signed(this.lastResult.fanSupport) }));
            }
            if (this.lastResult.sponsorRelation !== 0) {
                effects.push(t('press.fx.sponsors', { n: signed(this.lastResult.sponsorRelation) }));
            }
            grid.put(6, 12, ROLE.header, t('press.fx.title'));
            if (effects.length === 0) {
                grid.put(6, 13, ROLE.textDim, t('press.fx.none'));
            }
            effects.forEach((line, i) => {
                grid.put(6, 13 + i, ROLE.text, line);
            });
            grid.put(6, 19, ROLE.textDim, t('report.continue'));
        } else {
            this.menu?.render(grid);
        }
        grid.fillCells(0, grid.rows - 1, grid.cols, 1, ROLE.panel);
        grid.put(1, grid.rows - 1, ROLE.textDim, [t('hint.navigate'), t('hint.select')].join('   '));
    }
}

function signed(n: number): string {
    return n > 0 ? `+${n}` : String(n);
}
