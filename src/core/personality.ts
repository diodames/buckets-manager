import type { GameState, Player, TeamId } from './model/types';
import { overallRating } from './model/types';
import type { AiPersonality } from './model/types';

/** Assign deterministic personality from team id seed. */
export function personalityForTeam(teamId: TeamId): AiPersonality {
    const hash = teamId.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    const traits: AiPersonality[] = ['developer', 'winNow', 'hoarder'];
    return traits[hash % traits.length] as AiPersonality;
}

/** Personality adjusts AI willingness to list / buy / retain youth. */
export function personalitySellFactor(personality: AiPersonality | undefined): number {
    switch (personality) {
        case 'developer':
            return 0.9;
        case 'winNow':
            return 1.15;
        case 'hoarder':
            return 1.35;
        default:
            return 1.0;
    }
}

export function personalityBuyAggression(personality: AiPersonality | undefined): number {
    switch (personality) {
        case 'developer':
            return 1.1;
        case 'winNow':
            return 1.25;
        case 'hoarder':
            return 0.85;
        default:
            return 1.0;
    }
}

/** Youth retention: developers keep prospects longer. */
export function personalityYouthRetention(personality: AiPersonality | undefined): number {
    switch (personality) {
        case 'developer':
            return 0.7;
        case 'winNow':
            return 1.0;
        case 'hoarder':
            return 0.5;
        default:
            return 1.0;
    }
}

/** FA target age preference by personality. */
export function personalityTargetAge(player: Player, personality: AiPersonality | undefined): number {
    const ovr = overallRating(player.attributes);
    if (personality === 'developer' && player.age <= 24) {
        return 1.2;
    }
    if (personality === 'winNow' && ovr >= 70 && player.age >= 26 && player.age <= 32) {
        return 1.15;
    }
    if (personality === 'hoarder') {
        return 0.85;
    }
    return 1.0;
}

export function teamPersonality(state: GameState, teamId: TeamId): AiPersonality | undefined {
    return state.teams[teamId]?.aiPersonality;
}

export function initTeamPersonalities(state: GameState, userTeamId: TeamId): void {
    for (const teamId of Object.keys(state.teams)) {
        if (teamId === userTeamId) {
            continue;
        }
        const team = state.teams[teamId];
        if (team && !team.aiPersonality) {
            team.aiPersonality = personalityForTeam(teamId);
        }
    }
}
