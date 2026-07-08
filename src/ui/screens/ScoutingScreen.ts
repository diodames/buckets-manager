import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import {
    canNegotiateScoutedFreeAgent,
    completeScoutingPhase,
    displayedOverall,
    requestDeepReport,
    requestQuickReport,
    scoutedPlayerIds,
} from '../../core/scouting';
import { canNegotiate } from '../../core/market';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { formatMoney, playerName, teamDef } from '../format';
import { ROLE } from '../theme';
import { MenuList } from '../widgets/MenuList';
import { NegotiationScreen } from './NegotiationScreen';

function stars(value: number): string {
    const full = Math.floor(value);
    const half = value - full >= 0.5;
    return '*'.repeat(full) + (half ? '+' : '');
}

/** Pre-season scouting: review opening free agents before round 1. */
export class ScoutingScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly onContinue: () => void;
    private menu: MenuList;
    private message: string | null = null;

    constructor(ctx: AppContext, onContinue: () => void) {
        this.ctx = ctx;
        this.onContinue = onContinue;
        this.menu = new MenuList([], { col: 2, row: 6, width: 72 });
    }

    onEnter(): void {
        this.rebuild();
    }

    private get state() {
        const state = this.ctx.session?.state;
        if (!state) {
            throw new Error('ScoutingScreen: no session');
        }
        return state;
    }

    private rebuild(): void {
        const state = this.state;
        const ids = scoutedPlayerIds(state);
        this.menu = new MenuList(
            [
                ...ids.map((id) => {
                    const player = state.players[id];
                    const report = state.market.scoutedFreeAgents[id];
                    if (!player || !report) {
                        return { id, label: id };
                    }
                    const ovr = report.revealed
                        ? String(displayedOverall(state, player))
                        : `${report.overallMin}-${report.overallMax}`;
                    const rumor = report.linkedTeamId
                        ? `  ${t('scouting.linked', { team: teamDef(report.linkedTeamId).abbr })}`
                        : '';
                    return {
                        id,
                        label: `${playerName(player).padEnd(20)} ${player.position}  ${ovr}  ${stars(report.starMin)}-${stars(report.starMax)}${rumor}`,
                    };
                }),
                { id: '__continue__', label: t('scouting.continue') },
            ],
            { col: 2, row: 6, width: 72 },
        );
    }

    update(input: UiInputFrame): void {
        const picked = this.menu.update(input, this.ctx.grid);
        if (!picked) {
            return;
        }
        if (picked === '__continue__') {
            completeScoutingPhase(this.state);
            this.ctx.screens.pop();
            this.onContinue();
            return;
        }
        const state = this.state;
        const player = state.players[picked];
        if (!player) {
            return;
        }
        if (input.cancel && picked !== '__continue__') {
            const report = state.market.scoutedFreeAgents[picked];
            if (!report) {
                return;
            }
            if (report.tier === 'rumour') {
                if (requestQuickReport(state, picked, this.ctx.config.economy)) {
                    this.message = t('scouting.quickDone', { player: playerName(player) });
                } else {
                    this.message = t('scouting.noBudget');
                }
            } else if (report.tier === 'quick') {
                if (requestDeepReport(state, picked, this.ctx.config.economy)) {
                    this.message = t('scouting.deepDone', { player: playerName(player) });
                } else {
                    this.message = t('scouting.noBudget');
                }
            } else {
                this.message = t('scouting.alreadyDeep');
            }
            this.rebuild();
            return;
        }
        if (input.confirm) {
            if (!canNegotiateScoutedFreeAgent(state, picked)) {
                this.message = t('scouting.needReport');
                return;
            }
            if (!canNegotiate(state, player, this.ctx.config.market)) {
                this.message = t('nego.locked');
                return;
            }
            this.ctx.screens.push(new NegotiationScreen(this.ctx, picked, 'freeAgent', () => {
                this.rebuild();
            }));
            return;
        }
    }

    render(): void {
        const state = this.state;
        const grid = this.ctx.grid;
        drawChrome(this.ctx, t('scouting.title'), [
            t('hint.navigate'),
            t('hint.select'),
            t('scouting.hintScout'),
            t('scouting.hintSign'),
        ]);
        grid.put(2, 2, ROLE.text, t('scouting.budget', {
            remaining: formatMoney(state.market.scoutingBudget),
            total: formatMoney(state.market.scoutingBudgetTotal),
        }));
        grid.put(2, 3, ROLE.textDim, t('scouting.intro'));
        if (scoutedPlayerIds(state).length === 0) {
            grid.put(2, 6, ROLE.textDim, t('scouting.empty'));
        } else {
            this.menu.render(grid);
        }
        if (this.message) {
            grid.put(2, grid.rows - 3, ROLE.accent, this.message);
        }
    }
}
