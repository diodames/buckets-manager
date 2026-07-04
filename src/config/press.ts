// Post-match press conference: question templates with three answer styles.
// Texts live in i18n under `press.<questionId>.q` and `press.<questionId>.<choiceId>`.
export interface PressChoiceDef {
    id: string;
    teamMorale?: number;
    starMorale?: number;
    fanSupport?: number;
    sponsorRelation?: number;
}

export interface PressQuestionDef {
    id: string;
    // When the question is eligible.
    context: 'bigWin' | 'closeWin' | 'bigLoss' | 'closeLoss' | 'starPerformance' | 'injury' | 'streak';
    choices: PressChoiceDef[];
}

export const pressConfig = Object.freeze({
    questionsPerConference: 2,
    // Margin defining a blowout.
    blowoutMargin: 15,
    // Star performance threshold (points).
    starPoints: 22,
    defs: Object.freeze<PressQuestionDef[]>([
        {
            id: 'bigWin',
            context: 'bigWin',
            choices: [
                { id: 'humble', teamMorale: 2, sponsorRelation: 2 },
                { id: 'confident', teamMorale: 4, fanSupport: 3, sponsorRelation: -1 },
                { id: 'taunt', fanSupport: 5, teamMorale: 2, sponsorRelation: -4 },
            ],
        },
        {
            id: 'closeWin',
            context: 'closeWin',
            choices: [
                { id: 'praiseTeam', teamMorale: 4 },
                { id: 'luck', teamMorale: -1, sponsorRelation: 1, fanSupport: 1 },
                { id: 'critical', teamMorale: -3, fanSupport: 2, sponsorRelation: 2 },
            ],
        },
        {
            id: 'bigLoss',
            context: 'bigLoss',
            choices: [
                { id: 'blameSelf', teamMorale: 3, fanSupport: 1, sponsorRelation: -1 },
                { id: 'blameTeam', teamMorale: -5, fanSupport: -1, sponsorRelation: 1 },
                { id: 'promise', fanSupport: 3, sponsorRelation: 2, teamMorale: 1 },
            ],
        },
        {
            id: 'closeLoss',
            context: 'closeLoss',
            choices: [
                { id: 'proud', teamMorale: 3, fanSupport: 1 },
                { id: 'refs', fanSupport: 2, sponsorRelation: -3, teamMorale: 1 },
                { id: 'details', teamMorale: 1, sponsorRelation: 1 },
            ],
        },
        {
            id: 'starPerformance',
            context: 'starPerformance',
            choices: [
                { id: 'praiseStar', starMorale: 6, teamMorale: -1, fanSupport: 2 },
                { id: 'teamEffort', teamMorale: 3, starMorale: -2 },
                { id: 'demandMore', starMorale: -4, teamMorale: 1, sponsorRelation: 1 },
            ],
        },
        {
            id: 'injury',
            context: 'injury',
            choices: [
                { id: 'concern', teamMorale: 2, fanSupport: 1 },
                { id: 'nextMan', teamMorale: 1, starMorale: -1 },
                { id: 'blameSchedule', fanSupport: 1, sponsorRelation: -2 },
            ],
        },
    ]),
});

export type PressConfig = typeof pressConfig;
