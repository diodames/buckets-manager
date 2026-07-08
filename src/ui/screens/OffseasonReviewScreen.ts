import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { marketConfig } from '../../config/market';
import type { OffseasonReviewSummary, Player } from '../../core/model/types';
import { renewalStatus } from '../../core/market';
import { userExpiringContractPlayers } from '../../core/season';
import { t, type TranslationKey } from '../../i18n';
import { drawChrome } from '../chrome';
import { formatMoney, playerName } from '../format';
import { ROLE } from '../theme';
import { DataTable, type TableRow } from '../widgets/DataTable';
import { NegotiationScreen } from './NegotiationScreen';

function finishLabel(finish: string): string {
    const key = `offseason.finish.${finish}` as TranslationKey;
    try {
        return t(key);
    } catch {
        return finish;
    }
}

/** End-of-season review: prizes, sponsor settlement, and expiring contract renewals. */
export class OffseasonReviewScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly summary: OffseasonReviewSummary;
    private readonly onContinue: () => void;
    private readonly table: DataTable;
    private message: string | null = null;

    constructor(ctx: AppContext, summary: OffseasonReviewSummary, onContinue: () => void) {
        this.ctx = ctx;
        this.summary = summary;
        this.onContinue = onContinue;
        this.table = new DataTable({ col: 2, row: 14, visibleRows: 6 }, true);
    }

    private expiringPlayers(): Player[] {
        const session = this.ctx.session;
        if (!session) {
            return [];
        }
        return userExpiringContractPlayers(session.state);
    }

    private continueIndex(): number {
        return this.expiringPlayers().length;
    }

    private openRenew(player: Player): void {
        const state = this.ctx.session?.state;
        if (!state) {
            return;
        }
        const renew = renewalStatus(state, player, marketConfig);
        if (!renew.canRenew) {
            this.message =
                renew.reason === 'locked'
                    ? t('roster.actionRenewLocked', { round: renew.lockedUntilRound ?? 0 })
                    : t('roster.actionRenewTooEarly', { round: marketConfig.contracts.renewalsOpenFromRound });
            return;
        }
        this.ctx.screens.push(
            new NegotiationScreen(this.ctx, player.id, 'renew', (accepted) => {
                this.message = accepted ? t('nego.accepted') : null;
                this.rebuildTable();
            }),
        );
    }

    private finishContinue(): void {
        this.ctx.screens.pop();
        this.onContinue();
    }

    private rebuildTable(): void {
        const players = this.expiringPlayers();
        const rows: TableRow[] = players.map((player) => ({
            cells: [
                playerName(player),
                player.position,
                String(player.age),
                player.contract ? formatMoney(player.contract.salary) : '-',
                player.contract ? String(player.contract.yearsLeft) : '-',
            ],
            color: ROLE.warning,
        }));
        rows.push({
            cells: [t('offseason.review.continueRow'), '→', '', '', ''],
            color: ROLE.accent,
        });
        this.table.setData(
            [
                { header: t('col.name'), width: 18 },
                { header: t('col.pos'), width: 3 },
                { header: t('col.age'), width: 3, align: 'right' },
                { header: t('col.salary'), width: 8, align: 'right' },
                { header: t('col.years'), width: 3, align: 'right' },
            ],
            rows,
        );
        if (this.table.selected > rows.length - 1) {
            this.table.selected = rows.length - 1;
        }
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            this.onContinue();
            return;
        }
        const activated = this.table.update(input, this.ctx.grid);
        if (input.confirm && activated !== null) {
            if (activated === this.continueIndex()) {
                this.finishContinue();
                return;
            }
            const player = this.expiringPlayers()[activated];
            if (player) {
                this.openRenew(player);
            }
        }
    }

    render(): void {
        const grid = this.ctx.grid;
        const s = this.summary;
        drawChrome(this.ctx, t('offseason.review.title'), [
            t('hint.navigate'),
            t('offseason.review.hintRenew'),
            t('offseason.review.continue'),
        ]);

        let row = 4;
        grid.put(3, row, ROLE.header, t('offseason.nblFinish', { finish: finishLabel(s.nblFinish) }));
        row++;
        if (s.nblPrize > 0) {
            grid.put(3, row, ROLE.success, t('offseason.nblPrize', { amount: formatMoney(s.nblPrize) }));
            row++;
        }
        if (s.nblLeagueRank != null) {
            grid.put(3, row, ROLE.text, t('offseason.nblLeagueRank', { rank: s.nblLeagueRank }));
            row++;
        }
        if (s.nblLeaguePrize > 0) {
            grid.put(3, row, ROLE.success, t('offseason.nblLeaguePrize', { amount: formatMoney(s.nblLeaguePrize) }));
            row++;
        }
        row++;
        grid.put(3, row, ROLE.text, s.bclQualified ? t('offseason.bclQualified') : t('offseason.bclNotQualified'));
        row++;
        if (s.bclFinish) {
            grid.put(3, row, ROLE.text, t('offseason.bclFinish', { finish: finishLabel(s.bclFinish) }));
            row++;
        }
        if (s.bclPrize > 0) {
            grid.put(3, row, ROLE.success, t('offseason.bclPrize', { amount: formatMoney(s.bclPrize) }));
            row++;
        }
        row++;
        if (s.sponsorBonus > 0) {
            grid.put(3, row, ROLE.success, t('offseason.sponsorBonus', {
                amount: formatMoney(s.sponsorBonus),
            }));
            row++;
        }
        if (!s.sponsorTargetMet && s.sponsorPromisedRank !== null) {
            grid.put(3, row, ROLE.warning, t('offseason.sponsorNoRenewal'));
            row++;
        }
        if (s.totalIncome > 0) {
            grid.put(3, row, ROLE.gold, t('offseason.review.totalIncome', { amount: formatMoney(s.totalIncome) }));
            row++;
        }

        const headerRow = row + 1;
        const tableRow = headerRow + 1;
        const visibleRows = Math.max(3, grid.rows - tableRow - 3);
        this.table.setLayoutPosition(tableRow, visibleRows);

        grid.put(2, headerRow, ROLE.header, t('offseason.review.expiringHeader'));
        this.rebuildTable();
        const players = this.expiringPlayers();
        if (players.length === 0) {
            grid.put(2, tableRow + 1, ROLE.textDim, t('offseason.review.noExpiring'));
        }
        this.table.render(grid);
        if (this.message) {
            grid.put(2, grid.rows - 3, ROLE.success, this.message);
        }
    }
}
