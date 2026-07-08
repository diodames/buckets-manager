import type { EconomyConfig } from '../config/economy';
import type { TrainingConfig, TrainingFocus } from '../config/training';
import { trainingDevMultiplier } from './economy';
import type { GameState, Player } from './model/types';
import { ATTRIBUTE_KEYS } from './model/types';
import type { Rng } from './rng';

/**
 * Weekly training tick, run once after every round for all teams. The user
 * club uses its chosen focus and benefits from its training facility; AI
 * clubs train 'balanced' at facility level 1.
 */
export function weeklyTrainingTick(state: GameState, config: { training: TrainingConfig; economy: EconomyConfig }, rng: Rng): void {
    const training = config.training;
    for (const player of Object.values(state.players)) {
        const isUserPlayer = player.teamId === state.userTeamId;
        const focus: TrainingFocus = isUserPlayer ? state.club.trainingFocus : 'balanced';
        const devMult = isUserPlayer ? trainingDevMultiplier(state, config.economy) : 1;

        recoverFatigue(player, focus, training);
        tickInjury(player);
        developPlayer(player, focus, devMult, training, rng);
    }
}

function recoverFatigue(player: Player, focus: TrainingFocus, training: TrainingConfig): void {
    let recovery = training.baseRecovery;
    if (focus === 'conditioning') {
        recovery += training.conditioningRecoveryBonus;
    }
    if (focus === 'rest') {
        recovery += training.restRecoveryBonus;
    }
    player.fatigue = Math.max(0, player.fatigue - recovery);
}

function tickInjury(player: Player): void {
    if (player.injury) {
        player.injury.roundsOut--;
        if (player.injury.roundsOut <= 0) {
            player.injury = null;
        }
    }
}

function developPlayer(player: Player, focus: TrainingFocus, facilityMult: number, training: TrainingConfig, rng: Rng): void {
    const curve = training.ageCurve;
    let ageFactor: number;
    if (player.age <= curve.growEnd) {
        ageFactor = 1;
    } else if (player.age < curve.declineStart) {
        ageFactor = 1 - (player.age - curve.growEnd) / (curve.declineStart - curve.growEnd);
    } else {
        // Veteran decline: a random attribute drifts down slowly.
        if (rng.chance(curve.declinePerWeek)) {
            const key = rng.pick(ATTRIBUTE_KEYS);
            player.attributes[key] = Math.max(1, player.attributes[key] - 1);
        }
        return;
    }
    const pool = training.focusPools[focus] ?? [];
    if (pool.length === 0 || player.injury) {
        return;
    }
    const overall = ATTRIBUTE_KEYS.reduce((s, k) => s + player.attributes[k], 0) / ATTRIBUTE_KEYS.length;
    if (overall >= player.potential) {
        return;
    }
    const points = training.baseDevPoints * ageFactor * facilityMult;
    // Fractional points become a probability of a +1 on a pool attribute.
    let remaining = points;
    while (remaining > 0) {
        const step = Math.min(1, remaining);
        remaining -= 1;
        if (rng.chance(step)) {
            const key = rng.pick(pool);
            player.attributes[key] = Math.min(99, player.attributes[key] + 1);
        }
    }
}
