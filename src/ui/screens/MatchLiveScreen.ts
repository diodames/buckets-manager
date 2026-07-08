import { BT, Rect2i } from 'blit386';
import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { courtConfig } from '../../config/court';
import { balanceConfig } from '../../config/balance';
import { completeRound, type RoundResult } from '../../core/game';
import type { Fixture, MatchSummary, PlayerId } from '../../core/model/types';
import { createRng } from '../../core/rng';
import type { MatchEvent } from '../../core/sim/events';
import { foldEvents } from '../../core/sim/boxscore';
import type { EngineStop, MatchEngine, MatchOutcome } from '../../core/sim/matchEngine';
import { buildPressContext, generatePressConference } from '../../core/press';
import { t } from '../../i18n';
import { commentaryLine } from '../commentary';
import { buildBoxColumns, boxScoreRows, quarterScoreLine } from '../boxscore';
import { CourtRenderer } from '../court';
import { shortPlayerName, teamDef } from '../format';
import { ROLE } from '../theme';
import { DataTable } from '../widgets/DataTable';
import { MenuList } from '../widgets/MenuList';
import { BoxScoreScreen, injuryNoteFrom } from './BoxScoreScreen';
import { DashboardScreen } from './DashboardScreen';
import { PressConferenceScreen } from './PressConferenceScreen';

type Phase = 'pregame' | 'playing' | 'paused' | 'subOut' | 'subIn' | 'tactics' | 'moment' | 'boxscoreLive';

const PACES = ['slow', 'normal', 'fast'] as const;
const FOCUSES = ['inside', 'balanced', 'perimeter'] as const;
const DEFENSES = ['man', 'zone', 'press'] as const;

export class MatchLiveScreen implements Screen {
    private readonly ctx: AppContext;
    private readonly fixture: Fixture;
    private readonly engine: MatchEngine;
    private readonly court: CourtRenderer;
    private phase: Phase = 'pregame';
    private queue: Array<{ event: MatchEvent; delayTicks: number }> = [];
    private waitTicks = 0;
    private consumedEvents = 0;
    private pendingStop: EngineStop | null = null;
    private speedIndex = 0;
    private commentary: string[] = [];
    private lastClock: { period: number; secondsLeft: number } = {
        period: 1,
        secondsLeft: balanceConfig.match.quarterSeconds,
    };
    private score: [number, number] = [0, 0];
    private menu: MenuList | null = null;
    private subOutId: PlayerId | null = null;
    private outcome: MatchOutcome | null = null;
    private roundResult: RoundResult | null = null;
    private reportShown = false;
    // Live box for the on-court panel, folded from consumed events only.
    private readonly liveStats = new Map<PlayerId, { pts: number; reb: number; ast: number }>();
    private boxLiveTable: DataTable | null = null;
    private boxLiveViewingHome = true;
    private boxLiveSummary: MatchSummary | null = null;

    constructor(ctx: AppContext, fixture: Fixture, engine: MatchEngine) {
        this.ctx = ctx;
        this.fixture = fixture;
        this.engine = engine;
        const originX = Math.floor((ctx.grid.cols * ctx.grid.cellW - courtConfig.pixelWidth) / 2);
        this.court = new CourtRenderer(originX, 64, fixture.homeTeamId);
        this.syncLineups();
        // Pre-match team talk (dressing-room speech).
        this.menu = new MenuList(
            [
                ...this.ctx.config.moments.teamTalks.map((talk) => ({
                    id: talk.id,
                    label: t(`talk.${talk.id}` as Parameters<typeof t>[0]),
                })),
                { id: 'none', label: t('talk.none') },
            ],
            { col: Math.floor(ctx.grid.cols / 2) - 18, row: Math.floor(ctx.grid.rows / 2) - 1, width: 40 },
        );
    }

    onEnter(): void {
        const slots = courtConfig.slots;
        BT.paletteCycle(slots.crowdBase, slots.crowdBase + 3, courtConfig.crowdCycleSpeed);
    }

