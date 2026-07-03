import type { TeamDef } from '../config/league';
import { cs } from './cs';
import { en, type TranslationKey } from './en';

export type Locale = 'cs' | 'en';

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { cs, en };

let currentLocale: Locale = 'cs';

export function getLocale(): Locale {
    return currentLocale;
}

export function setLocale(locale: Locale): void {
    currentLocale = locale;
}

/**
 * Looks up a translation and interpolates `{param}` placeholders. Throws on
 * unknown keys and on missing params - a typo should surface immediately,
 * not render as an empty string.
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
    const template = dictionaries[currentLocale][key];
    if (template === undefined) {
        throw new Error(`i18n: missing key '${key}' in locale '${currentLocale}'`);
    }
    return template.replace(/\{(\w+)\}/g, (_, name: string) => {
        const value = params?.[name];
        if (value === undefined) {
            throw new Error(`i18n: key '${key}' expects param '{${name}}'`);
        }
        return String(value);
    });
}

/** Locale-aware display name for a configured team, e.g. "Sokoli Praha". */
export function teamDisplayName(team: TeamDef, locale: Locale = currentLocale): string {
    return locale === 'cs' ? `${team.nameCs} ${team.cityCs}` : `${team.cityEn} ${team.nameEn}`;
}

export function teamCityName(team: TeamDef, locale: Locale = currentLocale): string {
    return locale === 'cs' ? team.cityCs : team.cityEn;
}

export type { TranslationKey };
