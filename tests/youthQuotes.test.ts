import { describe, expect, it } from 'vitest';
import { isTopYouthTalent, youthCoachQuoteKey } from '../src/core/youthQuotes';
import type { Player, YouthProspect } from '../src/core/model/types';

function prospect(overrides: Partial<YouthProspect> & { position?: Player['position'] }): YouthProspect {
    const position = overrides.position ?? 'PG';
    return {
        player: {
            id: 'YTH-TEST-1',
            firstName: 'Test',
            lastName: 'Player',
            nationality: 'CZE',
            age: 17,
            heightCm: 190,
            position,
            attributes: {
                shooting2: 50,
                shooting3: 50,
                freeThrows: 50,
                passing: 50,
                dribbling: 50,
                defense: 50,
                rebounding: 50,
                blocking: 50,
                stealing: 50,
                speed: 50,
                stamina: 50,
                iq: 50,
            },
            potential: 90,
            fatigue: 0,
            morale: 75,
            injury: null,
            teamId: null,
            contract: null,
        },
        starMin: 3,
        starMax: 4,
        quoteIndex: 2,
        decideByRound: 16,
        academySeasons: 0,
        ...overrides,
    };
}

describe('youthCoachQuoteKey', () => {
    it('uses position quotes for marquee academy talents', () => {
        expect(youthCoachQuoteKey(prospect({ position: 'PG', starMin: 4, starMax: 5 }))).toBe('youth.quote.top.PG');
        expect(youthCoachQuoteKey(prospect({ position: 'SG', starMax: 4.5 }))).toBe('youth.quote.top.SG');
        expect(youthCoachQuoteKey(prospect({ position: 'PF', starMax: 4.5 }))).toBe('youth.quote.top.PF');
        expect(youthCoachQuoteKey(prospect({ position: 'C', starMax: 4.5 }))).toBe('youth.quote.top.C');
    });

    it('falls back to generic quotes for non-marquee or unsupported positions', () => {
        expect(youthCoachQuoteKey(prospect({ position: 'PG', starMin: 3, starMax: 4, quoteIndex: 2 }))).toBe('youth.quote.2');
        expect(youthCoachQuoteKey(prospect({ position: 'SF', starMax: 4.5, quoteIndex: 1 }))).toBe('youth.quote.1');
    });
});

describe('isTopYouthTalent', () => {
    it('flags 4+ star floor or 4.5+ star ceiling', () => {
        expect(isTopYouthTalent(prospect({ starMin: 4, starMax: 5 }))).toBe(true);
        expect(isTopYouthTalent(prospect({ starMin: 3.5, starMax: 4.5 }))).toBe(true);
        expect(isTopYouthTalent(prospect({ starMin: 3, starMax: 4 }))).toBe(false);
    });
});