    onExit(): void {
        BT.paletteClearEffects();
    }

    private get state() {
        const session = this.ctx.session;
        if (!session) {
            throw new Error('MatchLiveScreen: no session');
        }
        return session.state;
    }

    private teamSlots(teamId: string): { fill: number; edge: number } {
        const team = this.state.teams[teamId];
        let fill = team?.colorSlotPrimary ?? ROLE.text;
        let edge = team?.colorSlotSecondary ?? ROLE.textDim;
        // Jersey clash: when both primaries are near-identical (e.g. two
        // black kits), the away side switches to its secondary color.
        if (teamId === this.fixture.awayTeamId) {
            const homeDef = teamDef(this.fixture.homeTeamId);
            const awayDef = teamDef(this.fixture.awayTeamId);
            const dist =
                Math.abs(homeDef.primary.r - awayDef.primary.r) +
                Math.abs(homeDef.primary.g - awayDef.primary.g) +
                Math.abs(homeDef.primary.b - awayDef.primary.b);
            if (dist < 120) {
                [fill, edge] = [edge, fill];
            }
        }
        return { fill, edge };
    }

    private syncLineups(): void {
        const home = this.engine.activeFive(this.fixture.homeTeamId).map((p) => p.id);
        const away = this.engine.activeFive(this.fixture.awayTeamId).map((p) => p.id);
        this.court.setLineups(
            { ids: home, ...this.teamSlots(this.fixture.homeTeamId) },
            { ids: away, ...this.teamSlots(this.fixture.awayTeamId) },
        );
    }

    // --- engine pumping and playback ---

    private pump(): void {
        if (this.pendingStop || this.engine.isFinished) {
            return;
        }
        const stop = this.engine.run({ breakAfterPossession: true });
        const fresh = this.engine.events.slice(this.consumedEvents + this.queue.length);
        for (const event of fresh) {
            const delayMs = courtConfig.eventDelaysMs[event.t as keyof typeof courtConfig.eventDelaysMs] ?? 600;
            this.queue.push({ event, delayTicks: Math.round((delayMs * 60) / 1000) });
        }
        if (stop.kind !== 'break') {
            this.pendingStop = stop;
        }
    }

    private consumeNext(): void {
        const next = this.queue.shift();
        if (!next) {
            return;
        }
        this.consumedEvents++;
        const event = next.event;
        this.lastClock = event.clock;
        if ((event.t === 'shot' && event.made) || (event.t === 'freeThrow' && event.made)) {
            const points = event.t === 'shot' ? event.points : 1;
            if (event.teamId === this.fixture.homeTeamId) {
                this.score = [this.score[0] + points, this.score[1]];
            } else {
                this.score = [this.score[0], this.score[1] + points];
            }
        }
        // Live panel stats.
        if (event.t === 'shot' && event.made) {
            this.liveStat(event.playerId).pts += event.points;
            if (event.assistBy) {
                this.liveStat(event.assistBy).ast++;
            }
        }
        if (event.t === 'freeThrow' && event.made) {
            this.liveStat(event.playerId).pts++;
        }
        if (event.t === 'rebound') {
            this.liveStat(event.playerId).reb++;
        }
        if (event.t === 'periodEnd' || event.t === 'gameEnd') {
            this.score = event.score;
        }
        if (event.t === 'gameEnd') {
            BT.paletteFlash(BT.palette.get(ROLE.textBright), 220);
        }
        if (event.t === 'substitution') {
            this.syncLineups();
        }
        if (event.t === 'playCall') {
            const offense = event.teamId;
            const defense = offense === this.fixture.homeTeamId ? this.fixture.awayTeamId : this.fixture.homeTeamId;
            this.court.onPlayCall(
                event.play,
                { teamId: offense, ids: this.engine.activeFive(offense).map((p) => p.id) },
                { ids: this.engine.activeFive(defense).map((p) => p.id), scheme: this.engine.schemeOf(defense) },
            );
        }
        this.court.onEvent(event);
        const line = commentaryLine(this.state, event);
        if (line) {
            this.commentary.push(line);
            if (this.commentary.length > courtConfig.commentaryLines) {
                this.commentary.shift();
            }
        }
        this.waitTicks = Math.max(1, Math.round(next.delayTicks / (courtConfig.speeds[this.speedIndex] ?? 1)));
    }

