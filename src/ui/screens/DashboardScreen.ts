import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { advanceRoundInstant, ensurePlayoffs, isCampaignOver, isSeasonOver, nextUserFixture, prepareUserMatch } from '../../core/game';
import { userActiveSeries } from '../../core/playoffs';
import { buildPressContext, generatePressConference } from '../../core/press';
import { createRng } from '../../core/rng';
import { serializeSave } from '../../core/save/save';
import { t } from '../../i18n';
import { AUTOSAVE_KEY } from '../../services/storage';
import { drawChrome } from '../chrome';
import { fixtureLine, teamDef, teamName } from '../format';
import { ROLE } from '../theme';
import { ActionDialog } from './ActionDialog';
import { MenuList } from '../widgets/MenuList';
import { ClubScreen } from './ClubScreen';
import { FinancesScreen } from './FinancesScreen';
import { LineupScreen } from './LineupScreen';
import { MarketScreen } from './MarketScreen';
import { MatchLiveScreen } from './MatchLiveScreen';
import { PlayoffsScreen } from './PlayoffsScreen';
import { PressConferenceScreen } from './PressConferenceScreen';
import { RosterScreen } from './RosterScreen';
import { SaveLoadScreen } from './SaveLoadScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { SettingsScreen } from './SettingsScreen';
import { StandingsScreen } from './StandingsScreen';
import { TrainingScreen } from './TrainingScreen';
import { YouthIntakeScreen } from './YouthIntakeScreen';

