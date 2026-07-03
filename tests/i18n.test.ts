import { afterEach, describe, expect, it } from 'vitest';
import { cs } from '../src/i18n/cs';
import { en } from '../src/i18n/en';
import { getLocale, setLocale, t } from '../src/i18n';

afterEach(() => {
    setLocale('cs');
});

describe('i18n', () => {
    it('czech covers every english key with matching params', () => {
        for (const key of Object.keys(en) as Array<keyof typeof en>) {
            const czech = cs[key];
            expect(czech, `missing cs translation for ${key}`).toBeTypeOf('string');
            const params = (template: string) => [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
            expect(params(czech), `param mismatch in ${key}`).toEqual(params(en[key]));
        }
    });

    it('interpolates params and switches locales', () => {
        setLocale('en');
        expect(getLocale()).toBe('en');
        expect(t('common.round', { round: 5 })).toBe('Round 5');
        setLocale('cs');
        expect(t('common.round', { round: 5 })).toBe('5. kolo');
    });

    it('throws on missing params', () => {
        expect(() => t('common.round')).toThrow();
    });
});