    private finishInstantly(): void {
        this.queue = [];
        this.enterReport();
    }

    private enterReport(): void {
        if (this.reportShown) {
            return;
        }
        this.reportShown = true;
        this.pendingStop = null;
        if (!this.outcome) {
            this.outcome = this.engine.finish();
            this.score = [this.outcome.summary.homeScore, this.outcome.summary.awayScore];
        }
        const summary = this.outcome.summary;
        const injured = Object.keys(this.outcome.injuries)[0];
        const injuryNote = injuryNoteFrom(
            this.state,
            injured,
            injured ? this.outcome.injuries[injured] : undefined,
        );
        this.ctx.screens.replace(
            new BoxScoreScreen(this.ctx, this.fixture, summary, () => this.leaveToPress(), { injuryNote }),
        );
    }

    private leaveToPress(): void {
        const state = this.state;
        const summary = this.outcome?.summary;
        if (!summary) {
            this.ctx.screens.reset(new DashboardScreen(this.ctx));
            return;
        }
        if (!this.roundResult && this.outcome) {
            this.roundResult = completeRound(this.state, this.ctx.config, { fixture: this.fixture, outcome: this.outcome });
            const session = this.ctx.session;
            if (session) {
                session.lastRound = this.roundResult;
            }
        }
        const context = buildPressContext(state, summary, this.fixture.homeTeamId, this.roundResult?.userInjuredId ?? null);
        const rng = createRng(state.masterSeed).fork(`press:${this.fixture.id}`);
        const questions = generatePressConference(context, this.ctx.config.press, rng);
        if (questions.length > 0) {
            this.ctx.screens.reset(new PressConferenceScreen(this.ctx, questions));
        } else {
            this.ctx.screens.reset(new DashboardScreen(this.ctx));
        }
    }

    // --- menus ---

    private openCoachMenu(): void {
        this.phase = 'paused';
        const teamId = this.state.userTeamId;
        this.menu = new MenuList(
            [
                { id: 'resume', label: t('live.resume') },
                { id: 'timeout', label: t('live.timeout', { n: this.engine.timeoutsOf(teamId) }), disabled: this.engine.timeoutsOf(teamId) <= 0 },
                { id: 'sub', label: t('live.substitution') },
                { id: 'tactics', label: t('live.tactics') },
                { id: 'boxScore', label: t('live.boxScore') },
                { id: 'instant', label: t('live.instant') },
            ],
            { col: 4, row: 6, width: 34 },
        );
    }

    private openSubOut(): void {
        this.phase = 'subOut';
        const five = this.engine.activeFive(this.state.userTeamId);
        this.menu = new MenuList(
            five.map((p) => {
                const player = this.state.players[p.id];
                return {
                    id: p.id,
                    label: `${player ? shortPlayerName(player) : p.id} (${p.position})  E:${Math.round(this.engine.energyOf(p.id))}`,
                };
            }),
            { col: 4, row: 6, width: 40 },
        );
    }

    private openSubIn(): void {
        this.phase = 'subIn';
        const bench = this.engine.benchPlayers(this.state.userTeamId);
        this.menu = new MenuList(
            bench.map((p) => {
                const player = this.state.players[p.id];
                return {
                    id: p.id,
                    label: `${player ? shortPlayerName(player) : p.id} (${p.position})  E:${Math.round(this.engine.energyOf(p.id))}`,
                };
            }),
            { col: 4, row: 6, width: 40 },
        );
    }

    private openTactics(): void {
        this.phase = 'tactics';
        this.menu = new MenuList(
            [
                { id: 'pace', label: '' },
                { id: 'focus', label: '' },
                { id: 'defense', label: '' },
                { id: 'back', label: t('common.back') },
            ],
            { col: 4, row: 6, width: 40 },
        );
    }

