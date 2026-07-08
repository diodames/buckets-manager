import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { advanceRoundInstant, ensurePlayoffs, isCampaignOver, isSeasonOver, nextUserFixture, prepareUserMatch, type RoundResult } from '../../core/game';
import { canStartNextSeason, completeOffseasonRollover, prepareOffseasonReview } from '../../core/season';
import { pendingExternalOffers } from '../../core/breakthrough';
import { userActiveSeries } from '../../core/playoffs';
import { buildPressContext, generatePressConference } from '../../core/press';
import { createRng } from '../../core/rng';
import { serializeSave } from '../../core/save/save';
import { projectSeasonCashflow } from '../../core/cashflow';
import { t } from '../../i18n';
import { AUTOSAVE_KEY } from '../../services/storage';
import { drawChrome, financeWarningMessage } from '../chrome';
import { competitionLabel, fixtureLine, teamDef, teamName } from '../format';
import { ROLE } from '../theme';
import { ConfirmDialog } from './ConfirmDialog';
import { ActionDialog } from './ActionDialog';
import { MenuList } from '../widgets/MenuList';
import { BclBracketScreen } from './BclBracketScreen';
import { BclScheduleScreen } from './BclScheduleScreen';
import { BclStandingsScreen } from './BclStandingsScreen';
import { BclValuationsScreen } from './BclValuationsScreen';
import { BoxScoreScreen } from './BoxScoreScreen';
import { ClubScreen } from './ClubScreen';
import { FinancesScreen } from './FinancesScreen';
import { LineupScreen } from './LineupScreen';
import { MarketScreen } from './MarketScreen';
import { MatchLiveScreen } from './MatchLiveScreen';
import { MainMenuScreen } from './MainMenuScreen';
import { OffseasonReviewScreen } from './OffseasonReviewScreen';
import { OffseasonScreen } from './OffseasonScreen';
import { ExternalOfferScreen } from './ExternalOfferScreen';
import { PlayoffsScreen } from './PlayoffsScreen';
import { PressConferenceScreen } from './PressConferenceScreen';
import { RosterScreen } from './RosterScreen';
import { SaveLoadScreen } from './SaveLoadScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { SettingsScreen } from './SettingsScreen';
import { SponsorChoiceScreen } from './SponsorChoiceScreen';
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
        const canContinue = canStartNextSeason(state, this.ctx.config);
        const userPlays = inPlayoffs ? userActiveSeries(state, this.ctx.config.league) !== null : !campaignOver;

        const playLabel = campaignOver
            ? canContinue
                ? t('dashboard.startNextSeason', { year: state.seasonYear + 1 })
                : t('dashboard.noMatch')
            : inPlayoffs
              ? t('playoff.playLive')
              : t('dashboard.playLive', { round: state.currentRound });
        const simLabel = inPlayoffs ? t('playoff.playInstant') : t('dashboard.playInstant');
        const prospects = state.market.youthProspects.length;
        const offers = state.market.incomingOffers.length + pendingExternalOffers(state).length;

        this.menu.items = [
            { id: 'live', label: playLabel, disabled: campaignOver && !canContinue || (!campaignOver && !userPlays) },
            { id: 'instant', label: simLabel, disabled: campaignOver && !canContinue },
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

    private startNextSeasonFlow(): void {
        const session = this.sessionOrThrow;
        const rng = createRng(session.state.masterSeed).fork(`next-season:${session.state.seasonYear}`);
        const review = prepareOffseasonReview(session.state, this.ctx.config, rng.fork('review'));
        session.lastRound = null;
        this.autosave();
        this.ctx.screens.push(new OffseasonReviewScreen(this.ctx, review, () => {
            const summary = completeOffseasonRollover(session.state, this.ctx.config, rng.fork('rollover'));
            this.autosave();
            this.ctx.screens.push(new OffseasonScreen(this.ctx, summary, () => {
                this.afterOffseasonSummary();
            }));
        }));
    }

    private afterOffseasonSummary(): void {
        const state = this.sessionOrThrow.state;
        const pending = pendingExternalOffers(state);
        if (pending.length > 0) {
            this.ctx.screens.push(new ExternalOfferScreen(this.ctx, () => {
                this.afterExternalOffers();
            }));
        } else {
            this.afterExternalOffers();
        }
    }

    private afterExternalOffers(): void {
        const state = this.sessionOrThrow.state;
        if (state.club.sponsors.length === 0 && state.club.sponsorOffers.length > 0) {
            this.ctx.screens.push(
                new SponsorChoiceScreen(this.ctx, () => {
                    this.rebuildMenu();
                }),
            );
        } else {
            this.rebuildMenu();
        }
    }

    private startLiveMatch(): void {
        const session = this.sessionOrThrow;
        if (canStartNextSeason(session.state, this.ctx.config) && isCampaignOver(session.state, this.ctx.config)) {
            this.startNextSeasonFlow();
            return;
        }
        const { fixture, engine } = prepareUserMatch(session.state, this.ctx.config);
        this.ctx.screens.push(new MatchLiveScreen(this.ctx, fixture, engine));
    }

    private playInstant(): void {
        const session = this.sessionOrThrow;
        if (canStartNextSeason(session.state, this.ctx.config) && isCampaignOver(session.state, this.ctx.config)) {
            this.startNextSeasonFlow();
            return;
        }
        const result = advanceRoundInstant(session.state, this.ctx.config);
        session.lastRound = result;
        this.autosave();
        // Press conference follows even an instant user match.
        const userFixture = result.results.find(
            (r) => r.fixture.homeTeamId === session.state.userTeamId || r.fixture.awayTeamId === session.state.userTeamId,
        );
        if (userFixture) {
            this.ctx.screens.push(
                new BoxScoreScreen(this.ctx, userFixture.fixture, userFixture.summary, () => {
                    const context = buildPressContext(
                        session.state,
                        userFixture.summary,
                        userFixture.fixture.homeTeamId,
                        result.userInjuredId,
                    );
                    const rng = createRng(session.state.masterSeed).fork(`press:${userFixture.fixture.id}`);
                    const questions = generatePressConference(context, this.ctx.config.press, rng);
                    if (questions.length > 0) {
                        this.ctx.screens.push(new PressConferenceScreen(this.ctx, questions));
                    }
                }),
            );
        }
    }

    private static readonly NBL_RESULTS_COL = 3;
    private static readonly BCL_RESULTS_COL = 40;
    private static readonly BCL_RESULTS_COL2 = 58;

    private renderFixtureResult(
        grid: AppContext['grid'],
        col: number,
        row: number,
        fixture: RoundResult['results'][number]['fixture'],
        userTeamId: string,
    ): void {
        const isUserMatch = fixture.homeTeamId === userTeamId || fixture.awayTeamId === userTeamId;
        grid.put(col, row, isUserMatch ? ROLE.accent : ROLE.text, fixtureLine(fixture));
    }

    /** Last-round scoreboard; splits NBL and BCL into two columns when both played. */
    private renderLastRoundResults(
        grid: AppContext['grid'],
        startRow: number,
        lastRound: RoundResult,
        userTeamId: string,
    ): number {
        const infoCol = DashboardScreen.BCL_RESULTS_COL;
        let row = startRow;

        if (lastRound.isPlayoff) {
            grid.put(infoCol, row, ROLE.header, t('dashboard.lastPlayoffResults'));
            row++;
            for (const { fixture } of lastRound.results) {
                this.renderFixtureResult(grid, infoCol + 1, row, fixture, userTeamId);
                row++;
            }
            return row;
        }

        const nblResults = lastRound.results.filter((r) => !r.fixture.competitionId || r.fixture.competitionId === 'nbl');
        const bclResults = lastRound.results.filter((r) => r.fixture.competitionId === 'bcl');
        const header = `${t('dashboard.lastResults')} (${t('common.round', { round: lastRound.round })})`;

        if (nblResults.length > 0 && bclResults.length > 0) {
            // NBL on the left below the menu; BCL on the right (two columns when busy).
            const resultsRow = Math.max(10, row);
            grid.put(DashboardScreen.NBL_RESULTS_COL, resultsRow, ROLE.header, header);
            grid.put(DashboardScreen.NBL_RESULTS_COL, resultsRow + 1, ROLE.textDim, competitionLabel('nbl'));
            grid.put(DashboardScreen.BCL_RESULTS_COL, resultsRow + 1, ROLE.textDim, t('bcl.title'));

            let nblRow = resultsRow + 2;
            for (const { fixture } of nblResults) {
                this.renderFixtureResult(grid, DashboardScreen.NBL_RESULTS_COL, nblRow, fixture, userTeamId);
                nblRow++;
            }

            const bclMid = Math.ceil(bclResults.length / 2);
            const bclLeft = bclResults.slice(0, bclMid);
            const bclRight = bclResults.slice(bclMid);
            let bclRow = resultsRow + 2;
            for (const { fixture } of bclLeft) {
                this.renderFixtureResult(grid, DashboardScreen.BCL_RESULTS_COL, bclRow, fixture, userTeamId);
                bclRow++;
            }
            let bclRow2 = resultsRow + 2;
            for (const { fixture } of bclRight) {
                this.renderFixtureResult(grid, DashboardScreen.BCL_RESULTS_COL2, bclRow2, fixture, userTeamId);
                bclRow2++;
            }
            return Math.max(nblRow, bclRow, bclRow2);
        }

        grid.put(infoCol, row, ROLE.header, header);
        row++;
        for (const { fixture } of lastRound.results) {
            this.renderFixtureResult(grid, infoCol + 1, row, fixture, userTeamId);
            row++;
        }
        return row;
    }

    private exitGame(): void {
        this.ctx.screens.push(
            new ConfirmDialog(this.ctx, t('dashboard.confirmExit'), (confirmed) => {
                if (confirmed) {
                    this.ctx.session = null;
                    this.ctx.screens.reset(new MainMenuScreen(this.ctx));
                }
            }),
        );
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
                    ...(pendingExternalOffers(state).length > 0 ? [{
                        id: 'external',
                        label: `${t('external.title')} (${pendingExternalOffers(state).length})`,
                    }] : []),
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
                    { id: 'bcl-valuations', label: t('bcl.valuations') },
                    ...(state.competitions.bcl ? [
                        { id: 'bcl-schedule', label: t('bcl.schedule') },
                        { id: 'bcl-standings', label: t('bcl.standings') },
                        { id: 'bcl-bracket', label: t('bcl.bracket') },
                    ] : []),
                ],
            },
            system: {
                title: t('dashboard.groupSystem'),
                items: [
                    { id: 'save', label: t('dashboard.save') },
                    { id: 'load', label: t('dashboard.load') },
                    { id: 'settings', label: t('dashboard.settings') },
                    { id: 'exit', label: t('dashboard.exit') },
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
                    if (action === 'exit') {
                        this.exitGame();
                    } else {
                        this.openScreen(action);
                    }
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
            case 'external':
                this.ctx.screens.push(new ExternalOfferScreen(this.ctx, () => {
                    this.rebuildMenu();
                }));
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
            case 'bcl-valuations':
                this.ctx.screens.push(new BclValuationsScreen(this.ctx));
                break;
            case 'bcl-schedule':
                this.ctx.screens.push(new BclScheduleScreen(this.ctx));
                break;
            case 'bcl-standings':
                this.ctx.screens.push(new BclStandingsScreen(this.ctx));
                break;
            case 'bcl-bracket':
                this.ctx.screens.push(new BclBracketScreen(this.ctx));
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
            if (canStartNextSeason(state, this.ctx.config)) {
                grid.put(infoCol, row + 2, ROLE.accent, t('dashboard.startNextSeason', { year: state.seasonYear + 1 }));
                row += 4;
            } else {
                row += 3;
            }
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
            const next = nextUserFixture(state, this.ctx.config);
            if (next) {
                const isHome = next.homeTeamId === state.userTeamId;
                const comp = next.competitionId === 'bcl' ? t('dashboard.bclMatch') : t('dashboard.nblMatch');
                grid.put(infoCol, row, ROLE.header, comp);
                grid.put(infoCol, row + 1, ROLE.text,
                    `${competitionLabel(next.competitionId)} ${t('common.round', { round: next.week ?? next.round })}: ${teamName(next.homeTeamId)} - ${teamName(next.awayTeamId)}`);
                grid.put(infoCol, row + 2, isHome ? ROLE.success : ROLE.textDim, isHome ? t('dashboard.homeGame') : t('dashboard.awayGame'));
                if (state.bclQualified) {
                    grid.put(infoCol, row + 3, ROLE.gold, 'BCL');
                    row += 5;
                } else {
                    row += 4;
                }
            }
        }

        // Market attention: incoming offers waiting in the transfer inbox.
        const externalCount = pendingExternalOffers(state).length;
        if (state.market.incomingOffers.length > 0 || externalCount > 0) {
            const total = state.market.incomingOffers.length + externalCount;
            grid.put(infoCol, row, ROLE.gold, t('dashboard.offersWaiting', { n: total }));
            row += 2;
        }

        const financeWarning = financeWarningMessage(state, this.ctx);
        if (financeWarning) {
            const projection = projectSeasonCashflow(state, this.ctx.config.economy, this.ctx.config.league);
            grid.put(infoCol, row, projection.warningTier === 'red' ? ROLE.danger : ROLE.warning, financeWarning);
            row += 2;
        }

        const lastRound = session.lastRound;
        if (lastRound) {
            row = this.renderLastRoundResults(grid, row, lastRound, state.userTeamId);
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
