import type { AttributeKey } from '../core/model/types';

// Weekly training between rounds: the user picks a focus; AI teams train
// 'balanced'. Development nudges attributes toward the player's potential.
export const trainingConfig = Object.freeze({
    // Fatigue removed per week (before facility/conditioning bonuses).
    baseRecovery: 22,
    conditioningRecoveryBonus: 12,
    restRecoveryBonus: 25,
    // Base development points distributed per week to a young player at a
    // level-1 facility (scaled by age curve and facility multiplier).
    baseDevPoints: 0.68,
    // Age curve: full growth until growEnd, fades to zero at declineStart,
    // then negative drift per week beyond it.
    ageCurve: Object.freeze({
        growEnd: 24,
        declineStart: 30,
        declinePerWeek: 0.15,
    }),
    // Focus -> attribute pools receiving development (picked at random from
    // the pool each week). 'rest' develops nothing but maximizes recovery.
    focusPools: Object.freeze<Record<string, readonly AttributeKey[]>>({
        shooting: ['shooting2', 'shooting3', 'freeThrows'],
        playmaking: ['passing', 'dribbling', 'iq'],
        defense: ['defense', 'stealing', 'blocking', 'rebounding'],
        conditioning: ['speed', 'stamina'],
        balanced: [
            'shooting2', 'shooting3', 'freeThrows', 'passing', 'dribbling',
            'defense', 'stealing', 'blocking', 'rebounding', 'speed', 'stamina', 'iq',
        ],
        rest: [],
    }),
    focusOrder: Object.freeze(['balanced', 'shooting', 'playmaking', 'defense', 'conditioning', 'rest']),
});

export type TrainingConfig = typeof trainingConfig;
export type TrainingFocus = keyof typeof trainingConfig.focusPools & string;