    private openMomentMenu(): void {
        const stop = this.pendingStop;
        if (stop?.kind !== 'moment') {
            return;
        }
        this.phase = 'moment';
        this.menu = new MenuList(
            stop.moment.def.choices.map((choice) => ({
                id: choice.id,
                label: t(`moment.${stop.moment.def.id}.${choice.id}` as Parameters<typeof t>[0]),
            })),
            { col: 6, row: 12, width: 60 },
        );
    }

    private openLiveBoxScore(): void {
        const folded = foldEvents(
            this.engine.events.slice(0, this.consumedEvents),
            this.fixture.homeTeamId,
        );
        this.boxLiveSummary = {
            homeScore: folded.homeScore,
            awayScore: folded.awayScore,
            quarterScores: folded.quarterScores,
            box: folded.box,
            seed: 0,
        };
        this.boxLiveViewingHome = this.fixture.homeTeamId === this.state.userTeamId;
        this.boxLiveTable = new DataTable({ col: 4, row: 10, visibleRows: 10 }, false);
        this.refreshLiveBoxTable();
        this.phase = 'boxscoreLive';
    }

    private refreshLiveBoxTable(): void {
        if (!this.boxLiveTable || !this.boxLiveSummary) {
            return;
        }
        const teamId = this.boxLiveViewingHome ? this.fixture.homeTeamId : this.fixture.awayTeamId;
        const highlight = new Set<PlayerId>(this.state.teams[this.state.userTeamId]?.playerIds ?? []);
        this.boxLiveTable.setData(
            buildBoxColumns(),
            boxScoreRows(this.state, teamId, this.boxLiveSummary.box, highlight),
        );
    }

    // --- update ---

    update(input: UiInputFrame): void {
        switch (this.phase) {
            case 'pregame': {
                if (BT.isKeyPressed('KeyI')) {
                    this.finishInstantly();
                    break;
                }
                const talk = this.menu?.update(input, this.ctx.grid) ?? null;
                if (talk) {
                    if (talk !== 'none') {
                        this.engine.applyDecision({ t: 'teamTalk', teamId: this.state.userTeamId, talkId: talk });
                    }
                    this.menu = null;
                    this.phase = 'playing';
                }
                break;
            }
            case 'playing':
                this.updatePlaying(input);
                break;
            case 'paused':
                this.updatePaused(input);
                break;
            case 'subOut':
                this.updateSubOut(input);
                break;
            case 'subIn':
                this.updateSubIn(input);
                break;
            case 'tactics':
                this.updateTactics(input);
                break;
            case 'moment':
                this.updateMoment(input);
                break;
            case 'boxscoreLive':
                this.updateBoxscoreLive(input);
                break;
        }
    }

    private updateBoxscoreLive(input: UiInputFrame): void {
        if (input.cancel) {
            this.phase = 'playing';
            this.boxLiveTable = null;
            this.boxLiveSummary = null;
            return;
        }
        if (input.left) {
            this.boxLiveViewingHome = true;
            this.refreshLiveBoxTable();
        }
        if (input.right) {
            this.boxLiveViewingHome = false;
            this.refreshLiveBoxTable();
        }
        this.boxLiveTable?.update(input, this.ctx.grid);
    }

    private updatePlaying(input: UiInputFrame): void {
        if (input.cancel || BT.isKeyPressed('Space')) {
            this.openCoachMenu();
            return;
        }
        if (BT.isKeyPressed('KeyI')) {
            this.finishInstantly();
            return;
        }
        for (let i = 0; i < courtConfig.speeds.length; i++) {
            if (BT.isKeyPressed(`Digit${i + 1}`)) {
                this.speedIndex = i;
            }
        }
        if (this.waitTicks > 0) {
            this.waitTicks--;
            return;
        }
        if (this.queue.length === 0) {
            if (this.pendingStop) {
                const stop = this.pendingStop;
                if (stop.kind === 'gameEnd') {
                    this.enterReport();
                } else if (stop.kind === 'moment') {
                    this.openMomentMenu();
                } else {
                    this.pendingStop = null;
                }
                return;
            }
            if (this.engine.isFinished) {
                this.enterReport();
                return;
            }
            this.pump();
            return;
        }
        this.consumeNext();
    }

