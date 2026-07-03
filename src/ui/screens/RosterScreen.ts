import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import type { Player } from '../../core/model/types';
import { overallRating } from '../../core/model/types';
import { t } from '../../i18n';
import { drawChrome } from '../chrome';
import { playerName, teamName } from '../format';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';

export class RosterScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly table: DataTable;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.table = new DataTable({ col: 2, row: 4, visibleRows: ctx.config.league.playersPerTeam }, true);
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

    update(input: UiInputFrame): void {
        if (input.cancel) {
            this.ctx.screens.pop();
            return;
        }
        this.table.update(input, this.ctx.grid);
    }

    render(): void {
        const session = this.ctx.session;
        if (!session) {
            return;
        }
        const players = this.userPlayers();
        const starters = new Set(Object.values(session.state.teams[session.state.userTeamId]?.tactics.starters ?? {}));
        this.table.setData(
            [
                { header: t('col.name'), width: 20 },
                { header: t('col.pos'), width: 3 },
                { header: t('col.age'), width: 3, align: 'right' },
                { header: t('col.height'), width: 3, align: 'right' },
                { header: t('col.ovr'), width: 3, align: 'right' },
                { header: t('col.s2'), width: 3, align: 'right' },
                { header: t('col.s3'), width: 3, align: 'right' },
                { header: t('col.pas'), width: 3, align: 'right' },
                { header: t('col.drb'), width: 3, align: 'right' },
                { header: t('col.def'), width: 3, align: 'right' },
                { header: t('col.reb'), width: 3, align: 'right' },
                { header: t('col.spd'), width: 3, align: 'right' },
                { header: t('col.iq'), width: 3, align: 'right' },
            ],
            players.map((p) => ({
                cells: [
                    playerName(p),
                    p.position,
                    String(p.age),
                    String(p.heightCm),
                    String(overallRating(p.attributes)),
                    String(p.attributes.shooting2),
                    String(p.attributes.shooting3),
                    String(p.attributes.passing),
                    String(p.attributes.dribbling),
                    String(p.attributes.defense),
                    String(p.attributes.rebounding),
                    String(p.attributes.speed),
                    String(p.attributes.iq),
                ],
                ...(starters.has(p.id) ? { color: ROLE.accent } : {}),
            })),
        );
        drawChrome(this.ctx, `${t('roster.title')} - ${teamName(session.state.userTeamId)}`, [
            t('hint.navigate'),
            t('hint.back'),
        ]);
        this.table.render(this.ctx.grid);
    }
}
