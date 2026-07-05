import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { advanceRoundInstant, isSeasonOver, nextUserFixture, prepareUserMatch } from '../../core/game';
import { computeStandings } from '../../core/league/standings';
import { buildPressContext, generatePressConference } from '../../core/press';
import { createRng } from '../../core/rng';
import { serializeSave } from '../../core/save/save';
import { t } from '../../i18n';
import { AUTOSAVE_KEY } from '../../services/storage';
import { drawChrome } from '../chrome';
import { fixtureLine, teamName } from '../format';
import { ROLE } from '../theme';
import { MenuList } from '../widgets/MenuList';
import { ClubScreen } from './ClubScreen';
import { FinancesScreen } from './FinancesScreen';
import { MarketScreen } from './MarketScreen';
import { MatchLiveScreen } from './MatchLiveScreen';
import { YouthIntakeScreen } from './YouthIntakeScreen';
import { PressConferenceScreen } from './PressConferenceScreen';
import { RosterScreen } from './RosterScreen';
import { SaveLoadScreen } from './SaveLoadScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { SettingsScreen } from './SettingsScreen';
import { StandingsScreen } from './StandingsScreen';
import { TrainingScreen } from './TrainingScreen';

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
                id: 'live',
                label: seasonOver ? t('dashboard.noMatch') : t('dashboard.playLive', { round: session.state.currentRound }),
                disabled: seasonOver,
            },
            { id: 'instant', label: t('dashboard.playInstant'), disabled: seasonOver },
            { id: 'roster', label: t('dashboard.roster') },
            { id: 'market', label: t('market.title') },
            {
                id: 'youth',
                label:
                    session.state.market.youthProspects.length > 0
                        ? `${t('youth.title')} (${session.state.market.youthProspects.length})`
                        : t('youth.title'),
            },
            { id: 'training', label: t('training.title') },
            { id: 'club', label: t('club.title') },
            { id: 'finances', label: t('finance.title') },
            { id: 'schedule', label: t('dashboard.schedule') },
            { id: 'standings', label: t('dashboard.standings') },
            { id: 'save', label: t('dashboard.save') },
            { id: 'load', label: t('dashboard.load') },
            { id: 'settings', label: t('dashboard.settings') },
        ];
    }

    private autosave(): void {
        const session = this.sessionOrThrow;
        this.ctx.storage.set(AUTOSAVE_KEY, serializeSave(session.state, t('save.autosave'), new Date().toISOString()));
    }

    private startLiveMatch(): void {
        const session = this.sessionOrThrow;
        const { fixture, engine } = prepareUserMatch(session.state, this.ctx.config);
        this.ctx.screens.push(new MatchLiveScreen(this.ctx, fixture, engine));
    }

    private playInstant(): void {
        const session = this.sessionOrThrow;
        const result = advanceRoundInstant(session.state, this.ctx.config);
        session.lastRound = result;
        this.autosave();
        // Press conference follows even an instant user match.
        const userFixture = result.results.find(
            (r) => r.fixture.homeTeamId === session.state.userTeamId || r.fixture.awayTeamId === session.state.userTeamId,
        );
        if (userFixture) {
            const context = buildPressContext(session.state, userFixture.summary, userFixture.fixture.homeTeamId, result.userInjuredId);
            const rng = createRng(session.state.masterSeed).fork(`press:${userFixture.fixture.id}`);
            const questions = generatePressConference(context, this.ctx.config.press, rng);
            if (questions.length > 0) {
                this.ctx.screens.push(new PressConferenceScreen(this.ctx, questions));
            }
        }
    }

    update(input: UiInputFrame): void {
        this.rebuildMenu();
        const action = this.menu.update(input, this.ctx.grid);
        switch (action) {
            case 'live':
                this.startLiveMatch();
                break;
            case 'instant':
                this.playInstant();
                break;
            case 'roster':
                this.ctx.screens.push(new RosterScreen(this.ctx));
                break;
            case 'market':
                this.ctx.screens.push(new MarketScreen(this.ctx));
                break;
            case 'youth':
                this.ctx.screens.push(new YouthIntakeScreen(this.ctx));
                break;
            case 'training':
                this.ctx.screens.push(new TrainingScreen(this.ctx));
                break;
            case 'club':
                this.ctx.screens.push(new ClubScreen(this.ctx));
                break;
            case 'finances':
                this.ctx.screens.push(new FinancesScreen(this.ctx));
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

        const infoCol = 40;
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
                const isHome = next.homeTeamId === session.state.userTeamId;
                grid.put(infoCol, row, ROLE.header, t('dashboard.nextMatch'));
                grid.put(infoCol, row + 1, ROLE.text, `${t('common.round', { round: next.round })}: ${teamName(next.homeTeamId)} - ${teamName(next.awayTeamId)}`);
                grid.put(infoCol, row + 2, isHome ? ROLE.success : ROLE.textDim, isHome ? t('dashboard.homeGame') : t('dashboard.awayGame'));
                row += 4;
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
            if (lastRound.economy) {
                row++;
                grid.put(infoCol, row, ROLE.header, t('dashboard.weekEconomy'));
                row++;
                const eco = lastRound.economy;
                const lines: Array<[string, number]> = [
                    [t('ledger.tickets'), eco.ticketIncome],
                    [t('ledger.sponsors'), eco.sponsorIncome],
                    [t('ledger.salaries'), -eco.salaries],
                    [t('ledger.maintenance'), -eco.maintenance],
                ];
                for (const [label, amount] of lines) {
                    if (amount !== 0) {
                        grid.put(infoCol + 1, row, amount >= 0 ? ROLE.success : ROLE.danger, `${label}: ${amount >= 0 ? '+' : ''}${Math.round(amount / 1000)}k`);
                        row++;
                    }
                }
            }
        }
    }
}
