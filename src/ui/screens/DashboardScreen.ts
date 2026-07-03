import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { advanceRound, isSeasonOver, nextUserFixture } from '../../core/game';
import { computeStandings } from '../../core/league/standings';
import { serializeSave } from '../../core/save/save';
import { t } from '../../i18n';
import { AUTOSAVE_KEY } from '../../services/storage';
import { drawChrome } from '../chrome';
import { fixtureLine, teamName } from '../format';
import { ROLE } from '../theme';
import { MenuList } from '../widgets/MenuList';
import { RosterScreen } from './RosterScreen';
import { SaveLoadScreen } from './SaveLoadScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { SettingsScreen } from './SettingsScreen';
import { StandingsScreen } from './StandingsScreen';

export class DashboardScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly menu: MenuList;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.menu = new MenuList([], { col: 3, row: 4, width: 30 });
    }

    private get sessionOrThrow() {
        const session = this.ctx.session;
        if (!session) {
            throw new Error('DashboardScreen: no active game session');
        }
        return session;
    }

    private rebuildMenu(): void {
        const session = this.sessionOrThrow;
        const seasonOver = isSeasonOver(session.state, this.ctx.config);
        this.menu.items = [
            {
                id: 'continue',
                label: seasonOver ? t('dashboard.noMatch') : t('dashboard.continue', { round: session.state.currentRound }),
                disabled: seasonOver,
            },
            { id: 'roster', label: t('dashboard.roster') },
            { id: 'schedule', label: t('dashboard.schedule') },
            { id: 'standings', label: t('dashboard.standings') },
            { id: 'save', label: t('dashboard.save') },
            { id: 'load', label: t('dashboard.load') },
            { id: 'settings', label: t('dashboard.settings') },
        ];
    }

    private playRound(): void {
        const session = this.sessionOrThrow;
        session.lastRound = advanceRound(session.state, this.ctx.config);
        this.ctx.storage.set(
            AUTOSAVE_KEY,
            serializeSave(session.state, t('save.autosave'), new Date().toISOString()),
        );
    }

    update(input: UiInputFrame): void {
        this.rebuildMenu();
        const action = this.menu.update(input, this.ctx.grid);
        switch (action) {
            case 'continue':
                this.playRound();
                break;
            case 'roster':
                this.ctx.screens.push(new RosterScreen(this.ctx));
                break;
            case 'schedule':
                this.ctx.screens.push(new ScheduleScreen(this.ctx));
                break;
            case 'standings':
                this.ctx.screens.push(new StandingsScreen(this.ctx));
                break;
            case 'save':
                this.ctx.screens.push(new SaveLoadScreen(this.ctx, 'save'));
                break;
            case 'load':
                this.ctx.screens.push(new SaveLoadScreen(this.ctx, 'load'));
                break;
            case 'settings':
                this.ctx.screens.push(new SettingsScreen(this.ctx));
                break;
            default:
                break;
        }
    }

    render(): void {
        this.rebuildMenu();
        const session = this.sessionOrThrow;
        const grid = this.ctx.grid;
        drawChrome(this.ctx, t('dashboard.title'), [t('hint.navigate'), t('hint.select')]);
        this.menu.render(grid);

        const infoCol = 38;
        let row = 4;
        const seasonOver = isSeasonOver(session.state, this.ctx.config);
        if (seasonOver) {
            grid.put(infoCol, row, ROLE.header, t('dashboard.seasonOver'));
            row += 2;
            const standings = computeStandings(Object.keys(session.state.teams), session.state.fixtures);
            const champion = standings[0];
            if (champion) {
                grid.put(infoCol, row, ROLE.gold, t('dashboard.champion', { team: teamName(champion.teamId) }));
                row += 2;
            }
        } else {
            const next = nextUserFixture(session.state);
            if (next) {
                grid.put(infoCol, row, ROLE.header, t('dashboard.nextMatch'));
                grid.put(infoCol, row + 1, ROLE.text, `${t('common.round', { round: next.round })}: ${teamName(next.homeTeamId)} - ${teamName(next.awayTeamId)}`);
                row += 3;
            }
        }

        const lastRound = session.lastRound;
        if (lastRound) {
            grid.put(infoCol, row, ROLE.header, `${t('dashboard.lastResults')} (${t('common.round', { round: lastRound.round })})`);
            row++;
            for (const { fixture } of lastRound.results) {
                const isUserMatch =
                    fixture.homeTeamId === session.state.userTeamId || fixture.awayTeamId === session.state.userTeamId;
                grid.put(infoCol + 1, row, isUserMatch ? ROLE.accent : ROLE.text, fixtureLine(fixture));
                row++;
            }
        }
    }
}
