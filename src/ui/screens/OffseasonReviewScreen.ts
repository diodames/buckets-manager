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
    private continueFocused = false;

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
        if (players.length === 0) {
            this.continueFocused = true;
        } else if (this.table.selected > players.length - 1) {
            this.table.selected = players.length - 1;
            this.continueFocused = false;
        }
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.finishContinue();
            return;
        }

        const players = this.expiringPlayers();
        if (players.length === 0) {
            if (input.confirm) {
                this.finishContinue();
            }
            return;
        }

        if (this.continueFocused) {
            if (input.up) {
                this.continueFocused = false;
                this.table.selected = players.length - 1;
            }
        } else {
            this.table.update(input, this.ctx.grid);
            if (input.down && this.table.selected >= players.length - 1) {
                this.continueFocused = true;
            }
        }

        if (input.confirm) {
            if (this.continueFocused) {
                this.finishContinue();
                return;
            }
            const player = players[this.table.selected];
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
        grid.put(3, row, ROLE.text, s.fecQualified ? t('offseason.fecQualified') : t('offseason.fecNotQualified'));
        row++;
        if (s.fecFinish) {
            grid.put(3, row, ROLE.text, t('offseason.fecFinish', { finish: finishLabel(s.fecFinish) }));
            row++;
        }
        if (s.fecPrize > 0) {
            grid.put(3, row, ROLE.success, t('offseason.fecPrize', { amount: formatMoney(s.fecPrize) }));
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
        grid.put(2, headerRow, ROLE.header, t('offseason.review.expiringHeader'));

        const players = this.expiringPlayers();
        let tableRow = headerRow + 1;
        if (players.length === 0) {
            grid.put(2, tableRow, ROLE.textDim, t('offseason.review.noExpiring'));
            tableRow++;
        }

        const footerRow = grid.rows - 2;
        const visibleRows = Math.max(2, footerRow - tableRow - 2);
        this.table.setLayoutPosition(tableRow, visibleRows);

        this.rebuildTable();
        if (players.length > 0) {
            this.table.render(grid);
        }

        const continueLabel = `>> ${t('offseason.review.continueRow')}`;
        if (this.continueFocused) {
            grid.fillCells(2, footerRow, continueLabel.length + 2, 1, ROLE.highlight);
            grid.put(3, footerRow, ROLE.highlightText, continueLabel);
        } else {
            grid.put(2, footerRow, ROLE.accent, continueLabel);
        }

        if (this.message) {
            grid.put(2, grid.rows - 3, ROLE.success, this.message);
        }
    }
}
