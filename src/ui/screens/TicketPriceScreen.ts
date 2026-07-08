import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { balanceConfig } from '../../config/balance';
import { economyConfig } from '../../config/economy';
import { arenaCapacity, computeGateReceipts, derbyGateIncomeMult, homeAdvantageDisplayPct, homeCourtAdvantage, realArenaCapacity, setTicketPrice } from '../../core/economy';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { formatMoney } from '../format';
import { ROLE } from '../theme';
import { MenuList } from '../widgets/MenuList';

/** Adjust ticket price with live attendance and gate-receipt preview. */
export class TicketPriceScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly menu: MenuList;
    private price: number;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        const state = ctx.session?.state;
        this.price = state?.club.ticketPrice ?? economyConfig.tickets.defaultPrice;
        this.menu = new MenuList(
            [
                { id: 'price', label: '' },
                { id: 'done', label: t('ticket.done') },
            ],
            { col: 14, row: 10, width: 50 },
        );
    }

    private get state() {
        const state = this.ctx.session?.state;
        if (!state) {
            throw new Error('TicketPriceScreen: no session');
        }
        return state;
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        const selected = this.menu.items[this.menu.selected]?.id;
        if ((input.left || input.right) && selected === 'price') {
            const step = economyConfig.tickets.priceStep * (input.right ? 1 : -1);
            this.price = setTicketPrice(this.state, this.price + step, economyConfig);
        }
        const action = this.menu.update(input, this.ctx.grid);
        if (action === 'done') {
            setTicketPrice(this.state, this.price, economyConfig);
            this.ctx.screens.pop();
        }
    }

    render(): void {
        const state = this.state;
        const grid = this.ctx.grid;
        const realCap = realArenaCapacity(this.ctx.config.league, state.userTeamId);
        const capacity = arenaCapacity(state, economyConfig, realCap);
        const gate = computeGateReceipts(state.club.fanSupport, this.price, capacity, economyConfig);
        const nextHome = state.fixtures
            .filter((f) => (!f.competitionId || f.competitionId === 'nbl') && f.result === null && f.homeTeamId === state.userTeamId)
            .sort((a, b) => a.round - b.round)[0];
        const derbyMult = nextHome
            ? derbyGateIncomeMult(state.userTeamId, nextHome.awayTeamId, economyConfig)
            : 1;
        const projectedIncome = Math.round(gate.ticketIncome * derbyMult);
        const pct = Math.round(gate.attendanceRate * 100);

        drawChrome(this.ctx, t('ticket.title'), [t('hint.navigate'), t('hint.adjust'), t('hint.back')]);
        grid.put(4, 2, ROLE.text, t('club.fans', { n: Math.round(state.club.fanSupport) }));
        grid.put(4, 3, ROLE.text, t('club.capacity', { n: capacity }));
        grid.put(4, 4, ROLE.textDim, t('ticket.fairPrice', { amount: gate.fairPrice }));

        const priceItem = this.menu.items[0];
        if (priceItem) {
            priceItem.label = t('ticket.price', { amount: this.price });
        }
        this.menu.render(grid);

        const previewRow = 14;
        grid.put(4, previewRow, ROLE.header, t('ticket.projectedAttendance', {
            pct,
            sold: gate.ticketsSold,
            capacity,
        }));
        grid.put(4, previewRow + 1, ROLE.success, t('ticket.projectedIncome', { amount: formatMoney(projectedIncome) }));
        if (derbyMult > 1) {
            grid.put(4, previewRow + 2, ROLE.warning, t('ticket.derbyBoost', {
                pct: Math.round((derbyMult - 1) * 100),
            }));
        }
        const homeBoostRow = derbyMult > 1 ? previewRow + 3 : previewRow + 2;
        const homeBoost = homeCourtAdvantage(
            state,
            state.userTeamId,
            economyConfig,
            this.ctx.config.league,
            balanceConfig.match.homeAdvantage,
            this.price,
        );
        grid.put(4, homeBoostRow, ROLE.textDim, t('ticket.homeAdvantage', { pct: homeAdvantageDisplayPct(homeBoost) }));
    }
}