export class DashboardScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly menu: MenuList;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.menu = new MenuList([], { col: 3, row: 4, width: 32 });
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
        const state = session.state;
        const inPlayoffs = isSeasonOver(state, this.ctx.config);
        const campaignOver = isCampaignOver(state, this.ctx.config);
        const userPlays = inPlayoffs ? userActiveSeries(state, this.ctx.config.league) !== null : !campaignOver;

        const playLabel = campaignOver
            ? t('dashboard.noMatch')
            : inPlayoffs
              ? t('playoff.playLive')
              : t('dashboard.playLive', { round: state.currentRound });
        const simLabel = inPlayoffs ? t('playoff.playInstant') : t('dashboard.playInstant');
        const prospects = state.market.youthProspects.length;
        const offers = state.market.incomingOffers.length;

        this.menu.items = [
            { id: 'live', label: playLabel, disabled: campaignOver || !userPlays },
            { id: 'instant', label: simLabel, disabled: campaignOver },
            { id: 'team', label: `${t('dashboard.groupTeam')}${prospects > 0 ? ` (${prospects})` : ''}` },
            { id: 'office', label: `${t('dashboard.groupOffice')}${offers > 0 ? ` (${offers})` : ''}` },
            { id: 'league', label: t('dashboard.groupLeague') },
            { id: 'system', label: t('dashboard.groupSystem') },
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

    private openGroup(id: string): void {
        const session = this.sessionOrThrow;
        const state = session.state;
        const groups: Record<string, { title: string; items: Array<{ id: string; label: string }> }> = {
            team: {
                title: t('dashboard.groupTeam'),
                items: [
                    { id: 'roster', label: t('dashboard.roster') },
                    { id: 'lineup', label: t('lineup.title') },
                    { id: 'training', label: t('training.title') },
                    {
                        id: 'youth',
                        label: state.market.youthProspects.length > 0 ? `${t('youth.title')} (${state.market.youthProspects.length})` : t('youth.title'),
                    },
                ],
            },
            office: {
                title: t('dashboard.groupOffice'),
                items: [
                    {
                        id: 'market',
                        label: state.market.incomingOffers.length > 0 ? `${t('market.title')} (${state.market.incomingOffers.length})` : t('market.title'),
                    },
                    { id: 'club', label: t('club.title') },
                    { id: 'finances', label: t('finance.title') },
                ],
            },
            league: {
                title: t('dashboard.groupLeague'),
                items: [
                    { id: 'schedule', label: t('dashboard.schedule') },
                    { id: 'standings', label: t('dashboard.standings') },
                    ...(state.playoffs ? [{ id: 'playoffs', label: t('playoff.title') }] : []),
                ],
            },
            system: {
                title: t('dashboard.groupSystem'),
                items: [
                    { id: 'save', label: t('dashboard.save') },
                    { id: 'load', label: t('dashboard.load') },
                    { id: 'settings', label: t('dashboard.settings') },
                ],
            },
        };
        const group = groups[id];
        if (!group) {
            return;
        }
        this.ctx.screens.push(
            new ActionDialog(this.ctx, group.title, [...group.items, { id: 'close', label: t('common.back') }], (action) => {
                if (action && action !== 'close') {
                    this.openScreen(action);
                }
            }),
        );
    }

    private openScreen(id: string): void {
        switch (id) {
            case 'roster':
                this.ctx.screens.push(new RosterScreen(this.ctx));
                break;
            case 'lineup':
                this.ctx.screens.push(new LineupScreen(this.ctx));
                break;
            case 'training':
                this.ctx.screens.push(new TrainingScreen(this.ctx));
                break;
            case 'youth':
                this.ctx.screens.push(new YouthIntakeScreen(this.ctx));
                break;
            case 'market':
                this.ctx.screens.push(new MarketScreen(this.ctx));
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
            case 'playoffs':
                this.ctx.screens.push(new PlayoffsScreen(this.ctx));
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

    update(input: UiInputFrame): void {
        const session = this.sessionOrThrow;
        ensurePlayoffs(session.state, this.ctx.config);
        this.rebuildMenu();
        const action = this.menu.update(input, this.ctx.grid);
        switch (action) {
            case 'live':
                this.startLiveMatch();
                break;
            case 'instant':
                this.playInstant();
                break;
            case 'team':
            case 'office':
            case 'league':
            case 'system':
                this.openGroup(action);
                break;
            default:
                break;
        }
    }

    render(): void {
        this.rebuildMenu();
        const session = this.sessionOrThrow;
        const state = session.state;
        const grid = this.ctx.grid;
        drawChrome(this.ctx, t('dashboard.title'), [t('hint.navigate'), t('hint.select')]);
        this.menu.render(grid);

        const infoCol = 40;
        let row = 4;
        const inPlayoffs = isSeasonOver(state, this.ctx.config);
        const campaignOver = isCampaignOver(state, this.ctx.config);

        if (campaignOver && state.playoffs?.championTeamId) {
            grid.put(infoCol, row, ROLE.header, t('dashboard.seasonOver'));
            grid.put(infoCol, row + 1, ROLE.gold, t('playoff.champion', { team: teamName(state.playoffs.championTeamId) }));
            row += 3;
        } else if (inPlayoffs) {
            grid.put(infoCol, row, ROLE.header, t(`playoff.stage.${state.playoffs?.stage ?? 0}` as Parameters<typeof t>[0]));
            const series = userActiveSeries(state, this.ctx.config.league);
            if (series) {
                grid.put(infoCol, row + 1, ROLE.text,
                    `${teamDef(series.homeTeamId).abbr} ${series.homeWins}:${series.awayWins} ${teamDef(series.awayTeamId).abbr}`);
                const next = nextUserFixture(state, this.ctx.config);
                if (next) {
                    const isHome = next.homeTeamId === state.userTeamId;
                    grid.put(infoCol, row + 2, isHome ? ROLE.success : ROLE.textDim, isHome ? t('dashboard.homeGame') : t('dashboard.awayGame'));
                }
            } else {
                grid.put(infoCol, row + 1, ROLE.danger, t('playoff.eliminated'));
            }
            row += 4;
        } else {
            const next = nextUserFixture(state);
            if (next) {
                const isHome = next.homeTeamId === state.userTeamId;
                grid.put(infoCol, row, ROLE.header, t('dashboard.nextMatch'));
                grid.put(infoCol, row + 1, ROLE.text, `${t('common.round', { round: next.round })}: ${teamName(next.homeTeamId)} - ${teamName(next.awayTeamId)}`);
                grid.put(infoCol, row + 2, isHome ? ROLE.success : ROLE.textDim, isHome ? t('dashboard.homeGame') : t('dashboard.awayGame'));
                row += 4;
            }
        }

        // Market attention: incoming offers waiting in the transfer inbox.
        if (state.market.incomingOffers.length > 0) {
            grid.put(infoCol, row, ROLE.gold, t('dashboard.offersWaiting', { n: state.market.incomingOffers.length }));
            row += 2;
        }

        const lastRound = session.lastRound;
        if (lastRound) {
            grid.put(infoCol, row, ROLE.header,
                lastRound.isPlayoff ? t('dashboard.lastPlayoffResults') : `${t('dashboard.lastResults')} (${t('common.round', { round: lastRound.round })})`);
            row++;
            for (const { fixture } of lastRound.results) {
                const isUserMatch = fixture.homeTeamId === state.userTeamId || fixture.awayTeamId === state.userTeamId;
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
