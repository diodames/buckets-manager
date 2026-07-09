import type { AppContext, Screen } from '../../app/Screen';
import type { GameState } from '../../core/model/types';
import type { Fixture } from '../../core/model/types';
import type { UiInputFrame } from '../../app/UiInput';
import { advanceRoundInstant, campaignPhase, ensurePlayoffs, isCampaignOver, isEuropeanCalendarComplete, isSeasonOver, nextUserFixture, prepareUserMatch, upcomingUserFixtures, type RoundResult } from '../../core/game';
import { pendingBclFixtures, userBclSeries } from '../../core/bcl/index';
import { pendingFecFixtures, userFecSeries } from '../../core/fec/index';
import { canStartNextSeason, completeOffseasonRollover, prepareOffseasonReview } from '../../core/season';
import { pendingExternalOffers } from '../../core/breakthrough';
import { userActiveSeries } from '../../core/playoffs';
import { buildPressContext, generatePressConference } from '../../core/press';
import { buildNewsItems, type NewsItem } from '../../core/news';
import { createRng } from '../../core/rng';
import { serializeSave } from '../../core/save/save';
import { projectSeasonCashflow } from '../../core/cashflow';
import { nextContextualHint } from '../../core/contextualHints';
import { isFreeAgentMarketOpen, isFullTransferMarketOpen } from '../../core/market';
import { facilityProjectRoundsLeft } from '../../core/economy';
import { formatMoney } from '../format';
import { ContextualHintScreen } from './ContextualHintScreen';
import { t, type TranslationKey } from '../../i18n';
import { AUTOSAVE_KEY } from '../../services/storage';
import { drawChrome, drawChromeFooter } from '../chrome';
import { competitionLabel, fixtureLine, teamDef, teamName } from '../format';
import {
    activeResultGroups,
    groupResultsByCompetition,
    isUserFixture,
    resultColumnStarts,
    truncateResultList,
} from '../dashboardResults';
import { ROLE } from '../theme';
import { ConfirmDialog } from './ConfirmDialog';
import { ActionDialog } from './ActionDialog';
import { MenuList } from '../widgets/MenuList';
import { BclBracketScreen } from './BclBracketScreen';
import { BclScheduleScreen } from './BclScheduleScreen';
import { BclStandingsScreen } from './BclStandingsScreen';
import { BclValuationsScreen } from './BclValuationsScreen';
import { FecBracketScreen } from './FecBracketScreen';
import { FecScheduleScreen } from './FecScheduleScreen';
import { FecStandingsScreen } from './FecStandingsScreen';
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
import { drawTeamCrest } from '../crests';

