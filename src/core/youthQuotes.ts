import type { TranslationKey } from '../i18n';
import type { Position, YouthProspect } from './model/types';

const TOP_TALENT_POSITION_QUOTES: Partial<Record<Position, TranslationKey>> = {
    PG: 'youth.quote.top.PG',
    SG: 'youth.quote.top.SG',
    PF: 'youth.quote.top.PF',
    C: 'youth.quote.top.C',
};

/** Marquee academy talents with a 4+ star floor or 4.5+ star ceiling. */
export function isTopYouthTalent(prospect: YouthProspect): boolean {
    return prospect.starMax >= 4.5 || prospect.starMin >= 4;
}

export function youthCoachQuoteKey(prospect: YouthProspect): TranslationKey {
    if (isTopYouthTalent(prospect)) {
        const key = TOP_TALENT_POSITION_QUOTES[prospect.player.position];
        if (key) {
            return key;
        }
    }
    return `youth.quote.${prospect.quoteIndex}` as TranslationKey;
}