    private updatePaused(input: UiInputFrame): void {
        if (input.cancel) {
            this.phase = 'playing';
            return;
        }
        const action = this.menu?.update(input, this.ctx.grid) ?? null;
        switch (action) {
            case 'resume':
                this.phase = 'playing';
                break;
            case 'timeout':
                this.engine.applyDecision({ t: 'timeout', teamId: this.state.userTeamId });
                this.phase = 'playing';
                break;
            case 'sub':
                this.openSubOut();
                break;
            case 'tactics':
                this.openTactics();
                break;
            case 'boxScore':
                this.openLiveBoxScore();
                break;
            case 'instant':
                this.finishInstantly();
                break;
            default:
                break;
        }
    }

    private updateSubOut(input: UiInputFrame): void {
        if (input.cancel) {
            this.openCoachMenu();
            return;
        }
        const picked = this.menu?.update(input, this.ctx.grid) ?? null;
        if (picked) {
            this.subOutId = picked;
            this.openSubIn();
        }
    }

    private updateSubIn(input: UiInputFrame): void {
        if (input.cancel) {
            this.openSubOut();
            return;
        }
        const picked = this.menu?.update(input, this.ctx.grid) ?? null;
        if (picked && this.subOutId) {
            this.engine.applyDecision({ t: 'substitution', teamId: this.state.userTeamId, out: this.subOutId, in: picked });
            this.subOutId = null;
            this.syncLineups();
            this.phase = 'playing';
        }
    }

    private updateTactics(input: UiInputFrame): void {
        if (input.cancel) {
            this.openCoachMenu();
            return;
        }
        const team = this.state.teams[this.state.userTeamId];
        if (!team || !this.menu) {
            return;
        }
        const selectedId = this.menu.items[this.menu.selected]?.id;
        if ((input.left || input.right) && (selectedId === 'pace' || selectedId === 'focus' || selectedId === 'defense')) {
            const dir = input.right ? 1 : -1;
            if (selectedId === 'pace') {
                const index = (PACES.indexOf(team.tactics.pace) + dir + PACES.length) % PACES.length;
                team.tactics.pace = PACES[index] as (typeof PACES)[number];
            } else if (selectedId === 'focus') {
                const index = (FOCUSES.indexOf(team.tactics.offenseFocus) + dir + FOCUSES.length) % FOCUSES.length;
                team.tactics.offenseFocus = FOCUSES[index] as (typeof FOCUSES)[number];
            } else {
                const index = (DEFENSES.indexOf(team.tactics.defenseScheme) + dir + DEFENSES.length) % DEFENSES.length;
                team.tactics.defenseScheme = DEFENSES[index] as (typeof DEFENSES)[number];
            }
            this.engine.applyDecision({
                t: 'tactics',
                teamId: team.id,
                pace: team.tactics.pace,
                offenseFocus: team.tactics.offenseFocus,
                defenseScheme: team.tactics.defenseScheme,
            });
        }
        const action = this.menu.update(input, this.ctx.grid);
        if (action === 'back') {
            this.openCoachMenu();
        }
    }

    private updateMoment(input: UiInputFrame): void {
        const picked = this.menu?.update(input, this.ctx.grid) ?? null;
        if (picked) {
            this.engine.resolveMoment(picked);
            this.pendingStop = null;
            this.phase = 'playing';
        }
    }

    private liveStat(playerId: PlayerId): { pts: number; reb: number; ast: number } {
        let entry = this.liveStats.get(playerId);
        if (!entry) {
            entry = { pts: 0, reb: 0, ast: 0 };
            this.liveStats.set(playerId, entry);
        }
        return entry;
    }

