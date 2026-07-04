import { BT } from 'blit386';
import type { AppContext, Screen } from '../../app/Screen';
import type { UiInputFrame } from '../../app/UiInput';
import { courtConfig } from '../../config/court';
import { balanceConfig } from '../../config/balance';
import { completeRound, type RoundResult } from '../../core/game';
import type { Fixture, PlayerId } from '../../core/model/types';
import { createRng } from '../../core/rng';
import type { MatchEvent } from '../../core/sim/events';
import type { EngineStop, MatchEngine, MatchOutcome } from '../../core/sim/matchEngine';
import { buildPressContext, generatePressConference } from '../../core/press';
import { t } from '../../i18n';
import { commentaryLine } from '../commentary';
import { CourtRenderer } from '../court';
import { shortPlayerName, teamDef } from '../format';
import { ROLE } from '../theme';
import { MenuList } from '../widgets/MenuList';
import { DashboardScreen } from './DashboardScreen';
import { PressConferenceScreen } from './PressConferenceScreen';

type Phase = 'pregame' | 'playing' | 'paused' | 'subOut' | 'subIn' | 'tactics' | 'moment' | 'report';

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

    constructor(ctx: AppContext, fixture: Fixture, engine: MatchEngine) {
        this.ctx = ctx;
        this.fixture = fixture;
        this.engine = engine;
        const originX = Math.floor((ctx.grid.cols * ctx.grid.cellW - courtConfig.pixelWidth) / 2);
        this.court = new CourtRenderer(originX, 64, fixture.homeTeamId);
        this.syncLineups();
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
        this.pendingStop = null;
        this.enterReport();
    }

    private enterReport(): void {
        if (!this.outcome) {
            this.outcome = this.engine.finish();
            this.score = [this.outcome.summary.homeScore, this.outcome.summary.awayScore];
            this.roundResult = completeRound(this.state, this.ctx.config, { fixture: this.fixture, outcome: this.outcome });
            const session = this.ctx.session;
            if (session) {
                session.lastRound = this.roundResult;
            }
        }
        this.phase = 'report';
    }

    private leaveToPress(): void {
        const state = this.state;
        const summary = this.outcome?.summary;
        if (!summary) {
            this.ctx.screens.reset(new DashboardScreen(this.ctx));
            return;
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

    // --- update ---

    update(input: UiInputFrame): void {
        switch (this.phase) {
            case 'pregame':
                if (input.confirm) {
                    this.phase = 'playing';
                }
                if (BT.isKeyPressed('KeyI')) {
                    this.finishInstantly();
                }
                break;
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
            case 'report':
                if (input.confirm) {
                    this.leaveToPress();
                }
                break;
        }
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

        // Commentary.
        const commentaryTop = grid.rows - 2 - courtConfig.commentaryLines;
        this.commentary.forEach((line, index) => {
            grid.put(2, commentaryTop + index, index === this.commentary.length - 1 ? ROLE.text : ROLE.textDim, line);
        });

        // Bottom hints.
        grid.fillCells(0, grid.rows - 1, grid.cols, 1, ROLE.panel);
        grid.put(1, grid.rows - 1, ROLE.textDim, t('live.hints'));

        // Phase overlays.
        if (this.phase === 'pregame') {
            grid.putCenter(Math.floor(grid.rows / 2) - 6, ROLE.header, t('live.tipoff', { home: home.name, away: away.name }));
            grid.putCenter(Math.floor(grid.rows / 2) - 4, ROLE.text, t('live.pressStart'));
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
        if (this.phase === 'report' && this.outcome) {
            const summary = this.outcome.summary;
            grid.fillCells(10, 6, 56, 14, ROLE.panel);
            grid.frame(10, 6, 56, 14, ROLE.border);
            grid.put(12, 7, ROLE.header, t('report.final'));
            grid.put(12, 9, ROLE.textBright, `${home.shortName} ${summary.homeScore} : ${summary.awayScore} ${away.shortName}`);
            const quarters = summary.quarterScores.map(([h, a]) => `${h}:${a}`).join('  ');
            grid.put(12, 10, ROLE.textDim, quarters);
            let row = 12;
            for (const log of this.outcome.momentLog.slice(0, 2)) {
                grid.put(12, row, ROLE.accent, t(`moment.${log.momentId}.result.${log.choiceId}` as Parameters<typeof t>[0]));
                row++;
            }
            const injured = Object.keys(this.outcome.injuries)[0];
            if (injured) {
                const player = this.state.players[injured];
                if (player) {
                    grid.put(12, row, ROLE.danger, t('report.injury', { player: shortPlayerName(player), rounds: this.outcome.injuries[injured] ?? 1 }));
                    row++;
                }
            }
            grid.put(12, 18, ROLE.text, t('report.continue'));
        }
    }
}