export class DashboardScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly menu: MenuList;
    private readonly newsMenu: MenuList;
    private newsItems: NewsItem[] = [];
    private newsSelected = false;

    constructor(ctx: AppContext) {
        this.ctx = ctx;
        this.menu = new MenuList([], { col: 3, row: 4, width: 32 });
        this.newsMenu = new MenuList([], { col: 40, row: 5, width: 28 });
    }

    onEnter(): void {
        this.rebuildMenu();
        this.rebuildNews();
        this.maybeShowContextualHint();
    }

    private maybeShowContextualHint(): void {
        const state = this.sessionOrThrow.state;
        const hint = nextContextualHint(state, this.ctx.config.market, this.ctx.config.economy, this.ctx.config.league);
        if (!hint) {
            return;
        }
        this.ctx.screens.push(new ContextualHintScreen(this.ctx, hint, () => {
            this.rebuildMenu();
        }));
    }

    private rebuildNews(): void {
        const state = this.sessionOrThrow.state;
        this.newsItems = buildNewsItems(state, this.ctx.config.economy, this.ctx.config.league, this.ctx.config.market);
        this.newsMenu.items = this.newsItems.map((item, i) => ({
            id: String(i),
            label: t(item.labelKey as Parameters<typeof t>[0]),
        }));
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
        const inPlayoffs = isSeasonOver(state, this.ctx.config) && isEuropeanCalendarComplete(state, this.ctx.config) && state.playoffs !== null;
        const inEuropeanPhase = campaignPhase(state, this.ctx.config) === 'europe';
        const campaignOver = isCampaignOver(state, this.ctx.config);
        const canContinue = canStartNextSeason(state, this.ctx.config);
        const userPlays = campaignOver
            ? canContinue
            : inEuropeanPhase
              ? true
              : inPlayoffs
                ? userActiveSeries(state, this.ctx.config.league) !== null
                : !campaignOver;

        const playLabel = campaignOver
            ? canContinue
                ? t('dashboard.startNextSeason', { year: state.seasonYear + 1 })
                : t('dashboard.noMatch')
            : inEuropeanPhase
              ? t('dashboard.playEuropean')
              : inPlayoffs
                ? t('playoff.playLive')
                : t('dashboard.playLive', { round: state.currentRound });
        const simLabel = inEuropeanPhase
            ? t('dashboard.simEuropean')
            : inPlayoffs
              ? t('playoff.playInstant')
              : t('dashboard.playInstant');
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
                    const questions = generatePressConference(context, this.ctx.config.press, rng, session.state);
                    if (questions.length > 0) {
                        this.ctx.screens.push(new PressConferenceScreen(this.ctx, questions));
                    }
                }),
            );
        }
    }

    private static readonly NBL_RESULTS_COL = 3;
    private static readonly INFO_COL = 40;
    /** First row for the left-column results block (one blank row below the main menu). */
    private static readonly RESULTS_START_ROW = 10;
    private static readonly INBOX_HEADER_ROW = 3;
    private static readonly INBOX_HINT_ROW = 4;
    private static readonly INBOX_ITEM_ROW = 5;

    private maxContentRow(grid: AppContext['grid']): number {
        return grid.rows - 2;
    }

    /** Left-column anchor for last-round results; independent of right-panel height. */
    private leftResultsRow(): number {
        return Math.max(
            DashboardScreen.RESULTS_START_ROW,
            this.menu.layoutRow + this.menu.items.length + 1,
        );
    }

    private clearLeftResultsBand(grid: AppContext['grid'], resultsRow: number): void {
        const height = this.maxContentRow(grid) - resultsRow;
        if (height <= 0) {
            return;
        }
        grid.fillCells(
            DashboardScreen.NBL_RESULTS_COL,
            resultsRow,
            DashboardScreen.INFO_COL - DashboardScreen.NBL_RESULTS_COL,
            height,
            ROLE.bg,
        );
    }

    /** Writes one info-panel line when vertical space remains; returns the next row. */
    private putInfoLine(
        grid: AppContext['grid'],
        col: number,
        row: number,
        color: number,
        text: string,
    ): number {
        if (row >= this.maxContentRow(grid)) {
            return row;
        }
        grid.put(col, row, color, text);
        return row + 1;
    }

    private renderFixtureResult(
        grid: AppContext['grid'],
        col: number,
        row: number,
        fixture: RoundResult['results'][number]['fixture'],
        userTeamId: string,
        prefix?: string,
    ): void {
        const isUserMatch = isUserFixture(fixture, userTeamId);
        const line = prefix ? `${prefix} ${fixtureLine(fixture)}` : fixtureLine(fixture);
        grid.put(col, row, isUserMatch ? ROLE.accent : ROLE.text, line);
    }

    private renderResultColumn(
        grid: AppContext['grid'],
        col: number,
        startRow: number,
        label: string,
        results: RoundResult['results'],
        userTeamId: string,
        maxVisible: number,
        maxRow: number,
        prefixLines = false,
    ): number {
        if (startRow >= maxRow) {
            return startRow;
        }
        grid.put(col, startRow, ROLE.textDim, label);
        const { visible, hidden } = truncateResultList(results, maxVisible);
        let row = startRow + 1;
        for (const { fixture } of visible) {
            if (row >= maxRow) {
                break;
            }
            const prefix = prefixLines ? competitionLabel(fixture.competitionId) : undefined;
            this.renderFixtureResult(grid, col, row, fixture, userTeamId, prefix);
            row++;
        }
        if (hidden > 0 && row < maxRow) {
            grid.put(col, row, ROLE.textDim, t('dashboard.resultsMore', { n: hidden }));
            row++;
        }
        return row;
    }

    /** Last-round scoreboard on the left; does not advance the right-panel row cursor. */
    private renderLastRoundResults(
        grid: AppContext['grid'],
        rightPanelRow: number,
        lastRound: RoundResult,
        userTeamId: string,
    ): number {
        const infoCol = DashboardScreen.INFO_COL;
        const maxRow = this.maxContentRow(grid);

        if (lastRound.isPlayoff) {
            let row = rightPanelRow;
            row = this.putInfoLine(grid, infoCol, row, ROLE.header, t('dashboard.lastPlayoffResults'));
            for (const { fixture } of lastRound.results) {
                if (row >= maxRow) {
                    break;
                }
                this.renderFixtureResult(grid, infoCol + 1, row, fixture, userTeamId);
                row++;
            }
            return row;
        }

        const grouped = groupResultsByCompetition(lastRound.results);
        const activeGroups = activeResultGroups(grouped);
        const header = `${t('dashboard.lastResults')} (${t('common.round', { round: lastRound.round })})`;
        const resultsRow = this.leftResultsRow();
        if (resultsRow >= maxRow) {
            return rightPanelRow;
        }
        this.clearLeftResultsBand(grid, resultsRow);
        const maxVisible = Math.max(2, maxRow - resultsRow - 1);
        const columns = resultColumnStarts(DashboardScreen.NBL_RESULTS_COL, infoCol, activeGroups);

        grid.put(DashboardScreen.NBL_RESULTS_COL, resultsRow, ROLE.header, header);
        if (activeGroups.length > 1) {
            const groupLabel = (group: (typeof activeGroups)[number]) =>
                group === 'nbl' ? competitionLabel('nbl') : group === 'bcl' ? t('bcl.title') : t('fec.title');

            if (columns === null) {
                let row = resultsRow + 1;
                for (const group of activeGroups) {
                    if (row >= maxRow) {
                        break;
                    }
                    row = this.renderResultColumn(
                        grid,
                        DashboardScreen.NBL_RESULTS_COL,
                        row,
                        groupLabel(group),
                        grouped[group],
                        userTeamId,
                        Math.max(2, maxRow - row),
                        maxRow,
                    );
                }
                return rightPanelRow;
            }

            activeGroups.forEach((group, index) => {
                const col = columns[index] ?? DashboardScreen.NBL_RESULTS_COL;
                this.renderResultColumn(
                    grid,
                    col,
                    resultsRow + 1,
                    groupLabel(group),
                    grouped[group],
                    userTeamId,
                    maxVisible,
                    maxRow,
                );
            });
            return rightPanelRow;
        }

        const label = competitionLabel(lastRound.results[0]?.fixture.competitionId);
        this.renderResultColumn(
            grid,
            DashboardScreen.NBL_RESULTS_COL,
            resultsRow + 1,
            label,
            lastRound.results,
            userTeamId,
            maxVisible,
            maxRow,
        );
        return rightPanelRow;
    }

    private renderWeekEconomy(
        grid: AppContext['grid'],
        infoCol: number,
        row: number,
        economy: NonNullable<RoundResult['economy']>,
    ): number {
        const maxRow = this.maxContentRow(grid);
        if (row >= maxRow) {
            return row;
        }
        row = this.putInfoLine(grid, infoCol, row, ROLE.header, t('dashboard.weekEconomy'));
        const lines: Array<[string, number]> = [
            [t('ledger.tickets'), economy.ticketIncome],
            [t('ledger.sponsors'), economy.sponsorIncome],
            [t('ledger.salaries'), -economy.salaries],
            [t('ledger.maintenance'), -economy.maintenance],
        ];
        for (const [label, amount] of lines) {
            if (amount === 0 || row >= maxRow) {
                continue;
            }
            grid.put(
                infoCol + 1,
                row,
                amount >= 0 ? ROLE.success : ROLE.danger,
                `${label}: ${amount >= 0 ? '+' : ''}${Math.round(amount / 1000)}k`,
            );
            row++;
        }
        return row;
    }

    private renderUpcomingFixture(
        grid: AppContext['grid'],
        col: number,
        row: number,
        fixture: Fixture,
        userTeamId: string,
    ): number {
        const isHome = fixture.homeTeamId === userTeamId;
        grid.put(
            col,
            row,
            ROLE.text,
            t('dashboard.upcomingLine', {
                comp: competitionLabel(fixture.competitionId),
                round: fixture.week ?? fixture.round,
                home: teamName(fixture.homeTeamId),
                away: teamName(fixture.awayTeamId),
                venue: isHome ? t('dashboard.homeGame') : t('dashboard.awayGame'),
            }),
        );
        return row + 1;
    }

    private europeanCompetitionStatus(
        comp: 'bcl' | 'fec',
        phase: string | undefined,
        userActive: boolean,
    ): string {
        if (!phase) {
            return '';
        }
        const phaseKey = `${comp}.phase.${phase}` as TranslationKey;
        let phaseLabel: string;
        try {
            phaseLabel = t(phaseKey);
        } catch {
            phaseLabel = phase;
        }
        const status = phase === 'complete'
            ? t('dashboard.europeanComplete')
            : userActive
              ? t('dashboard.europeanActive')
              : t('dashboard.europeanEliminated');
        return t('dashboard.europeanStatus', {
            comp: competitionLabel(comp),
            phase: phaseLabel,
            status,
        });
    }

    private renderEuropeanPhasePanel(
        grid: AppContext['grid'],
        col: number,
        startRow: number,
        state: NonNullable<AppContext['session']>['state'],
    ): number {
        let row = startRow;
        grid.put(col, row, ROLE.header, t('dashboard.europeanPhase'));
        row++;
        grid.put(col, row, ROLE.textDim, t('dashboard.europeanPhaseHint'));
        row++;

        const bcl = state.competitions.bcl;
        if (bcl && state.bclQualified) {
            const userActive = userBclSeries(state, this.ctx.config.bcl) !== null
                || pendingBclFixtures(state, state.calendarWeek).some(
                    (f) => f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId,
                );
            const line = this.europeanCompetitionStatus('bcl', bcl.phase, userActive);
            if (line) {
                grid.put(col, row, ROLE.text, line);
                row++;
            }
        }

        const fec = state.competitions.fec;
        if (fec && state.fecQualified) {
            const userActive = userFecSeries(state, this.ctx.config.fec) !== null
                || pendingFecFixtures(state, state.calendarWeek).some(
                    (f) => f.homeTeamId === state.userTeamId || f.awayTeamId === state.userTeamId,
                );
            const line = this.europeanCompetitionStatus('fec', fec.phase, userActive);
            if (line) {
                grid.put(col, row, ROLE.text, line);
                row++;
            }
        }

        const europeanFixtures = upcomingUserFixtures(state, this.ctx.config, 2).filter(
            (f) => f.competitionId === 'bcl' || f.competitionId === 'fec',
        );
        for (const fixture of europeanFixtures) {
            row = this.renderUpcomingFixture(grid, col, row, fixture, state.userTeamId);
        }
        return row + 1;
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

    private openNblGroup(): void {
        const state = this.sessionOrThrow.state;
        this.ctx.screens.push(
            new ActionDialog(
                this.ctx,
                t('dashboard.groupNbl'),
                [
                    { id: 'schedule', label: t('dashboard.schedule') },
                    { id: 'standings', label: t('dashboard.standings') },
                    ...(state.playoffs ? [{ id: 'playoffs', label: t('playoff.title') }] : []),
                    { id: 'close', label: t('common.back') },
                ],
                (action) => {
                    if (action && action !== 'close') {
                        this.openScreen(action);
                    }
                },
            ),
        );
    }

    private openEuropeGroup(): void {
        const state = this.sessionOrThrow.state;
        this.ctx.screens.push(
            new ActionDialog(
                this.ctx,
                t('dashboard.groupEurope'),
                [
                    ...(state.competitions.bcl ? [
                        { id: 'bcl-schedule', label: t('bcl.schedule') },
                        { id: 'bcl-standings', label: t('bcl.standings') },
                        { id: 'bcl-bracket', label: t('bcl.bracket') },
                    ] : []),
                    ...(state.competitions.fec ? [
                        { id: 'fec-schedule', label: t('fec.schedule') },
                        { id: 'fec-standings', label: t('fec.standings') },
                        { id: 'fec-bracket', label: t('fec.bracket') },
                    ] : []),
                    { id: 'bcl-valuations', label: t('bcl.valuations') },
                    { id: 'close', label: t('common.back') },
                ],
                (action) => {
                    if (action && action !== 'close') {
                        this.openScreen(action);
                    }
                },
            ),
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
                    { id: 'league-nbl', label: t('dashboard.groupNbl') },
                    { id: 'league-europe', label: t('dashboard.groupEurope') },
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
                    } else if (action === 'league-nbl') {
                        this.openNblGroup();
                    } else if (action === 'league-europe') {
                        this.openEuropeGroup();
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
            case 'fec-schedule':
                this.ctx.screens.push(new FecScheduleScreen(this.ctx));
                break;
            case 'fec-standings':
                this.ctx.screens.push(new FecStandingsScreen(this.ctx));
                break;
            case 'fec-bracket':
                this.ctx.screens.push(new FecBracketScreen(this.ctx));
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

    private openNewsItem(index: number): void {
        const item = this.newsItems[index];
        if (!item) {
            return;
        }
        switch (item.action) {
            case 'roster':
                this.openScreen('roster');
                break;
            case 'market':
                this.openScreen('market');
                break;
            case 'finances':
                this.openScreen('finances');
                break;
            case 'externalOffer':
                this.openScreen('external');
                break;
            case 'youthIntake':
                this.openScreen('youth');
                break;
            default:
                break;
        }
    }

    update(input: UiInputFrame): void {
        const session = this.sessionOrThrow;
        ensurePlayoffs(session.state, this.ctx.config);
        this.rebuildMenu();
        this.rebuildNews();
        if (input.inbox) {
            this.newsSelected = !this.newsSelected;
        }
        if (this.newsItems.length > 0) {
            const picked = this.newsSelected
                ? this.newsMenu.update(input, this.ctx.grid)
                : this.newsMenu.tryClick(input, this.ctx.grid);
            if (picked !== null) {
                this.openNewsItem(Number(picked));
            }
            if (this.newsSelected) {
                return;
            }
        }
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
        const infoCol = DashboardScreen.INFO_COL;
        const footerHints = [t('hint.navigate'), t('hint.select'), 'I: inbox'];
        drawChrome(this.ctx, t('dashboard.title'), footerHints);
        drawTeamCrest(grid, state.userTeamId, 36, 2);
        this.menu.render(grid);

        this.rebuildNews();
        const statusLineCount = this.countOverviewStatusLines(state);
        const overviewHeight = 1
            + (this.newsItems.length > 0 ? 1 + this.newsItems.length : 0)
            + statusLineCount;
        grid.fillCells(
            infoCol,
            DashboardScreen.INBOX_HEADER_ROW,
            grid.cols - infoCol,
            overviewHeight,
            ROLE.bg,
        );
        grid.put(infoCol, DashboardScreen.INBOX_HEADER_ROW, ROLE.header, t('news.title'));
        if (this.newsItems.length > 0) {
            grid.put(
                infoCol,
                DashboardScreen.INBOX_HINT_ROW,
                ROLE.textDim,
                t(this.newsSelected ? 'news.hint' : 'news.focusHint'),
            );
            this.newsMenu.setRow(DashboardScreen.INBOX_ITEM_ROW);
            this.newsMenu.render(grid, this.newsSelected);
        }

        let row = this.newsItems.length > 0
            ? DashboardScreen.INBOX_ITEM_ROW + this.newsItems.length
            : DashboardScreen.INBOX_HEADER_ROW + 1;
        row = this.renderOverviewStatus(grid, infoCol, row, state);
        row++;
        const inPlayoffs = isSeasonOver(state, this.ctx.config) && isEuropeanCalendarComplete(state, this.ctx.config) && state.playoffs !== null;
        const inEuropeanPhase = campaignPhase(state, this.ctx.config) === 'europe';
        const campaignOver = isCampaignOver(state, this.ctx.config);

        if (campaignOver && state.playoffs?.championTeamId) {
            row = this.putInfoLine(grid, infoCol, row, ROLE.header, t('dashboard.seasonOver'));
            row = this.putInfoLine(
                grid,
                infoCol,
                row,
                ROLE.gold,
                t('playoff.champion', { team: teamName(state.playoffs.championTeamId) }),
            );
            if (canStartNextSeason(state, this.ctx.config)) {
                row = this.putInfoLine(grid, infoCol, row, ROLE.accent, t('dashboard.startNextSeason', { year: state.seasonYear + 1 }));
                row++;
            } else {
                row++;
            }
        } else if (inEuropeanPhase) {
            row = this.renderEuropeanPhasePanel(grid, infoCol, row, state);
        } else if (inPlayoffs) {
            row = this.putInfoLine(grid, infoCol, row, ROLE.header, t(`playoff.stage.${state.playoffs?.stage ?? 0}` as Parameters<typeof t>[0]));
            const series = userActiveSeries(state, this.ctx.config.league);
            if (series) {
                row = this.putInfoLine(
                    grid,
                    infoCol,
                    row,
                    ROLE.text,
                    `${teamDef(series.homeTeamId).abbr} ${series.homeWins}:${series.awayWins} ${teamDef(series.awayTeamId).abbr}`,
                );
                const next = nextUserFixture(state, this.ctx.config);
                if (next) {
                    const isHome = next.homeTeamId === state.userTeamId;
                    row = this.putInfoLine(
                        grid,
                        infoCol,
                        row,
                        isHome ? ROLE.success : ROLE.textDim,
                        isHome ? t('dashboard.homeGame') : t('dashboard.awayGame'),
                    );
                }
            } else {
                row = this.putInfoLine(grid, infoCol, row, ROLE.danger, t('playoff.eliminated'));
            }
            row++;
        } else {
            const upcoming = upcomingUserFixtures(state, this.ctx.config, 3);
            if (upcoming.length > 0) {
                row = this.putInfoLine(grid, infoCol, row, ROLE.header, t('dashboard.nextMatch'));
                for (const fixture of upcoming) {
                    if (row >= this.maxContentRow(grid)) {
                        break;
                    }
                    row = this.renderUpcomingFixture(grid, infoCol, row, fixture, state.userTeamId);
                }
                row++;
            }
        }

        const lastRound = session.lastRound;
        if (lastRound) {
            row = this.renderLastRoundResults(grid, row, lastRound, state.userTeamId);
            if (lastRound.economy) {
                row++;
                row = this.renderWeekEconomy(grid, infoCol, row, lastRound.economy);
            }
        }

        if (state.careerHistory.length > 0 || (state.careerMilestones?.seasonsCompleted ?? 0) > 0) {
            if (row < this.maxContentRow(grid)) {
                row++;
                row = this.putInfoLine(grid, infoCol, row, ROLE.header, t('career.title'));
                const m = state.careerMilestones;
                if (m && m.seasonsCompleted > 0) {
                    row = this.putInfoLine(
                        grid,
                        infoCol,
                        row,
                        ROLE.textDim,
                        t('dashboard.milestones', {
                            titles: m.championships,
                            playoffs: m.playoffAppearances,
                            bcl: m.bclTitles,
                        }),
                    );
                }
                for (const entry of state.careerHistory.slice(-3)) {
                    if (row >= this.maxContentRow(grid)) {
                        break;
                    }
                    row = this.putInfoLine(
                        grid,
                        infoCol,
                        row,
                        ROLE.textDim,
                        t('career.seasonLine', {
                            year: entry.seasonYear,
                            rank: entry.nblLeagueRank ?? '-',
                            finish: entry.nblFinish,
                        }),
                    );
                }
            }
        }

        drawChromeFooter(grid, footerHints);
    }

    private countOverviewStatusLines(state: GameState): number {
        let count = 2;
        if (state.boardObjective) {
            count++;
            if (state.boardObjective.warned) {
                count++;
            }
        }
        if (state.club.transferEmbargo) {
            count++;
        }
        for (const key of ['arena', 'training', 'academy'] as const) {
            const rounds = facilityProjectRoundsLeft(state, key);
            if (rounds !== null && rounds > 0) {
                count++;
            }
        }
        return count;
    }

    private renderOverviewStatus(grid: AppContext['grid'], infoCol: number, row: number, state: GameState): number {
        const market = this.ctx.config.market;
        let windowLabel: string;
        if (isFullTransferMarketOpen(state, market)) {
            windowLabel = t('dashboard.windowFull');
        } else if (isFreeAgentMarketOpen(state)) {
            windowLabel = t('dashboard.windowFaOnly');
        } else {
            windowLabel = t('dashboard.windowClosed');
        }
        row = this.putInfoLine(grid, infoCol, row, ROLE.text, windowLabel);

        const projection = projectSeasonCashflow(state, this.ctx.config.economy, this.ctx.config.league);
        const netColor = projection.projectedEndBalance >= this.ctx.config.economy.financial.minEndBalance
            ? ROLE.success
            : ROLE.warning;
        row = this.putInfoLine(
            grid,
            infoCol,
            row,
            netColor,
            t('dashboard.weeklyNet', { amount: formatMoney(projection.projectedEndBalance - state.club.budget) }),
        );

        if (state.boardObjective) {
            const targetLine = t('dashboard.boardTarget', { rank: state.boardObjective.promisedMaxRank });
            row = this.putInfoLine(
                grid,
                infoCol,
                row,
                state.boardObjective.warned ? ROLE.danger : ROLE.accent,
                targetLine,
            );
            if (state.boardObjective.warned) {
                row = this.putInfoLine(grid, infoCol, row, ROLE.danger, t('dashboard.boardWarning'));
            }
        }

        if (state.club.transferEmbargo) {
            row = this.putInfoLine(grid, infoCol, row, ROLE.danger, t('dashboard.embargo'));
        }

        for (const key of ['arena', 'training', 'academy'] as const) {
            const rounds = facilityProjectRoundsLeft(state, key);
            if (rounds !== null && rounds > 0) {
                row = this.putInfoLine(
                    grid,
                    infoCol,
                    row,
                    ROLE.textDim,
                    t('dashboard.facilityProgress', {
                        facility: t(`club.facility.${key}` as Parameters<typeof t>[0]),
                        rounds,
                    }),
                );
            }
        }

        return row;
    }
}