    /** Phases where the side HUD would collide with a centered overlay. */
    private hidesMatchHud(): boolean {
        return this.phase === 'pregame' || this.phase === 'moment' || this.phase === 'boxscoreLive';
    }

    /** Right-hand live panel: the user's five on court, stats, energy bars. */
    private renderOnCourtPanel(topRow: number): void {
        const grid = this.ctx.grid;
        const col = 61;
        const barWidth = 10;
        grid.put(col, topRow - 1, ROLE.header, t('live.onCourt'));
        const five = this.engine.activeFive(this.state.userTeamId);
        five.forEach((simPlayer, index) => {
            const row = topRow + index;
            const player = this.state.players[simPlayer.id];
            const stats = this.liveStats.get(simPlayer.id) ?? { pts: 0, reb: 0, ast: 0 };
            const energy = Math.round(this.engine.energyOf(simPlayer.id));
            const name = player ? shortPlayerName(player) : simPlayer.id;
            grid.put(col, row, ROLE.text, `${name.slice(0, 14).padEnd(14)} ${String(stats.pts).padStart(2)}/${stats.reb}/${stats.ast}`);
            // Slim energy gauge (half a cell tall so rows stay separated).
            const barColor = energy > 60 ? ROLE.success : energy > 30 ? ROLE.warning : ROLE.danger;
            const origin = grid.px(col + 23, row);
            const barPx = barWidth * grid.cellW;
            const filledPx = Math.max(0, Math.min(barPx, Math.round((energy / 100) * barPx)));
            BT.drawRectFill(new Rect2i(origin.x, origin.y + 4, barPx, 6), ROLE.panel);
            if (filledPx > 0) {
                BT.drawRectFill(new Rect2i(origin.x, origin.y + 4, filledPx, 6), barColor);
            }
            BT.drawRect(new Rect2i(origin.x - 1, origin.y + 3, barPx + 2, 8), ROLE.border);
            grid.put(col + 23 + barWidth + 1, row, ROLE.textDim, String(energy).padStart(3));
        });
        grid.put(col, topRow + 5, ROLE.textDim, t('live.benchAuto'));
    }

    // --- render ---

