import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import type { OffseasonMovementKind, OffseasonPlayerMovement, OffseasonSummary } from '../../core/model/types';
import { t, type TranslationKey } from '../../i18n';
import { drawChrome } from '../chrome';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';

type MovementTab = OffseasonMovementKind;
const MOVEMENT_TABS: MovementTab[] = ['retired', 'leftAbroad', 'freeAgent'];

function reasonLabel(reason: OffseasonPlayerMovement['reason']): string {
    if (!reason) {
        return '';
    }
    const key = `offseason.movement.reason.${reason}` as TranslationKey;
    try {
        return t(key);
    } catch {
        return reason;
    }
}

/** Shows offseason rollover results before starting the next season. */
export class OffseasonScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly summary: OffseasonSummary;
    private readonly onContinue: () => void;
    private readonly table: DataTable;
    private tab: MovementTab = 'retired';

    constructor(ctx: AppContext, summary: OffseasonSummary, onContinue: () => void) {
        this.ctx = ctx;
        this.summary = summary;
        this.onContinue = onContinue;
        this.table = new DataTable({ col: 2, row: 14, visibleRows: 8 }, false);
    }

    private switchTab(direction: 1 | -1): void {
        const index = (MOVEMENT_TABS.indexOf(this.tab) + direction + MOVEMENT_TABS.length) % MOVEMENT_TABS.length;
        this.tab = MOVEMENT_TABS[index] as MovementTab;
        this.table.selected = 0;
    }

    private tabMovements(): OffseasonPlayerMovement[] {
        return this.summary.playerMovements.filter((m) => m.kind === this.tab);
    }

    private rebuildTable(): void {
        const movements = this.tabMovements();
        const rows = movements.map((movement) => {
            const userTag = movement.isUserPlayer ? t('offseason.movement.userTag') : '';
            const reason = this.tab === 'freeAgent' ? reasonLabel(movement.reason) : '';
            const detail = [movement.formerTeamName, `${movement.age}`, reason, userTag]
                .filter((part) => part.length > 0)
                .join('  ');
            return {
                cells: [movement.name, movement.position, detail],
                color: movement.isUserPlayer ? ROLE.warning : ROLE.textDim,
            };
        });
        this.table.setData(
            [
                { header: t('offseason.movement.col.name'), width: 16 },
                { header: t('offseason.movement.col.pos'), width: 3 },
                { header: t('offseason.movement.col.detail'), width: 28 },
            ],
            rows,
        );
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            this.onContinue();
            return;
        }
        if (input.left) {
            this.switchTab(-1);
        }
        if (input.right) {
            this.switchTab(1);
        }
        this.table.update(input, this.ctx.grid);
        if (input.confirm) {
            this.ctx.screens.pop();
            this.onContinue();
        }
    }

    render(): void {
        const grid = this.ctx.grid;
        const s = this.summary;
        drawChrome(this.ctx, t('offseason.title'), [t('hint.pages'), t('offseason.continue'), t('hint.back')]);

        let row = 4;
        if (s.sponsorExpired) {
            grid.put(3, row, ROLE.warning, t('offseason.sponsorExpired'));
            row++;
        }
        if (s.breakthroughOffers > 0) {
            grid.put(3, row, ROLE.gold, t('offseason.breakthroughOffers', { n: s.breakthroughOffers }));
            row++;
        }
        if (s.contractsExpired > 0) {
            grid.put(3, row, ROLE.text, t('offseason.contractsExpired', { n: s.contractsExpired }));
            row++;
        }
        if (s.newFreeAgents > 0) {
            grid.put(3, row, ROLE.text, t('offseason.newFAs', { n: s.newFreeAgents }));
            row++;
        }
        if (s.youthGraduated > 0) {
            grid.put(3, row, ROLE.text, t('offseason.youthGraduated', { n: s.youthGraduated }));
            row++;
        }
        if (s.playersRetired > 0) {
            grid.put(3, row, ROLE.text, t('offseason.retirements', { n: s.playersRetired }));
            row++;
        }
        for (const retirement of s.userRetirements) {
            grid.put(3, row, ROLE.warning, t('offseason.userRetirement', { name: retirement }));
            row++;
        }

        const tabRow = row + 1;
        const tableRow = tabRow + 2;
        const visibleRows = Math.max(4, grid.rows - tableRow - 2);
        this.table.setLayoutPosition(tableRow, visibleRows);

        let col = 2;
        for (const tab of MOVEMENT_TABS) {
            const count = s.playerMovements.filter((m) => m.kind === tab).length;
            const label = t(`offseason.tab.${tab}` as TranslationKey, { n: count });
            const active = tab === this.tab;
            if (active) {
                grid.fillCells(col, tabRow, label.length + 2, 1, ROLE.highlight);
            }
            grid.put(col + 1, tabRow, active ? ROLE.highlightText : ROLE.textDim, label);
            col += label.length + 4;
        }

        this.rebuildTable();
        const movements = this.tabMovements();
        if (movements.length === 0) {
            grid.put(3, tableRow + 1, ROLE.textDim, t('offseason.movement.empty'));
        } else {
            this.table.render(grid);
        }
    }
}
