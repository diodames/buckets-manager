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

/** Display name for a configured team (real NBL club names are not localized). */
export function teamDisplayName(team: TeamDef): string {
    return team.shortName;
}

export function teamFullName(team: TeamDef): string {
    return team.name;
}

export function teamCityName(team: TeamDef): string {
    return team.city;
}

/** Home arena name for a configured team (real NBL hall names are not localized). */
export function teamArenaName(team: TeamDef): string {
    return team.arenaName;
}

export type { TranslationKey };
