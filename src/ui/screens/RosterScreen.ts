import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { marketConfig } from '../../config/market';
import { economyConfig } from '../../config/economy';
import { contractBuyout, isAcademyPlayer, listPlayer, releasePlayer, renewalStatus, returnYouthToAcademy, unlistPlayer } from '../../core/market';
import { aggregatePlayerSeasonStats } from '../../core/playerStats';
import { playerHasAward } from '../../core/awards';
import { foreignCapStatus, formTrend, playerRoleKey } from '../../core/roster';
import type { Player } from '../../core/model/types';
import { overallRating } from '../../core/model/types';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { formatMoney, formatSalaryWithMonthly, playerName, teamName } from '../format';
import { ROLE } from '../theme';
import { ActionDialog } from './ActionDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { DataTable } from '../widgets/DataTable';
import { NegotiationScreen } from './NegotiationScreen';

export class RosterScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly table: DataTable;
    private message: string | null = null;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.table = new DataTable({ col: 2, row: 4, visibleRows: 14 }, true);
    }

    private userPlayers(): Player[] {
        const session = this.ctx.session;
        if (!session) {
            throw new Error('RosterScreen: no active game session');
        }
        const team = session.state.teams[session.state.userTeamId];
        if (!team) {
            throw new Error('RosterScreen: user team missing from state');
        }
        return team.playerIds
            .map((id) => session.state.players[id])
            .filter((p): p is Player => p !== undefined)
            .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes));
    }

    private openActions(player: Player): void {
        const state = this.ctx.session?.state;
        if (!state) {
            return;
        }
        const listed = state.market.listings.some((l) => l.playerId === player.id);
        const buyout = contractBuyout(player, marketConfig);
        const renew = renewalStatus(state, player, marketConfig);
        const renewItem =
            renew.reason === 'notExpiring'
                ? []
                : renew.canRenew
                  ? [{ id: 'renew', label: t('roster.actionRenew') }]
                  : [
                        {
                            id: 'renew',
                            label:
                                renew.reason === 'locked'
                                    ? t('roster.actionRenewLocked', { round: renew.lockedUntilRound ?? 0 })
                                    : t('roster.actionRenewTooEarly', { round: marketConfig.contracts.renewalsOpenFromRound }),
                            disabled: true,
                        },
                    ];
        const items = [
            ...renewItem,
            ...(listed
                ? [{ id: 'unlist', label: t('roster.actionUnlist') }]
                : [{ id: 'list', label: t('roster.actionList') }]),
            ...(isAcademyPlayer(player) ? [{ id: 'returnYouth', label: t('roster.actionReturnYouth') }] : []),
            { id: 'release', label: t('roster.actionRelease', { cost: formatMoney(buyout) }) },
            { id: 'close', label: t('common.back') },
        ];
        this.ctx.screens.push(
            new ActionDialog(this.ctx, playerName(player), items, (action) => {
                if (action === 'renew') {
                    this.ctx.screens.push(
                        new NegotiationScreen(this.ctx, player.id, 'renew', (accepted) => {
                            this.message = accepted ? t('nego.accepted') : null;
                        }),
                    );
                } else if (action === 'list') {
                    listPlayer(state, player.id, null, marketConfig);
                    this.message = t('roster.listedMsg', { player: playerName(player) });
                } else if (action === 'unlist') {
                    unlistPlayer(state, player.id);
                    this.message = null;
                } else if (action === 'returnYouth') {
                    this.ctx.screens.push(
                        new ConfirmDialog(this.ctx, t('roster.confirmReturnYouth', { player: playerName(player) }), (confirmed) => {
                            if (confirmed) {
                                const ok = returnYouthToAcademy(state, player.id, marketConfig, economyConfig);
                                this.message = ok ? t('roster.returnedMsg', { player: playerName(player) }) : t('market.rosterMin');
                            }
                        }),
                    );
                } else if (action === 'release') {
                    this.ctx.screens.push(
                        new ConfirmDialog(this.ctx, t('roster.confirmRelease', { player: playerName(player), cost: formatMoney(buyout) }), (confirmed) => {
                            if (!confirmed) {
                                return;
                            }
                            const result = releasePlayer(state, player.id, marketConfig, this.ctx.config.economy);
                            this.message =
                                result === 'released'
                                    ? t('roster.releasedMsg', { player: playerName(player) })
                                    : result === 'rosterMin'
                                      ? t('market.rosterMin')
                                      : result === 'cantAfford'
                                        ? t('market.cantAfford')
                                        : null;
                        }),
                    );
                }
            }),
        );
    }

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        const activated = this.table.update(input, this.ctx.grid);
        if (activated !== null) {
            const player = this.userPlayers()[activated];
            if (player) {
                this.openActions(player);
            }
        }
    }

    render(): void {
        const session = this.ctx.session;
        if (!session) {
            return;
        }
        const state = session.state;
        const players = this.userPlayers();
        const starters = new Set(Object.values(state.teams[state.userTeamId]?.tactics.starters ?? {}));
        const cap = foreignCapStatus(state, state.userTeamId);
        const awards = state.lastSeasonAwards;
        this.table.setData(
            [
                { header: t('col.name'), width: 20 },
                { header: t('col.pos'), width: 3 },
                { header: t('col.age'), width: 3, align: 'right' },
                { header: t('col.ovr'), width: 3, align: 'right' },
                { header: t('col.pot'), width: 3, align: 'right' },
                { header: t('col.salary'), width: 7, align: 'right' },
                { header: t('col.years'), width: 3, align: 'right' },
                { header: t('col.s2'), width: 3, align: 'right' },
                { header: t('col.s3'), width: 3, align: 'right' },
                { header: t('col.pas'), width: 3, align: 'right' },
                { header: t('col.def'), width: 3, align: 'right' },
                { header: t('col.reb'), width: 3, align: 'right' },
                { header: t('col.status'), width: 12 },
            ],
            players.map((p) => {
                const listed = state.market.listings.some((l) => l.playerId === p.id);
                const expiring = (p.contract?.yearsLeft ?? 0) <= 1;
                const stats = aggregatePlayerSeasonStats(state, p.id);
                const form = stats.games >= 3 ? formTrend(state, p.id, stats.ppg) : 'steady';
                const role = t(playerRoleKey(p) as Parameters<typeof t>[0]);
                const awardBadge = playerHasAward(awards, p.id, 'mvp') ? ' MVP' : '';
                const status = p.injury
                    ? t('training.injured', { rounds: p.injury.roundsOut })
                    : listed
                      ? t('market.listed')
                      : starters.has(p.id)
                        ? `${t('roster.starter')} ${role}${awardBadge}`
                        : `${role} ${t(`form.${form}` as Parameters<typeof t>[0])}${awardBadge}`;
                return {
                    cells: [
                        playerName(p),
                        p.position,
                        String(p.age),
                        String(overallRating(p.attributes)),
                        String(p.potential),
                        p.contract ? formatSalaryWithMonthly(p.contract.salary) : '-',
                        p.contract ? String(p.contract.yearsLeft) : '-',
                        String(p.attributes.shooting2),
                        String(p.attributes.shooting3),
                        String(p.attributes.passing),
                        String(p.attributes.defense),
                        String(p.attributes.rebounding),
                        status,
                    ],
                    ...(p.injury ? { color: ROLE.danger } : expiring ? { color: ROLE.warning } : starters.has(p.id) ? { color: ROLE.accent } : {}),
                };
            }),
        );
        drawChrome(this.ctx, `${t('roster.title')} - ${teamName(state.userTeamId)}`, [
            t('hint.navigate'),
            t('roster.hintActions'),
            t('hint.back'),
        ]);
        this.ctx.grid.put(2, 2, ROLE.textDim, t('roster.contractLegend'));
        this.ctx.grid.put(2, 3, ROLE.textDim, t('roster.foreignCap', { count: cap.count, max: cap.max }));
        this.table.render(this.ctx.grid);
        if (this.message) {
            this.ctx.grid.put(2, this.ctx.grid.rows - 3, ROLE.success, this.message);
        }
    }
}
