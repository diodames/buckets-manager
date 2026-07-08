export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyModifiers {
    /** Multiplier on AI attribute effectiveness in match sim. */
    aiSkillMult: number;
    /** User income multiplier. */
    userIncomeMult: number;
    /** Injury rate multiplier for user players. */
    userInjuryMult: number;
}

const MODS: Record<Difficulty, DifficultyModifiers> = {
    easy: { aiSkillMult: 0.92, userIncomeMult: 1.08, userInjuryMult: 0.75 },
    normal: { aiSkillMult: 1.0, userIncomeMult: 1.0, userInjuryMult: 1.0 },
    hard: { aiSkillMult: 1.06, userIncomeMult: 0.95, userInjuryMult: 1.2 },
};

export function difficultyModifiers(difficulty: Difficulty): DifficultyModifiers {
    return MODS[difficulty ?? 'hard'];
}

/** Resolved difficulty for a save (defaults to hard). */
export function resolveDifficulty(difficulty: Difficulty | undefined): Difficulty {
    return difficulty ?? 'hard';
}