    render(): void {
        const grid = this.ctx.grid;
        this.court.tick();

        // Scoreboard.
        const home = teamDef(this.fixture.homeTeamId);
        const away = teamDef(this.fixture.awayTeamId);
        const clock = this.lastClock;
        const minutes = Math.floor(Math.max(0, clock.secondsLeft) / 60);
        const seconds = Math.max(0, Math.round(clock.secondsLeft)) % 60;
        grid.fillCells(0, 0, grid.cols, 1, ROLE.panel);
        grid.put(1, 0, ROLE.header, `${home.abbr} ${this.score[0]} : ${this.score[1]} ${away.abbr}`);
        grid.putCenter(0, ROLE.textBright, `Q${clock.period}  ${minutes}:${String(seconds).padStart(2, '0')}`);
        grid.putRight(grid.cols - 1, 0, ROLE.textDim, `${t('live.speed')} ${courtConfig.speeds[this.speedIndex]}x`);
        grid.put(1, 1, ROLE.textDim, `${home.shortName} - ${away.shortName}`);
        grid.putRight(grid.cols - 1, 1, ROLE.textDim, t('live.timeoutsLeft', { n: this.engine.timeoutsOf(this.state.userTeamId) }));

        this.court.render();

        const commentaryTop = grid.rows - 2 - courtConfig.commentaryLines;
        if (!this.hidesMatchHud()) {
            this.commentary.forEach((line, index) => {
                grid.put(2, commentaryTop + index, index === this.commentary.length - 1 ? ROLE.text : ROLE.textDim, line.slice(0, 57));
            });
            this.renderOnCourtPanel(commentaryTop);
        }

        if (this.phase !== 'pregame') {
            grid.fillCells(0, grid.rows - 1, grid.cols, 1, ROLE.panel);
            grid.put(1, grid.rows - 1, ROLE.textDim, t('live.hints'));
        }

        // Phase overlays.
        if (this.phase === 'pregame') {
            const boxCol = Math.floor(grid.cols / 2) - 22;
            const boxRow = Math.floor(grid.rows / 2) - 6;
            const boxW = 48;
            const boxH = 13;
            grid.fillCells(boxCol, boxRow, boxW, boxH, ROLE.panel);
            grid.frame(boxCol, boxRow, boxW, boxH, ROLE.border);
            grid.putCenter(boxRow + 1, ROLE.header, t('live.tipoff', { home: home.shortName, away: away.shortName }));
            grid.putCenter(boxRow + 3, ROLE.accent, t('talk.title'));
            this.menu?.render(grid);
            grid.putCenter(boxRow + boxH - 2, ROLE.textDim, t('live.pressStart'));
        }
        if (this.phase === 'paused' || this.phase === 'subOut' || this.phase === 'subIn' || this.phase === 'tactics') {
            const title =
                this.phase === 'paused'
                    ? t('live.coachMenu')
                    : this.phase === 'subOut'
                      ? t('live.subOut')
                      : this.phase === 'subIn'
                        ? t('live.subIn')
                        : t('live.tactics');
            grid.fillCells(3, 4, 46, 12, ROLE.panel);
            grid.frame(3, 4, 46, 12, ROLE.border);
            grid.put(5, 5, ROLE.header, title);
            if (this.phase === 'tactics') {
                const team = this.state.teams[this.state.userTeamId];
                const first = this.menu?.items[0];
                const second = this.menu?.items[1];
                const third = this.menu?.items[2];
                if (first && team) {
                    first.label = t('live.pace', { pace: t(`tactics.pace.${team.tactics.pace}` as Parameters<typeof t>[0]) });
                }
                if (second && team) {
                    second.label = t('live.focus', { focus: t(`tactics.focus.${team.tactics.offenseFocus}` as Parameters<typeof t>[0]) });
                }
                if (third && team) {
                    third.label = t('live.defense', { defense: t(`tactics.defense.${team.tactics.defenseScheme}` as Parameters<typeof t>[0]) });
                }
            }
            this.menu?.render(grid);
        }
        if (this.phase === 'moment' && this.pendingStop?.kind === 'moment') {
            const moment = this.pendingStop.moment;
            const playerName = moment.playerId ? (this.state.players[moment.playerId]?.lastName ?? '') : '';
            grid.fillCells(4, 8, 66, 12, ROLE.panel);
            grid.frame(4, 8, 66, 12, ROLE.border);
            grid.put(6, 9, ROLE.gold, t('moment.title'));
            grid.put(6, 10, ROLE.textBright, t(`moment.${moment.def.id}.text` as Parameters<typeof t>[0], { player: playerName }));
            this.menu?.render(grid);
        }
        if (this.phase === 'boxscoreLive' && this.boxLiveSummary && this.boxLiveTable) {
            const home = teamDef(this.fixture.homeTeamId);
            const away = teamDef(this.fixture.awayTeamId);
            const summary = this.boxLiveSummary;
            grid.fillCells(2, 6, 76, 18, ROLE.panel);
            grid.frame(2, 6, 76, 18, ROLE.border);
            grid.put(4, 7, ROLE.header, t('boxscore.title'));
            grid.put(4, 8, ROLE.textBright,
                `${home.shortName} ${summary.homeScore} : ${summary.awayScore} ${away.shortName}`);
            const quarters = quarterScoreLine(summary);
            if (quarters) {
                grid.put(4, 9, ROLE.textDim, quarters);
            }
            const tabLabel = this.boxLiveViewingHome
                ? `<< ${t('boxscore.home')}: ${home.abbr} >>`
                : `<< ${t('boxscore.away')}: ${away.abbr} >>`;
            grid.put(4, 10, ROLE.accent, tabLabel);
            this.boxLiveTable.render(grid);
            grid.put(4, 22, ROLE.textDim, `${t('hint.pages')}  ${t('live.resume')}`);
        }
    }
}
